import { query } from './database';
import { DEMO_TENANT_ID } from './products';

export function searchProducts(term) {
  const t = `%${term.trim()}%`;
  if (!term.trim()) {
    return query(
      `SELECT p.*, c.name AS category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.tenant_id = ? AND p.deleted_at IS NULL
       ORDER BY p.name LIMIT 20`,
      [DEMO_TENANT_ID]
    );
  }

  return query(
    `SELECT p.*, c.name AS category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL
       AND (
         p.name LIKE ? COLLATE NOCASE OR
         p.barcode LIKE ? COLLATE NOCASE OR
         p.sku LIKE ? COLLATE NOCASE OR
         c.name LIKE ? COLLATE NOCASE
       )
     ORDER BY p.name LIMIT 20`,
    [DEMO_TENANT_ID, t, t, t, t]
  );
}
