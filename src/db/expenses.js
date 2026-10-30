import { query, run } from './database';
import { newId } from './id';
import { getCurrentTenantId, getCurrentBranchId, branchFilter } from './session';

const PLACEHOLDER_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Supplies', 'Other'];

// --- Expense categories (shared by the whole tenant, separate from product categories) ---

export function listExpenseCategories() {
  return query(`SELECT * FROM expense_categories WHERE tenant_id = ? ORDER BY name`, [getCurrentTenantId()]);
}

export async function addExpenseCategory(name) {
  const id = newId('ecat');
  await run(`INSERT INTO expense_categories (id, tenant_id, name) VALUES (?, ?, ?)`, [id, getCurrentTenantId(), name]);
  return id;
}

export async function updateExpenseCategory(id, name) {
  await run(`UPDATE expense_categories SET name = ? WHERE id = ? AND tenant_id = ?`, [name, id, getCurrentTenantId()]);
}

export async function deleteExpenseCategory(id) {
  await run(`UPDATE expenses SET category_id = NULL WHERE category_id = ? AND tenant_id = ?`, [id, getCurrentTenantId()]);
  await run(`DELETE FROM expense_categories WHERE id = ? AND tenant_id = ?`, [id, getCurrentTenantId()]);
}

export async function ensureSeedExpenseCategories() {
  const existing = listExpenseCategories();
  if (existing.length > 0) return;
  for (const name of PLACEHOLDER_CATEGORIES) {
    await addExpenseCategory(name);
  }
}

// --- Expenses: each belongs to ONE branch ---

// from/to are 'YYYY-MM-DD' strings (inclusive) or null for no bound on that side.
export function listExpenses({ from = null, to = null, categoryId = null } = {}) {
  const clauses = [`e.tenant_id = ?`];
  const params = [getCurrentTenantId()];
  if (from) { clauses.push(`e.expense_date >= ?`); params.push(from); }
  if (to) { clauses.push(`e.expense_date <= ?`); params.push(to); }
  if (categoryId) { clauses.push(`e.category_id = ?`); params.push(categoryId); }
  const bf = branchFilter('e.branch_id');

  return query(
    `SELECT e.*, c.name AS category_name, b.name AS branch_name
     FROM expenses e
     LEFT JOIN expense_categories c ON c.id = e.category_id
     LEFT JOIN branches b ON b.id = e.branch_id
     WHERE ${clauses.join(' AND ')}${bf.sql}
     ORDER BY e.expense_date DESC, e.created_at DESC, e.rowid DESC`,
    [...params, ...bf.params]
  );
}

// When working in a specific branch the expense goes to that branch (a
// staff member cannot file it against another one). Only when viewing all
// branches is `branchId` taken from the caller.
export async function addExpense({ categoryId, amount, description, paymentMethod, expenseDate, branchId = null }) {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error('Amount must be greater than zero.');

  const branch = getCurrentBranchId() || branchId;
  if (!branch) throw new Error('Choose which branch this expense belongs to.');
  const ok = query(`SELECT id FROM branches WHERE id = ? AND tenant_id = ?`, [branch, getCurrentTenantId()]);
  if (ok.length === 0) throw new Error('Branch not found in this business.');

  const id = newId('exp');
  await run(
    `INSERT INTO expenses (id, tenant_id, branch_id, category_id, amount, description, payment_method, expense_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, getCurrentTenantId(), branch, categoryId || null, amt, description || null, paymentMethod || 'cash', expenseDate]
  );
  return id;
}

export async function updateExpense(id, { categoryId, amount, description, paymentMethod, expenseDate }) {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error('Amount must be greater than zero.');
  const bf = branchFilter('branch_id');

  await run(
    `UPDATE expenses
       SET category_id = ?, amount = ?, description = ?, payment_method = ?, expense_date = ?
     WHERE id = ? AND tenant_id = ?${bf.sql}`,
    [categoryId || null, amt, description || null, paymentMethod || 'cash', expenseDate, id, getCurrentTenantId(), ...bf.params]
  );
}

export async function deleteExpense(id) {
  const bf = branchFilter('branch_id');
  await run(`DELETE FROM expenses WHERE id = ? AND tenant_id = ?${bf.sql}`, [id, getCurrentTenantId(), ...bf.params]);
}

// --- Aggregates, used by the Reports page ---

export function getExpenseTotalsByCategory({ from = null, to = null } = {}) {
  const clauses = [`e.tenant_id = ?`];
  const params = [getCurrentTenantId()];
  if (from) { clauses.push(`e.expense_date >= ?`); params.push(from); }
  if (to) { clauses.push(`e.expense_date <= ?`); params.push(to); }
  const bf = branchFilter('e.branch_id');

  return query(
    `SELECT COALESCE(c.name, 'Uncategorized') AS category_name, SUM(e.amount) AS total
     FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE ${clauses.join(' AND ')}${bf.sql}
     GROUP BY COALESCE(c.id, 'none')
     ORDER BY total DESC`,
    [...params, ...bf.params]
  );
}

export function getTotalExpenses({ from = null, to = null } = {}) {
  const clauses = [`tenant_id = ?`];
  const params = [getCurrentTenantId()];
  if (from) { clauses.push(`expense_date >= ?`); params.push(from); }
  if (to) { clauses.push(`expense_date <= ?`); params.push(to); }
  const bf = branchFilter('branch_id');

  const rows = query(`SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE ${clauses.join(' AND ')}${bf.sql}`, [...params, ...bf.params]);
  return rows[0]?.total || 0;
}
