import { query } from './database';
import { getCurrentTenantId } from './session';

// Revenue, cost of goods, expenses and profit side by side for EVERY branch of
// the tenant. Used by the Reports page when viewing all branches. Deliberately
// ignores the current-branch filter - its whole purpose is the comparison.
export function getBranchBreakdown({ from = null, to = null } = {}) {
  const tenantId = getCurrentTenantId();

  const salesClauses = ['s.tenant_id = ?'];
  const salesParams = [tenantId];
  if (from) { salesClauses.push('date(s.created_at) >= ?'); salesParams.push(from); }
  if (to) { salesClauses.push('date(s.created_at) <= ?'); salesParams.push(to); }
  const revenue = Object.fromEntries(
    query(`SELECT s.branch_id, SUM(s.total) AS total FROM sales s WHERE ${salesClauses.join(' AND ')} GROUP BY s.branch_id`, salesParams)
      .map((r) => [r.branch_id, r.total])
  );
  const cogs = Object.fromEntries(
    query(
      `SELECT s.branch_id, SUM(CASE WHEN si.cost_known = 1 THEN si.line_cost ELSE 0 END) AS total
       FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE ${salesClauses.join(' AND ')} GROUP BY s.branch_id`,
      salesParams
    ).map((r) => [r.branch_id, r.total])
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
    .map((b) => {
      const rev = revenue[b.id] || 0;
      const cost = cogs[b.id] || 0;
      const exp = expenses[b.id] || 0;
      return {
        branch_id: b.id,
        branch_name: b.name + (b.is_active ? '' : ' (inactive)'),
        revenue: rev,
        cogs: cost,
        gross: rev - cost,
        expenses: exp,
        net: rev - cost - exp,
      };
    });
}
