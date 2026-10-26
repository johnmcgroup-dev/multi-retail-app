import { query, run } from './database';
import { newId } from './id';
import { DEMO_TENANT_ID } from './products';

const PLACEHOLDER_CATEGORIES = ['General', 'Beverages', 'Groceries', 'Household'];

export function listCategories() {
  return query(`SELECT * FROM categories WHERE tenant_id = ? ORDER BY name`, [DEMO_TENANT_ID]);
}

export async function addCategory(name) {
  const id = newId('cat');
  await run(`INSERT INTO categories (id, tenant_id, name) VALUES (?, ?, ?)`, [
    id,
    DEMO_TENANT_ID,
    name,
  ]);
  return id;
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
