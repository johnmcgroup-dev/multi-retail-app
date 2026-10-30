import { useState } from 'react';
import { getSalesRevenue, getCashCollected } from '../../db/sales';
import { getTotalExpenses, getExpenseTotalsByCategory } from '../../db/expenses';
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
  const branchId = getCurrentBranchId();
  const scopeName = branchId ? listBranches({ includeInactive: true }).find((b) => b.id === branchId)?.name : null;

  const range = { from: from || null, to: to || null };
  const revenue = getSalesRevenue(range);
  const cashCollected = getCashCollected(range);
  const totalExpenses = getTotalExpenses(range);
  const netProfit = revenue - totalExpenses;
  const byCategory = getExpenseTotalsByCategory(range);
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

      <div className="report-summary-grid">
        <div className="report-card">
          <span className="report-card-label">Sales Revenue</span>
          <strong>{formatMoney(revenue, currencyCode)}</strong>
          <span className="modal-hint">Value of everything sold in this range (includes unpaid/credit sales)</span>
        </div>
        <div className="report-card">
          <span className="report-card-label">Cash Collected</span>
          <strong>{formatMoney(cashCollected, currencyCode)}</strong>
          <span className="modal-hint">Money actually received in this range, from sales and balance payments</span>
        </div>
        <div className="report-card">
          <span className="report-card-label">Total Expenses</span>
          <strong>{formatMoney(totalExpenses, currencyCode)}</strong>
        </div>
        <div className={`report-card ${netProfit >= 0 ? 'report-card-positive' : 'report-card-negative'}`}>
          <span className="report-card-label">Net Profit (Revenue − Expenses)</span>
          <strong>{formatMoney(netProfit, currencyCode)}</strong>
        </div>
      </div>

      {!branchId && (
        <>
          <h3>By Branch</h3>
          <table className="product-table">
            <thead><tr><th>Branch</th><th>Revenue</th><th>Expenses</th><th>Net</th></tr></thead>
            <tbody>
              {breakdown.map((row) => (
                <tr key={row.branch_id}>
                  <td>{row.branch_name}</td>
                  <td>{formatMoney(row.revenue, currencyCode)}</td>
                  <td>{formatMoney(row.expenses, currencyCode)}</td>
                  <td className={row.net >= 0 ? 'ledger-credit' : 'ledger-debit'}>{formatMoney(row.net, currencyCode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
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
                <td>{formatMoney(row.total, currencyCode)}</td>
                <td>{totalExpenses > 0 ? `${((row.total / totalExpenses) * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
