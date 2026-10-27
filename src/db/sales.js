import { query } from './database';
import { DEMO_TENANT_ID } from './products';

export function listSales() {
  return query(
    `SELECT * FROM sales WHERE tenant_id = ? ORDER BY created_at DESC`,
    [DEMO_TENANT_ID]
  );
}

export function getSale(saleId) {
  const rows = query(`SELECT * FROM sales WHERE id = ?`, [saleId]);
  return rows[0] || null;
}

// Items in the order they were added, which is what the invoice's S/N
// numbering (1, 2, 3...) is based on.
export function getSaleItems(saleId) {
  return query(`SELECT * FROM sale_items WHERE sale_id = ? ORDER BY rowid ASC`, [saleId]);
}
