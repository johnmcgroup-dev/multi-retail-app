import { useState } from 'react';
import { getSalesRevenue, getCashCollected } from '../../db/sales';
import { getTotalExpenses, getExpenseTotalsByCategory } from '../../db/expenses';
import { getCostOfGoodsSold, getProfitByProduct, getStockValue } from '../../db/profit';
import { getBranchBreakdown } from '../../db/branchReports';
import { listBranches } from '../../db/branches';
import { getCurrentBranchId } from '../../db/session';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const currencyCode = getCompanySettings().currency_code;
  const money = (n) => formatMoney(n, currencyCode);
  const branchId = getCurrentBranchId();
  const scopeName = branchId ? listBranches({ includeInactive: true }).find((b) => b.id === branchId)?.name : null;

  const range = { from: from || null, to: to || null };
  const revenue = getSalesRevenue(range);
  const { cogs, unknownRevenue, unknownLines } = getCostOfGoodsSold(range);
  const grossProfit = revenue - cogs;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : null;
  const cashCollected = getCashCollected(range);
  const totalExpenses = getTotalExpenses(range);
  const netProfit = grossProfit - totalExpenses;
  const byCategory = getExpenseTotalsByCategory(range);
  const byProduct = getProfitByProduct(range);
  const stock = getStockValue();
  const breakdown = branchId ? [] : getBranchBreakdown(range);

  return (
    <div>
      <header>
        <h1>Reports</h1>
        <p className="subtitle">
          Profit &amp; Loss for <strong>{scopeName ? `the ${scopeName} branch` : 'all branches combined'}</strong>.
          Use the branch selector in the menu bar to switch.
        </p>
      </header>

      <div className="expense-filters">
        <label className="modal-label">From</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="modal-label">To</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {unknownLines > 0 && (
        <p className="modal-hint legacy-data-notice cost-warning">
          <strong>Profit is overstated.</strong> {unknownLines} sale line(s) in this period ({money(unknownRevenue)} of sales) have no
          cost on record, so they count as if the goods cost nothing. Give those products a cost price (Products → open
          the product → Edit), or restock them through a purchase order, so future sales carry a cost.
        </p>
      )}

      <div className="report-summary-grid">
        <div className="report-card">
          <span className="report-card-label">Sales Revenue</span>
          <strong>{money(revenue)}</strong>
          <span className="modal-hint">Value of everything sold (includes unpaid/credit sales)</span>
        </div>
        <div className="report-card">
          <span className="report-card-label">Cost of Goods Sold</span>
          <strong>{money(cogs)}</strong>
          <span className="modal-hint">What the items you sold cost you, at the time of each sale</span>
        </div>
        <div className={`report-card ${grossProfit >= 0 ? 'report-card-positive' : 'report-card-negative'}`}>
          <span className="report-card-label">Gross Profit</span>
          <strong>{money(grossProfit)}</strong>
          <span className="modal-hint">{margin == null ? 'No sales in this range' : `${margin.toFixed(1)}% of revenue`}</span>
        </div>
        <div className="report-card">
          <span className="report-card-label">Total Expenses</span>
          <strong>{money(totalExpenses)}</strong>
        </div>
        <div className={`report-card ${netProfit >= 0 ? 'report-card-positive' : 'report-card-negative'}`}>
          <span className="report-card-label">Net Profit (Gross Profit − Expenses)</span>
          <strong>{money(netProfit)}</strong>
        </div>
        <div className="report-card">
          <span className="report-card-label">Cash Collected</span>
          <strong>{money(cashCollected)}</strong>
          <span className="modal-hint">Money actually received, from sales and balance payments</span>
        </div>
        <div className="report-card">
          <span className="report-card-label">Stock Value (at cost, today)</span>
          <strong>{money(stock.value)}</strong>
          <span className="modal-hint">
            {stock.unknownUnits > 0 ? `${stock.unknownUnits} unit(s) have no cost and are not included` : 'What the stock on hand cost you'}
          </span>
        </div>
      </div>

      {!branchId && (
        <>
          <h3>By Branch</h3>
          <table className="product-table">
            <thead><tr><th>Branch</th><th>Revenue</th><th>Cost of goods</th><th>Gross profit</th><th>Expenses</th><th>Net</th></tr></thead>
            <tbody>
              {breakdown.map((row) => (
                <tr key={row.branch_id}>
                  <td>{row.branch_name}</td>
                  <td>{money(row.revenue)}</td>
                  <td>{money(row.cogs)}</td>
                  <td>{money(row.gross)}</td>
                  <td>{money(row.expenses)}</td>
                  <td className={row.net >= 0 ? 'ledger-credit' : 'ledger-debit'}>{money(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>Profit by Product</h3>
      {byProduct.length === 0 ? (
        <p className="empty-state">No sales in this range.</p>
      ) : (
        <table className="product-table">
          <thead><tr><th>Product</th><th>Revenue</th><th>Cost</th><th>Gross profit</th><th>Margin</th><th></th></tr></thead>
          <tbody>
            {byProduct.map((r) => (
              <tr key={r.product_id}>
                <td>{r.product_name}</td>
                <td>{money(r.revenue)}</td>
                <td>{money(r.cost)}</td>
                <td className={r.profit >= 0 ? 'ledger-credit' : 'ledger-debit'}>{money(r.profit)}</td>
                <td>{r.margin == null ? '—' : `${(r.margin * 100).toFixed(1)}%`}</td>
                <td>{r.unknown_lines > 0 ? <span className="setup-badge">{r.unknown_lines} line(s) with no cost</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Expenses by Category</h3>
      {byCategory.length === 0 ? (
        <p className="empty-state">No expenses recorded for this range.</p>
      ) : (
        <table className="product-table">
          <thead><tr><th>Category</th><th>Total</th><th>% of Expenses</th></tr></thead>
          <tbody>
            {byCategory.map((row) => (
              <tr key={row.category_name}>
                <td>{row.category_name}</td>
                <td>{money(row.total)}</td>
                <td>{totalExpenses > 0 ? `${((row.total / totalExpenses) * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
