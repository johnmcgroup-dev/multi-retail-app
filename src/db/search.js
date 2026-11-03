import { query } from './database';
import { getCurrentTenantId, getCurrentBranchId } from './session';
import { PRODUCT_COLUMNS, productStockSelect } from './stock';

// Stock shown in results is for the branch being worked in.
export function searchProducts(term) {
  const stock = productStockSelect(getCurrentBranchId());
  const tenantId = getCurrentTenantId();
  const trimmed = term.trim();
  const t = `%${trimmed}%`;
  const base = `SELECT ${PRODUCT_COLUMNS}, c.name AS category_name, ${stock.sql}
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL`;

  if (!trimmed) {
    return query(`${base} ORDER BY p.name LIMIT 20`, [...stock.params, tenantId]);
  }
  return query(
    `${base}
       AND (
         p.name LIKE ? COLLATE NOCASE OR
         p.barcode LIKE ? COLLATE NOCASE OR
         p.sku LIKE ? COLLATE NOCASE OR
         c.name LIKE ? COLLATE NOCASE
       )
     ORDER BY p.name LIMIT 20`,
    [...stock.params, tenantId, t, t, t, t]
  );
}

// Exact match on a barcode (which is also what a scanned QR code's text lands
// in) or SKU, ignoring case. Returns every match so the caller can refuse to
// guess when older data has the same code on two products.
export function findProductsByCode(code) {
  const c = String(code || '').trim();
  if (!c) return [];
  const stock = productStockSelect(getCurrentBranchId());
  return query(
    `SELECT ${PRODUCT_COLUMNS}, c.name AS category_name, ${stock.sql}
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND (LOWER(p.barcode) = LOWER(?) OR LOWER(p.sku) = LOWER(?))
     ORDER BY p.created_at ASC, p.rowid ASC`,
    [...stock.params, getCurrentTenantId(), c, c]
  );
}
