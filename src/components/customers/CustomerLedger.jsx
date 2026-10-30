import { useState } from 'react';
import { getCustomer, listCustomerLedger, listLoyaltyLedger, recordPayment, updateCustomer } from '../../db/customers';
import { getCompanySettings } from '../../db/companySettings';
import { getCurrentBranchId } from '../../db/session';
import { formatMoney } from '../../db/currency';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card Payment' },
];

export default function CustomerLedger({ customerId, onBack, onChanged }) {
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [showLoyalty, setShowLoyalty] = useState(false);

  const customer = getCustomer(customerId);
  const ledger = listCustomerLedger(customerId);
  const loyaltyLedger = listLoyaltyLedger(customerId);
  const currencyCode = getCompanySettings().currency_code;

  function startEdit() {
    setEditName(customer.name);
    setEditPhone(customer.phone || '');
    setEditAddress(customer.address || '');
    setEditing(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    await updateCustomer(customerId, { name: editName, phone: editPhone, address: editAddress });
    setEditing(false);
    onChanged();
  }

  async function handleRecordPayment(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await recordPayment(customerId, Number(paymentAmount), paymentNote, paymentMethod);
      setPaymentAmount('');
      setPaymentNote('');
      setPaymentMethod('cash');
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!customer) return <p>Customer not found.</p>;

  return (
    <div>
      <button className="link-btn" onClick={onBack}>← Back to customers</button>

      {editing ? (
        <form onSubmit={saveEdit} className="product-form">
          <h3>Edit Customer</h3>
          <div className="form-row">
            <input placeholder="Name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
            <input placeholder="Phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            <input placeholder="Address" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            <button type="submit">Save</button>
            <button type="button" className="small-btn secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="product-detail-header">
          <div>
            <h2>{customer.name}</h2>
            <p className="product-meta">
              {customer.phone || 'No phone'} · {customer.address || 'No address'}
            </p>
          </div>
          {!customer.is_walkin && (
            <button className="link-btn name-link" onClick={startEdit}>Edit Customer</button>
          )}
        </div>
      )}

      <p className={customer.balance > 0 ? 'balance-owing' : 'balance-clear'}>
        {customer.balance > 0
          ? `Outstanding balance: ${formatMoney(customer.balance, currencyCode)}`
          : 'No outstanding balance.'}
      </p>

      {!customer.is_walkin && (
        <p className="loyalty-points-line">
          Loyalty points: <strong>{customer.loyalty_points}</strong>
          {' '}
          <button className="link-btn name-link" onClick={() => setShowLoyalty((v) => !v)}>
            {showLoyalty ? 'Hide' : 'View'} loyalty history
          </button>
        </p>
      )}

      {!customer.is_walkin && (
        <form onSubmit={handleRecordPayment} className="product-form">
          <h3>Record Payment</h3>
          <p className="modal-hint">
            Use this to collect money against an outstanding balance, with or without a new sale.
          </p>
          {!getCurrentBranchId() && (
            <p className="modal-hint">
              You are viewing all branches, so this payment is recorded against the default branch.
              Select a branch in the menu bar to record it against that one instead.
            </p>
          )}
          <div className="form-row">
            <input
              type="number"
              step="0.01"
              placeholder="Amount received"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              required
            />
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <input
              placeholder="Note (optional)"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
            />
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record Payment'}</button>
          </div>
          {error && <p className="modal-error">{error}</p>}
        </form>
      )}

      {showLoyalty && (
        <>
          <h3>Loyalty Points History</h3>
          {loyaltyLedger.length === 0 ? (
            <p className="empty-state">No loyalty activity yet.</p>
          ) : (
            <table className="product-table">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Note</th><th>Points</th><th>Balance After</th></tr>
              </thead>
              <tbody>
                {loyaltyLedger.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.created_at).toLocaleString()}</td>
                    <td>{entry.type === 'earn' ? 'Earned' : entry.type === 'redeem' ? 'Redeemed' : 'Adjustment'}</td>
                    <td>{entry.note || '—'}</td>
                    <td className={entry.type === 'earn' ? 'ledger-credit' : 'ledger-debit'}>
                      {entry.type === 'earn' ? '+' : '-'}{entry.points}
                    </td>
                    <td>{entry.balance_after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <h3>Account History</h3>
      {ledger.length === 0 ? (
        <p className="empty-state">No transactions yet.</p>
      ) : (
        <table className="product-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Method</th>
              <th>Note</th>
              <th>Amount</th>
              <th>Balance After</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.created_at).toLocaleString()}</td>
                <td>{entry.type === 'payment' ? 'Payment' : entry.type === 'sale_credit' ? 'Sale (credit)' : 'Adjustment'}</td>
                <td>{entry.payment_method || '—'}</td>
                <td>{entry.note || '—'}</td>
                <td className={entry.type === 'payment' ? 'ledger-credit' : 'ledger-debit'}>
                  {entry.type === 'payment' ? '-' : '+'}{formatMoney(entry.amount, currencyCode)}
                </td>
                <td>{formatMoney(entry.balance_after, currencyCode)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
