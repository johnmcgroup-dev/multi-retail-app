import { useState } from 'react';
import { getPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder, closePurchaseOrder } from '../../db/purchases';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';

export const STATUS_LABELS = { ordered: 'Ordered', partial: 'Partly received', received: 'Received', closed: 'Closed', cancelled: 'Cancelled' };
const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card Payment' },
];

const outstandingOf = (i) => Math.max(0, i.quantity_ordered - i.quantity_received);
const defaultReceive = (po) => (po ? Object.fromEntries(po.items.map((i) => [i.id, String(outstandingOf(i))])) : {});

export default function PurchaseOrderDetail({ poId, onBack }) {
  const [tick, setTick] = useState(0);
  const po = getPurchaseOrder(poId);
  const [recv, setRecv] = useState(() => defaultReceive(po));
  const [paidNow, setPaidNow] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const currencyCode = getCompanySettings().currency_code;
  const money = (n) => formatMoney(n, currencyCode);

  if (!po) {
    return (
      <div>
        <button className="link-btn" onClick={onBack}>← Back</button>
        <p>Purchase order not found.</p>
      </div>
    );
  }

  const canReceive = po.status === 'ordered' || po.status === 'partial';
  const receiveValue = po.items.reduce((sum, i) => sum + (Number(recv[i.id]) || 0) * i.unit_cost, 0);

  function reload() {
    setRecv(defaultReceive(getPurchaseOrder(poId)));
    setTick(tick + 1);
  }

  async function handleReceive(e) {
    e.preventDefault();
    setError(''); setMessage('');
    setSaving(true);
    try {
      await receivePurchaseOrder(poId, {
        lines: po.items.map((i) => ({ itemId: i.id, quantity: recv[i.id] })),
        paidNow, paymentMethod: method, note,
      });
      setMessage('Goods received. Stock and the supplier account have been updated.');
      setPaidNow(''); setNote('');
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusAction(fn, confirmText) {
    if (!window.confirm(confirmText)) return;
    setError(''); setMessage('');
    try { await fn(poId); reload(); } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <button className="link-btn" onClick={onBack}>← Back to purchase orders</button>
      <div className="product-detail-header">
        <div>
          <h2>{po.po_number} <span className={`status-badge status-${po.status}`}>{STATUS_LABELS[po.status]}</span></h2>
          <p className="product-meta">
            Supplier: {po.supplier_name} · Branch: {po.branch_name} · Ordered {po.order_date}{po.created_by_name ? ` by ${po.created_by_name}` : ''}
            {po.expected_date ? ` · Expected ${po.expected_date}` : ''}
          </p>
          {po.note && <p className="product-meta">Note: {po.note}</p>}
        </div>
        <div className="cart-row-actions">
          {po.status === 'ordered' && (
            <button className="link-btn danger" onClick={() => handleStatusAction(cancelPurchaseOrder, 'Cancel this purchase order?')}>Cancel Order</button>
          )}
          {po.status === 'partial' && (
            <button className="link-btn danger" onClick={() => handleStatusAction(closePurchaseOrder, 'Close this order? The supplier will not be expected to send the rest.')}>Close Order</button>
          )}
        </div>
      </div>

      <form onSubmit={handleReceive}>
        <table className="product-table po-lines">
          <thead>
            <tr>
              <th>Product</th><th>Unit</th><th>Ordered</th><th>Received</th><th>Outstanding</th>
              <th>Cost / unit</th><th>Line total</th>{canReceive && <th>Receive now</th>}
            </tr>
          </thead>
          <tbody>
            {po.items.map((i) => (
              <tr key={i.id}>
                <td>{i.product_name}</td>
                <td>{i.unit_name}</td>
                <td>{i.quantity_ordered}</td>
                <td>{i.quantity_received}</td>
                <td>{outstandingOf(i)}</td>
                <td>{money(i.unit_cost)}</td>
                <td>{money(i.quantity_ordered * i.unit_cost)}</td>
                {canReceive && (
                  <td>
                    {outstandingOf(i) > 0 ? (
                      <input type="number" min="0" step="0.01" max={outstandingOf(i)} className="modal-input"
                        value={recv[i.id] ?? ''} onChange={(e) => setRecv({ ...recv, [i.id]: e.target.value })} />
                    ) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="cart-totals"><span>Order total</span><strong>{money(po.total)}</strong></div>

        {canReceive && (
          <div className="product-form" style={{ marginTop: '1rem' }}>
            <h3>Receive Stock</h3>
            <p className="modal-hint">
              Enter what actually arrived (you can receive part now and the rest later). Stock for {po.branch_name} goes up
              and the value, {money(receiveValue)}, is added to what you owe {po.supplier_name}.
            </p>
            <div className="transfer-grid">
              <div>
                <label className="modal-label">Paid to supplier now (optional)</label>
                <input type="number" min="0" step="0.01" className="modal-input" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} />
              </div>
              <div>
                <label className="modal-label">Payment method</label>
                <select className="modal-select" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="modal-label">Delivery note (optional)</label>
                <input className="modal-input" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <button type="submit" className="small-btn" disabled={saving} style={{ marginTop: '0.8rem' }}>
              {saving ? 'Receiving…' : 'Receive Stock'}
            </button>
          </div>
        )}
      </form>

      {error && <p className="modal-error">{error}</p>}
      {message && <p className="saved-msg">{message}</p>}

      <h3>Deliveries</h3>
      {po.receipts.length === 0 ? (
        <p className="empty-state">Nothing received yet.</p>
      ) : (
        <table className="product-table">
          <thead><tr><th>Date</th><th>Received</th><th>Value</th><th>By</th><th>Note</th></tr></thead>
          <tbody>
            {po.receipts.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.lines.map((l) => `${l.quantity_received} × ${l.unit_name} ${l.product_name}`).join(', ')}</td>
                <td>{money(r.total_value)}</td>
                <td>{r.received_by_name || '—'}</td>
                <td>{r.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
