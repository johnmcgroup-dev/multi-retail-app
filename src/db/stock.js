import { query, run, runBatch } from './database';
import { newId } from './id';
import { getCurrentTenantId, getCurrentUser, getCurrentBranchId, canAccessPage } from './session';

// Every product query selects these columns (NOT products.quantity, which is
// a legacy column) plus a stock figure computed from branch_stock.
export const PRODUCT_COLUMNS =
  'p.id, p.tenant_id, p.name, p.barcode, p.sku, p.category_id, p.base_price, p.created_at, p.updated_at, p.deleted_at';

// SQL fragment giving a product's stock as `quantity`: at one branch when a
// branch id is given, or summed over every branch when it is null.
// NOTE the fragment contains a `?` only for the branch case - callers must put
// `params` BEFORE their WHERE-clause params, matching text order.
export function productStockSelect(branchId) {
  if (branchId) {
    return {
      sql: `(SELECT COALESCE(SUM(bs.quantity), 0) FROM branch_stock bs WHERE bs.product_id = p.id AND bs.branch_id = ?) AS quantity`,
      params: [branchId],
    };
  }
  return {
    sql: `(SELECT COALESCE(SUM(bs.quantity), 0) FROM branch_stock bs WHERE bs.product_id = p.id) AS quantity`,
    params: [],
  };
}

// Adds `delta` (may be negative) to a product's stock at a branch, creating
// the row if it doesn't exist yet. Returned as a statement so callers can
// include it in a runBatch.
export function stockChangeStatement(productId, branchId, tenantId, delta) {
  return {
    sql: `INSERT INTO branch_stock (product_id, branch_id, tenant_id, quantity) VALUES (?, ?, ?, ?)
          ON CONFLICT(product_id, branch_id) DO UPDATE SET quantity = branch_stock.quantity + excluded.quantity`,
    params: [productId, branchId, tenantId, delta],
  };
}

export function getBranchStock(productId, branchId) {
  const rows = query(`SELECT quantity FROM branch_stock WHERE product_id = ? AND branch_id = ?`, [productId, branchId]);
  return rows[0]?.quantity || 0;
}

export async function changeBranchStock(productId, branchId, delta) {
  const s = stockChangeStatement(productId, branchId, getCurrentTenantId(), delta);
  await run(s.sql, s.params);
}

export async function setBranchStock(productId, branchId, quantity) {
  const qty = Number(quantity);
  if (!(qty >= 0)) throw new Error('Stock quantity cannot be negative.');
  await run(
    `INSERT INTO branch_stock (product_id, branch_id, tenant_id, quantity) VALUES (?, ?, ?, ?)
     ON CONFLICT(product_id, branch_id) DO UPDATE SET quantity = excluded.quantity`,
    [productId, branchId, getCurrentTenantId(), qty]
  );
}

// One row per branch of the tenant (including 0-stock ones) for a product.
export function listProductStockByBranch(productId) {
  return query(
    `SELECT b.id AS branch_id, b.name AS branch_name, b.is_active, COALESCE(bs.quantity, 0) AS quantity
     FROM branches b LEFT JOIN branch_stock bs ON bs.branch_id = b.id AND bs.product_id = ?
     WHERE b.tenant_id = ? ORDER BY b.created_at ASC, b.rowid ASC`,
    [productId, getCurrentTenantId()]
  );
}

// Products that actually have stock at a branch - what can be transferred out.
export function listProductsStockAtBranch(branchId) {
  return query(
    `SELECT p.id, p.name, bs.quantity
     FROM products p JOIN branch_stock bs ON bs.product_id = p.id AND bs.branch_id = ?
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND bs.quantity > 0
     ORDER BY p.name ASC`,
    [branchId, getCurrentTenantId()]
  );
}

function ownBranch(id) {
  return query(`SELECT * FROM branches WHERE id = ? AND tenant_id = ?`, [id, getCurrentTenantId()])[0] || null;
}

// Moves stock from one branch to another within the SAME tenant. The three
// writes (take from source, add to destination, log it) are one atomic batch.
export async function transferStock({ productId, fromBranchId, toBranchId, quantity, note = '' }) {
  const user = getCurrentUser();
  const tenantId = getCurrentTenantId();
  if (!user || !canAccessPage(user.role, 'transfers')) {
    throw new Error('You do not have permission to transfer stock.');
  }

  const qty = Number(quantity);
  if (!(qty > 0)) throw new Error('Quantity to transfer must be greater than zero.');
  if (fromBranchId === toBranchId) throw new Error('Choose two different branches.');

  const from = ownBranch(fromBranchId);
  const to = ownBranch(toBranchId);
  if (!from || !to) throw new Error('Branch not found in this business.');
  if (!to.is_active) throw new Error('The destination branch is inactive.');

  // A manager only moves stock out of THEIR OWN branch.
  if (user.role === 'manager' && fromBranchId !== getCurrentBranchId()) {
    throw new Error('Managers can only transfer stock out of their own branch.');
  }

  const product = query(
    `SELECT id FROM products WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [productId, tenantId]
  )[0];
  if (!product) throw new Error('Product not found in this business.');

  const available = getBranchStock(productId, fromBranchId);
  if (qty > available) {
    throw new Error(`Not enough stock at ${from.name}. Only ${available} available.`);
  }

  await runBatch([
    stockChangeStatement(productId, fromBranchId, tenantId, -qty),
    stockChangeStatement(productId, toBranchId, tenantId, qty),
    {
      sql: `INSERT INTO stock_transfers (id, tenant_id, product_id, from_branch_id, to_branch_id, quantity, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [newId('xfer'), tenantId, productId, fromBranchId, toBranchId, qty, note || null, user.id],
    },
  ]);
}

// Transfers involving the branch being viewed (both directions), or every
// transfer in the tenant when viewing all branches.
export function listTransfers() {
  const branchId = getCurrentBranchId();
  return query(
    `SELECT t.*, p.name AS product_name, fb.name AS from_branch_name, tb.name AS to_branch_name, u.name AS created_by_name
     FROM stock_transfers t
     JOIN products p ON p.id = t.product_id
     JOIN branches fb ON fb.id = t.from_branch_id
     JOIN branches tb ON tb.id = t.to_branch_id
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.tenant_id = ? ${branchId ? 'AND (t.from_branch_id = ? OR t.to_branch_id = ?)' : ''}
     ORDER BY t.created_at DESC, t.rowid DESC LIMIT 200`,
    branchId ? [getCurrentTenantId(), branchId, branchId] : [getCurrentTenantId()]
  );
}
