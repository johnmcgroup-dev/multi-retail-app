import { useState } from 'react';
import { getSupplier, updateSupplier, listSupplierLedger, recordSupplierPayment } from '../../db/purchases';
import { getCompanySettings } from '../../db/companySettings';
import { getCurrentBranchId } from '../../db/session';
import { formatMoney } from '../../db/currency';

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card Payment' },
];
const TYPE_LABELS = { purchase: 'Goods received', payment: 'Payment', adjustment: 'Adjustment' };

export default function SupplierLedger({ supplierId, onBack }) {
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ name: '', phone: '', address: '' });
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const currencyCode = getCompanySettings().currency_code;

  const supplier = getSupplier(supplierId);
  const ledger = listSupplierLedger(supplierId);
  const money = (n) => formatMoney(n, currencyCode);
  if (!supplier) return <p>Supplier not found.</p>;

  async function attempt(fn) {
    setError('');
    try { await fn(); setTick(tick + 1); } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <button className="link-btn" onClick={onBack}>← Back to suppliers</button>

      {editing ? (
        <form
          className="product-form"
          onSubmit={(e) => { e.preventDefault(); attempt(async () => { await updateSupplier(supplierId, edit); setEditing(false); }); }}
        >
          <h3>Edit Supplier</h3>
          <div className="form-row">
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
            <input placeholder="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            <input placeholder="Address" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            <button type="submit">Save</button>
            <button type="button" className="small-btn secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="product-detail-header">
          <div>
            <h2>{supplier.name}</h2>
            <p className="product-meta">{supplier.phone || 'No phone'} · {supplier.address || 'No address'}</p>
          </div>
          <button className="link-btn name-link" onClick={() => { setEdit({ name: supplier.name, phone: supplier.phone || '', address: supplier.address || '' }); setEditing(true); }}>
            Edit Supplier
          </button>
        </div>
      )}

      <p className={supplier.balance > 0 ? 'balance-owing' : 'balance-clear'}>
        {supplier.balance > 0 ? `We owe ${supplier.name}: ${money(supplier.balance)}` : 'Nothing owed to this supplier.'}
      </p>

      {supplier.balance > 0 && (
        <form
          className="product-form"
          onSubmit={(e) => { e.preventDefault(); attempt(async () => { await recordSupplierPayment(supplierId, amount, note, method); setAmount(''); setNote(''); }); }}
        >
          <h3>Pay Supplier</h3>
          {!getCurrentBranchId() && (
            <p className="modal-hint">You are viewing all branches, so this payment is recorded against the default branch.</p>
          )}
          <div className="form-row">
            <input type="number" step="0.01" placeholder="Amount paid" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="submit">Record Payment</button>
          </div>
        </form>
      )}
      {error && <p className="modal-error">{error}</p>}

      <h3>Account History</h3>
      {ledger.length === 0 ? (
        <p className="empty-state">No activity yet.</p>
      ) : (
        <table className="product-table">
          <thead><tr><th>Date</th><th>Type</th><th>Order</th><th>Method</th><th>Note</th><th>By</th><th>Amount</th><th>Owed After</th></tr></thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.created_at).toLocaleString()}</td>
                <td>{TYPE_LABELS[l.type]}</td>
                <td>{l.po_number || '—'}</td>
                <td>{l.payment_method || '—'}</td>
                <td>{l.note || '—'}</td>
                <td>{l.created_by_name || '—'}</td>
                <td className={l.type === 'payment' ? 'ledger-credit' : 'ledger-debit'}>
                  {l.type === 'payment' ? '-' : '+'}{money(l.amount)}
                </td>
                <td>{money(l.balance_after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
