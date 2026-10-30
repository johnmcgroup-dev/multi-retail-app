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
