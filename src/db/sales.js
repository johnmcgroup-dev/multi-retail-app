import { query } from './database';
import { getCurrentTenantId, branchFilter } from './session';

// Everything here is scoped to the current tenant AND the current branch
// (or all branches combined, for owner/admin viewing "all").

export function listSales() {
  const bf = branchFilter('s.branch_id');
  return query(
    `SELECT s.*, b.name AS branch_name
     FROM sales s LEFT JOIN branches b ON b.id = s.branch_id
     WHERE s.tenant_id = ?${bf.sql}
     ORDER BY s.created_at DESC, s.rowid DESC`,
    [getCurrentTenantId(), ...bf.params]
  );
}

export function getSale(saleId) {
  const bf = branchFilter('s.branch_id');
  const rows = query(
    `SELECT s.*, b.name AS branch_name
     FROM sales s LEFT JOIN branches b ON b.id = s.branch_id
     WHERE s.id = ? AND s.tenant_id = ?${bf.sql}`,
    [saleId, getCurrentTenantId(), ...bf.params]
  );
  return rows[0] || null;
}

// Items in the order they were added, which is what the invoice's S/N
// numbering (1, 2, 3...) is based on. Only returned for a sale the current
// user is allowed to see.
export function getSaleItems(saleId) {
  if (!getSale(saleId)) return [];
  return query(`SELECT * FROM sale_items WHERE sale_id = ? ORDER BY rowid ASC`, [saleId]);
}

// --- Aggregates, used by the Reports page ---
// from/to are 'YYYY-MM-DD' strings (inclusive) or null for no bound.

// Revenue: the value of what was SOLD in the range, whether or not it was
// fully paid yet (standard P&L treatment).
export function getSalesRevenue({ from = null, to = null } = {}) {
  const clauses = [`tenant_id = ?`];
  const params = [getCurrentTenantId()];
  if (from) { clauses.push(`date(created_at) >= ?`); params.push(from); }
  if (to) { clauses.push(`date(created_at) <= ?`); params.push(to); }
  const bf = branchFilter('branch_id');

  const rows = query(`SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE ${clauses.join(' AND ')}${bf.sql}`, [...params, ...bf.params]);
  return rows[0]?.total || 0;
}

// Cash collected: money that actually came in during the range - from new
// sales (amount_paid + previous_balance_paid) plus standalone payments on old
// balances. A cash-flow figure, distinct from revenue.
export function getCashCollected({ from = null, to = null } = {}) {
  const bf = branchFilter('branch_id');

  const salesClauses = [`tenant_id = ?`];
  const salesParams = [getCurrentTenantId()];
  if (from) { salesClauses.push(`date(created_at) >= ?`); salesParams.push(from); }
  if (to) { salesClauses.push(`date(created_at) <= ?`); salesParams.push(to); }
  const salesRows = query(
    `SELECT COALESCE(SUM(amount_paid), 0) + COALESCE(SUM(previous_balance_paid), 0) AS total
     FROM sales WHERE ${salesClauses.join(' AND ')}${bf.sql}`,
    [...salesParams, ...bf.params]
  );

  const paymentClauses = [`tenant_id = ?`, `type = 'payment'`, `sale_id IS NULL`];
  const paymentParams = [getCurrentTenantId()];
  if (from) { paymentClauses.push(`date(created_at) >= ?`); paymentParams.push(from); }
  if (to) { paymentClauses.push(`date(created_at) <= ?`); paymentParams.push(to); }
  const paymentRows = query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM customer_ledger WHERE ${paymentClauses.join(' AND ')}${bf.sql}`,
    [...paymentParams, ...bf.params]
  );

  return (salesRows[0]?.total || 0) + (paymentRows[0]?.total || 0);
}
