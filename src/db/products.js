import { query, run, runBatch } from './database';
import { newId } from './id';
import { createDefaultVarieties, hasConfiguredVarieties } from './varieties';
import { getCurrentTenantId, getCurrentBranchId, requireBranchId } from './session';
import { PRODUCT_COLUMNS, productStockSelect, setBranchStock, stockChangeStatement } from './stock';

// `quantity` on every product returned here is the stock at the branch being
// viewed, or the combined total across all branches when viewing "all".

export function listProducts() {
  const stock = productStockSelect(getCurrentBranchId());
  const rows = query(
    `SELECT ${PRODUCT_COLUMNS}, c.name AS category_name, ${stock.sql}
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC, p.rowid DESC`,
    [...stock.params, getCurrentTenantId()]
  );
  // Flag products that still need their varieties (other than Piece) set up.
  return rows.map((r) => ({ ...r, varieties_configured: hasConfiguredVarieties(r.id) }));
}

export function getProduct(id) {
  const stock = productStockSelect(getCurrentBranchId());
  const rows = query(
    `SELECT ${PRODUCT_COLUMNS}, c.name AS category_name, ${stock.sql}
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = ? AND p.tenant_id = ?`,
    [...stock.params, id, getCurrentTenantId()]
  );
  return rows[0] || null;
}

// Creates a product AND its full set of varieties. The product itself is
// shared by the whole tenant; any opening stock goes to the branch currently
// selected (when viewing all branches, the product starts with no stock).
export async function addProduct({ name, barcode, sku, categoryId, quantity, base_price }) {
  const id = newId('prod');
  const branchId = getCurrentBranchId();
  await run(
    `INSERT INTO products (id, tenant_id, name, barcode, sku, category_id, quantity, base_price)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, getCurrentTenantId(), name, barcode || null, sku || null, categoryId || null, Number(base_price) || 0]
  );
  await createDefaultVarieties(id, Number(base_price) || 0);
  const openingStock = Number(quantity) || 0;
  if (branchId && openingStock > 0) await setBranchStock(id, branchId, openingStock);
  return id;
}

// Stock is only edited when a specific branch is selected; the other fields
// are shared catalog data.
export async function updateProduct(id, { name, barcode, sku, categoryId, quantity, base_price }) {
  await run(
    `UPDATE products
       SET name = ?, barcode = ?, sku = ?, category_id = ?, base_price = ?, updated_at = datetime('now')
     WHERE id = ? AND tenant_id = ?`,
    [name, barcode || null, sku || null, categoryId || null, Number(base_price) || 0, id, getCurrentTenantId()]
  );
  const branchId = getCurrentBranchId();
  if (branchId && quantity !== undefined && quantity !== '') {
    await setBranchStock(id, branchId, quantity);
  }
}

// Quick stock increase with an audit trail - used by the "Add Stock" button
// in POS. Always applies to the branch being worked in.
export async function addStock(productId, quantityToAdd, note = '') {
  const branchId = requireBranchId();
  const tenantId = getCurrentTenantId();
  const qty = Number(quantityToAdd);
  if (!qty || qty <= 0) throw new Error('Quantity to add must be greater than zero.');

  const exists = query(`SELECT id FROM products WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [productId, tenantId]);
  if (exists.length === 0) throw new Error('Product not found in this business.');

  await runBatch([
    stockChangeStatement(productId, branchId, tenantId, qty),
    {
      sql: `UPDATE products SET updated_at = datetime('now') WHERE id = ?`,
      params: [productId],
    },
    {
      sql: `INSERT INTO stock_adjustments (id, tenant_id, product_id, branch_id, quantity_added, note) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [newId('adj'), tenantId, productId, branchId, qty, note || null],
    },
  ]);
}

export function listStockAdjustments(productId) {
  return query(
    `SELECT * FROM stock_adjustments WHERE product_id = ? AND tenant_id = ? ORDER BY created_at DESC, rowid DESC`,
    [productId, getCurrentTenantId()]
  );
}

export async function deleteProduct(id) {
  await run(`UPDATE products SET deleted_at = datetime('now') WHERE id = ? AND tenant_id = ?`, [id, getCurrentTenantId()]);
}
