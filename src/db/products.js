import { query, run, runBatch } from './database';
import { newId } from './id';
import { createDefaultVarieties, hasConfiguredVarieties } from './varieties';
import { getCurrentTenantId, getCurrentBranchId, requireBranchId, getCurrentUser, branchFilter } from './session';
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
function toCost(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!(n >= 0)) throw new Error('Cost price cannot be negative.');
  return n;
}

// A barcode (or SKU) must identify ONE product - otherwise scanning it cannot
// know which one you meant. Checked among this business's live products.
function assertCodeUnique(field, value, exceptId = null) {
  const v = (value || '').trim();
  if (!v) return;
  const hit = query(
    `SELECT name FROM products WHERE tenant_id = ? AND deleted_at IS NULL AND LOWER(${field}) = LOWER(?) AND id != ?`,
    [getCurrentTenantId(), v, exceptId || '']
  )[0];
  if (hit) throw new Error(`${field === 'barcode' ? 'Barcode' : 'SKU'} "${v}" is already used by "${hit.name}".`);
}
const sameCode = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

export async function addProduct({ name, barcode, sku, categoryId, quantity, base_price, cost_price }) {
  assertCodeUnique('barcode', barcode);
  assertCodeUnique('sku', sku);
  const id = newId('prod');
  const branchId = getCurrentBranchId();
  await run(
    `INSERT INTO products (id, tenant_id, name, barcode, sku, category_id, quantity, base_price, cost_price)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, getCurrentTenantId(), name, barcode || null, sku || null, categoryId || null, Number(base_price) || 0, toCost(cost_price)]
  );
  await createDefaultVarieties(id, Number(base_price) || 0);
  const openingStock = Number(quantity) || 0;
  if (branchId && openingStock > 0) await setBranchStock(id, branchId, openingStock);
  return id;
}

// Stock is only edited when a specific branch is selected; the other fields
// are shared catalog data.
export async function updateProduct(id, { name, barcode, sku, categoryId, quantity, base_price, cost_price }) {
  // Only codes that are being CHANGED are checked, so editing a product whose
  // code was already duplicated by older data does not suddenly fail.
  const current = query(`SELECT barcode, sku FROM products WHERE id = ? AND tenant_id = ?`, [id, getCurrentTenantId()])[0];
  if (current) {
    if (!sameCode(barcode, current.barcode)) assertCodeUnique('barcode', barcode, id);
    if (!sameCode(sku, current.sku)) assertCodeUnique('sku', sku, id);
  }
  await run(
    `UPDATE products
       SET name = ?, barcode = ?, sku = ?, category_id = ?, base_price = ?, cost_price = ?, updated_at = datetime('now')
     WHERE id = ? AND tenant_id = ?`,
    [name, barcode || null, sku || null, categoryId || null, Number(base_price) || 0, toCost(cost_price), id, getCurrentTenantId()]
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
      sql: `INSERT INTO stock_adjustments (id, tenant_id, product_id, branch_id, quantity_added, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [newId('adj'), tenantId, productId, branchId, qty, note || null, getCurrentUser()?.id ?? null],
    },
  ]);
}

export function listStockAdjustments(productId) {
  const bf = branchFilter('a.branch_id');
  return query(
    `SELECT a.*, b.name AS branch_name, u.name AS created_by_name
     FROM stock_adjustments a
     LEFT JOIN branches b ON b.id = a.branch_id
     LEFT JOIN users u ON u.id = a.created_by
     WHERE a.product_id = ? AND a.tenant_id = ?${bf.sql}
     ORDER BY a.created_at DESC, a.rowid DESC LIMIT 50`,
    [productId, getCurrentTenantId(), ...bf.params]
  );
}

export async function deleteProduct(id) {
  await run(`UPDATE products SET deleted_at = datetime('now') WHERE id = ? AND tenant_id = ?`, [id, getCurrentTenantId()]);
}
