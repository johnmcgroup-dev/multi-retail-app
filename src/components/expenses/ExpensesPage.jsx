import { useEffect, useState } from 'react';
import {
  listExpenses, addExpense, updateExpense, deleteExpense,
  listExpenseCategories, ensureSeedExpenseCategories, getTotalExpenses,
} from '../../db/expenses';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';
import ExpenseCategoriesPage from './ExpenseCategoriesPage';
import { listBranches } from '../../db/branches';
import { getCurrentBranchId } from '../../db/session';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card Payment' },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const [showCategories, setShowCategories] = useState(false);
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');

  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  const currencyCode = getCompanySettings().currency_code;
  const currentBranchId = getCurrentBranchId(); // null = viewing all branches
  const branches = listBranches();
  const [formBranchId, setFormBranchId] = useState('');

  useEffect(() => {
    (async () => {
      await ensureSeedExpenseCategories();
      refresh();
    })();
  }, []);

  function refresh() {
    setCategories(listExpenseCategories());
    setExpenses(listExpenses({ from: from || null, to: to || null, categoryId: filterCategoryId || null }));
  }

  useEffect(() => { refresh(); }, [from, to, filterCategoryId]);

  const total = getTotalExpenses({ from: from || null, to: to || null });

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await addExpense({ categoryId, amount, description, paymentMethod, expenseDate, branchId: formBranchId });
      setAmount(''); setDescription(''); setCategoryId(''); setPaymentMethod('cash'); setExpenseDate(todayStr());
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(exp) {
    setEditingId(exp.id);
    setEditDraft({
      categoryId: exp.category_id || '',
      amount: exp.amount,
      description: exp.description || '',
      paymentMethod: exp.payment_method,
      expenseDate: exp.expense_date,
    });
  }

  async function saveEdit(id) {
    await updateExpense(id, editDraft);
    setEditingId(null);
    refresh();
  }

  async function handleDelete(id) {
    const confirmed = window.confirm('Delete this expense?');
    if (!confirmed) return;
    await deleteExpense(id);
    refresh();
  }

  if (showCategories) {
    return <ExpenseCategoriesPage onBack={() => { setShowCategories(false); refresh(); }} />;
  }

  return (
    <div>
      <header>
        <div className="header-row">
          <div>
            <h1>Expenses</h1>
            <p className="subtitle">Track operating costs. Used alongside Sales for the Profit &amp; Loss report.</p>
          </div>
          <button className="small-btn secondary" onClick={() => setShowCategories(true)}>Manage Categories</button>
        </div>
      </header>

      <form onSubmit={handleAdd} className="product-form">
        <h3>Add Expense</h3>
        <div className="form-row">
          <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
          {!currentBranchId && (
            <select value={formBranchId} onChange={(e) => setFormBranchId(e.target.value)} required>
              <option value="">Branch…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button type="submit">Add Expense</button>
        </div>
        {error && <p className="modal-error">{error}</p>}
      </form>

      <div className="expense-filters">
        <label className="modal-label">From</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="modal-label">To</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <label className="modal-label">Category</label>
        <select value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(from || to || filterCategoryId) && (
          <button className="link-btn" onClick={() => { setFrom(''); setTo(''); setFilterCategoryId(''); }}>
            Clear filters
          </button>
        )}
      </div>

      <p className="expense-total-line">
        Total for this filter: <strong>{formatMoney(total, currencyCode)}</strong>
      </p>

      {expenses.length === 0 ? (
        <p className="empty-state">No expenses recorded for this filter.</p>
      ) : (
        <table className="product-table">
          <thead>
            <tr>
              <th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>Amount</th>{!currentBranchId && <th>Branch</th>}<th></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((exp) => (
              <tr key={exp.id}>
                {editingId === exp.id ? (
                  <>
                    <td>
                      <input type="date" className="modal-input" value={editDraft.expenseDate}
                        onChange={(e) => setEditDraft((d) => ({ ...d, expenseDate: e.target.value }))} />
                    </td>
                    <td>
                      <select className="modal-select" value={editDraft.categoryId}
                        onChange={(e) => setEditDraft((d) => ({ ...d, categoryId: e.target.value }))}>
                        <option value="">Uncategorized</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="modal-input" value={editDraft.description}
                        onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))} />
                    </td>
                    <td>
                      <select className="modal-select" value={editDraft.paymentMethod}
                        onChange={(e) => setEditDraft((d) => ({ ...d, paymentMethod: e.target.value }))}>
                        {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="number" step="0.01" className="modal-input" value={editDraft.amount}
                        onChange={(e) => setEditDraft((d) => ({ ...d, amount: e.target.value }))} />
                    </td>
                    {!currentBranchId && <td>{exp.branch_name || '—'}</td>}
                    <td className="cart-row-actions">
                      <button className="link-btn name-link" onClick={() => saveEdit(exp.id)}>Save</button>
                      <button className="link-btn" onClick={() => setEditingId(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{exp.expense_date}</td>
                    <td>{exp.category_name || 'Uncategorized'}</td>
                    <td>{exp.description || '—'}</td>
                    <td>{PAYMENT_METHODS.find((m) => m.value === exp.payment_method)?.label || exp.payment_method}</td>
                    <td>{formatMoney(exp.amount, currencyCode)}</td>
                    {!currentBranchId && <td>{exp.branch_name || '—'}</td>}
                    <td className="cart-row-actions">
                      <button className="link-btn name-link" onClick={() => startEdit(exp)}>Edit</button>
                      <button className="link-btn danger" onClick={() => handleDelete(exp.id)}>Delete</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
