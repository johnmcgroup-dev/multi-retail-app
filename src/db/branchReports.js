import { query } from './database';
import { getCurrentTenantId } from './session';

// Revenue and expenses side by side for EVERY branch of the tenant. Used by
// the Reports page when viewing all branches. Deliberately ignores the
// current-branch filter - its whole purpose is the cross-branch comparison.
export function getBranchBreakdown({ from = null, to = null } = {}) {
  const tenantId = getCurrentTenantId();

  const salesClauses = ['tenant_id = ?'];
  const salesParams = [tenantId];
  if (from) { salesClauses.push('date(created_at) >= ?'); salesParams.push(from); }
  if (to) { salesClauses.push('date(created_at) <= ?'); salesParams.push(to); }
  const revenue = Object.fromEntries(
    query(`SELECT branch_id, SUM(total) AS total FROM sales WHERE ${salesClauses.join(' AND ')} GROUP BY branch_id`, salesParams)
      .map((r) => [r.branch_id, r.total])
  );

  const expClauses = ['tenant_id = ?'];
  const expParams = [tenantId];
  if (from) { expClauses.push('expense_date >= ?'); expParams.push(from); }
  if (to) { expClauses.push('expense_date <= ?'); expParams.push(to); }
  const expenses = Object.fromEntries(
    query(`SELECT branch_id, SUM(amount) AS total FROM expenses WHERE ${expClauses.join(' AND ')} GROUP BY branch_id`, expParams)
      .map((r) => [r.branch_id, r.total])
  );

  return query(`SELECT id, name, is_active FROM branches WHERE tenant_id = ? ORDER BY created_at ASC, rowid ASC`, [tenantId])
    .map((b) => ({
      branch_id: b.id,
      branch_name: b.name + (b.is_active ? '' : ' (inactive)'),
      revenue: revenue[b.id] || 0,
      expenses: expenses[b.id] || 0,
      net: (revenue[b.id] || 0) - (expenses[b.id] || 0),
    }));
}
