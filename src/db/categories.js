import { query, run } from './database';
import { newId } from './id';
import { getCurrentTenantId } from './session';

const PLACEHOLDER_CATEGORIES = ['General', 'Beverages', 'Groceries', 'Household'];

export function listCategories() {
  return query(`SELECT * FROM categories WHERE tenant_id = ? ORDER BY name`, [getCurrentTenantId()]);
}

export async function addCategory(name) {
  const id = newId('cat');
  await run(`INSERT INTO categories (id, tenant_id, name) VALUES (?, ?, ?)`, [
    id,
    getCurrentTenantId(),
    name,
  ]);
  return id;
}

export async function updateCategory(id, name) {
  await run(`UPDATE categories SET name = ? WHERE id = ? AND tenant_id = ?`, [name, id, getCurrentTenantId()]);
}

// Deleting a category must not break the products that used it - they fall
// back to "No category" rather than the delete failing or leaving a dangling reference.
export async function deleteCategory(id) {
  await run(`UPDATE products SET category_id = NULL WHERE category_id = ?`, [id]);
  await run(`DELETE FROM categories WHERE id = ? AND tenant_id = ?`, [id, getCurrentTenantId()]);
}

// Seeds a few placeholder categories the first time, so the Product page isn't
// empty. You can rename or delete these from the Category page once that's built.
export async function ensureSeedCategories() {
  const existing = listCategories();
  if (existing.length > 0) return;
  for (const name of PLACEHOLDER_CATEGORIES) {
    await addCategory(name);
  }
}
