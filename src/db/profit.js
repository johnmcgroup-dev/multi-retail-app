import { query } from './database';
import { getCurrentTenantId, branchFilter } from './session';

// All of these respect the current tenant AND branch (or all branches
// combined). from/to are 'YYYY-MM-DD' strings (inclusive) or null.

function saleScope(from, to) {
  const clauses = ['s.tenant_id = ?'];
  const params = [getCurrentTenantId()];
  if (from) { clauses.push('date(s.created_at) >= ?'); params.push(from); }
  if (to) { clauses.push('date(s.created_at) <= ?'); params.push(to); }
  const bf = branchFilter('s.branch_id');
  return { where: clauses.join(' AND ') + bf.sql, params: [...params, ...bf.params] };
}

// Cost of goods sold: what the items that were sold had cost us, frozen on
// each sale line at the time of sale. Lines with no cost on record are counted
// separately (their revenue has no matching cost, so profit on them is unknown).
export function getCostOfGoodsSold({ from = null, to = null } = {}) {
  const { where, params } = saleScope(from, to);
  const r = query(
    `SELECT COALESCE(SUM(CASE WHEN si.cost_known = 1 THEN si.line_cost ELSE 0 END), 0) AS cogs,
            COALESCE(SUM(CASE WHEN si.cost_known = 0 THEN si.line_total ELSE 0 END), 0) AS unknown_revenue,
            COALESCE(SUM(CASE WHEN si.cost_known = 0 THEN 1 ELSE 0 END), 0) AS unknown_lines
     FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE ${where}`,
    params
  )[0];
  return { cogs: r.cogs, unknownRevenue: r.unknown_revenue, unknownLines: r.unknown_lines };
}

// Per product: revenue, cost and gross profit. Profit and margin are worked out
// only from lines whose cost is known; lines without a cost are counted so the
// report can warn about them.
export function getProfitByProduct({ from = null, to = null, limit = 25 } = {}) {
  const { where, params } = saleScope(from, to);
  return query(
    `SELECT si.product_id, MAX(si.product_name) AS product_name,
            SUM(si.line_total) AS revenue,
            SUM(CASE WHEN si.cost_known = 1 THEN si.line_total ELSE 0 END) AS revenue_with_cost,
            SUM(CASE WHEN si.cost_known = 1 THEN si.line_cost ELSE 0 END) AS cost,
            SUM(CASE WHEN si.cost_known = 0 THEN 1 ELSE 0 END) AS unknown_lines
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE ${where}
     GROUP BY si.product_id
     ORDER BY SUM(CASE WHEN si.cost_known = 1 THEN si.line_total - si.line_cost ELSE 0 END) DESC
     LIMIT ?`,
    [...params, limit]
  ).map((r) => {
    const profit = r.revenue_with_cost - r.cost;
    return { ...r, profit, margin: r.revenue_with_cost > 0 ? profit / r.revenue_with_cost : null };
  });
}

// What the stock currently on the shelves is worth at cost (not date-based).
// Units with no cost at all are counted separately instead of valued at zero.
export function getStockValue() {
  const bf = branchFilter('bs.branch_id');
  const r = query(
    `SELECT COALESCE(SUM(bs.quantity * COALESCE(bs.avg_cost, p.cost_price)), 0) AS value,
            COALESCE(SUM(CASE WHEN COALESCE(bs.avg_cost, p.cost_price) IS NULL THEN bs.quantity ELSE 0 END), 0) AS unknown_units
     FROM branch_stock bs JOIN products p ON p.id = bs.product_id
     WHERE bs.tenant_id = ? AND p.deleted_at IS NULL AND bs.quantity > 0${bf.sql}`,
    [getCurrentTenantId(), ...bf.params]
  )[0];
  return { value: r.value, unknownUnits: r.unknown_units };
}
