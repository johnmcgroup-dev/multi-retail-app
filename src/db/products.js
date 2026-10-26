import { query, run } from './database';
import { newId } from './id';
import { createDefaultVarieties } from './varieties';

// Using one fixed demo tenant for now. Real tenant/login handling is a later module.
export const DEMO_TENANT_ID = 'tenant_demo';

export function listProducts() {
  return query(
    `SELECT p.*, c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC`,
    [DEMO_TENANT_ID]
  );
}

export function getProduct(id) {
  const rows = query(`SELECT * FROM products WHERE id = ?`, [id]);
  return rows[0] || null;
}

// Creates a product AND its full set of varieties (Piece, Roll, Bundle, Dozen,
// Packet, Carton + the 5 Half-X varieties) in one step, so every product is
// always ready for the variety editor immediately after creation.
export async function addProduct({ name, barcode, sku, categoryId, quantity, base_price }) {
  const id = newId('prod');
  await run(
    `INSERT INTO products (id, tenant_id, name, barcode, sku, category_id, quantity, base_price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      DEMO_TENANT_ID,
      name,
      barcode || null,
      sku || null,
      categoryId || null,
      Number(quantity) || 0,
      Number(base_price) || 0,
    ]
  );
  await createDefaultVarieties(id);
  return id;
}

export async function deleteProduct(id) {
  await run(`UPDATE products SET deleted_at = datetime('now') WHERE id = ?`, [id]);
}

async function ensureDemoTenant() {
  const rows = query(`SELECT id FROM tenants WHERE id = ?`, [DEMO_TENANT_ID]);
  if (rows.length === 0) {
    await run(`INSERT INTO tenants (id, name) VALUES (?, ?)`, [DEMO_TENANT_ID, 'My Company (demo)']);
  }
}

export async function ensureSeedData() {
  await ensureDemoTenant();
}
