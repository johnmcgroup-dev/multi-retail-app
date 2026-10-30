import { useState } from 'react';
import { listBranches } from '../../db/branches';
import { listProductsStockAtBranch, transferStock, listTransfers } from '../../db/stock';
import { getCurrentUser, getCurrentBranchId } from '../../db/session';

export default function TransfersPage({ onChanged }) {
  const user = getCurrentUser();
  const isManager = user.role === 'manager';
  const allBranches = listBranches({ includeInactive: true });
  const activeBranches = allBranches.filter((b) => b.is_active);

  const [fromId, setFromId] = useState(getCurrentBranchId() || activeBranches[0]?.id || '');
  const [toId, setToId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const sourceProducts = fromId ? listProductsStockAtBranch(fromId) : [];
  const selected = sourceProducts.find((p) => p.id === productId);
  const destinations = activeBranches.filter((b) => b.id !== fromId);
  const history = listTransfers();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    setSaving(true);
    try {
      await transferStock({ productId, fromBranchId: fromId, toBranchId: toId, quantity: qty, note });
      const from = allBranches.find((b) => b.id === fromId)?.name;
      const to = allBranches.find((b) => b.id === toId)?.name;
      setSuccess(`Moved ${qty} unit(s) of "${selected?.name}" from ${from} to ${to}.`);
      setQty(''); setNote(''); setProductId('');
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <header>
        <h1>Stock Transfers</h1>
        <p className="subtitle">
          Move stock from one branch to another. The source branch loses the units and the destination gains
          them in one step, and every move is logged below.
          {isManager && ' As a manager you can only move stock out of your own branch.'}
        </p>
      </header>

      {activeBranches.length < 2 ? (
        <p className="empty-state">You need at least two active branches to transfer stock. Add one on the Branches page.</p>
      ) : (
        <form onSubmit={handleSubmit} className="product-form">
          <div className="transfer-grid">
            <div>
              <label className="modal-label">From</label>
              <select className="modal-select" value={fromId} disabled={isManager}
                onChange={(e) => { setFromId(e.target.value); setProductId(''); setToId(''); }}>
                {allBranches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_active ? '' : ' (inactive)'}</option>)}
              </select>
            </div>
            <div>
              <label className="modal-label">To</label>
              <select className="modal-select" value={toId} onChange={(e) => setToId(e.target.value)} required>
                <option value="">Choose a branch…</option>
                {destinations.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="modal-label">Product (in stock at the source)</label>
              <select className="modal-select" value={productId} onChange={(e) => setProductId(e.target.value)} required>
                <option value="">Choose a product…</option>
                {sourceProducts.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.quantity} available</option>)}
              </select>
            </div>
            <div>
              <label className="modal-label">Quantity (base units){selected ? ` · max ${selected.quantity}` : ''}</label>
              <input type="number" min="0.01" step="0.01" max={selected?.quantity} className="modal-input"
                value={qty} onChange={(e) => setQty(e.target.value)} required />
            </div>
            <div>
              <label className="modal-label">Note (optional)</label>
              <input className="modal-input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          {error && <p className="modal-error">{error}</p>}
          {success && <p className="saved-msg">{success}</p>}
          <button type="submit" className="small-btn" disabled={saving} style={{ marginTop: '0.8rem' }}>
            {saving ? 'Transferring…' : 'Transfer Stock'}
          </button>
        </form>
      )}

      <h3>Transfer History</h3>
      {history.length === 0 ? (
        <p className="empty-state">No transfers yet.</p>
      ) : (
        <table className="product-table">
          <thead><tr><th>Date</th><th>Product</th><th>From</th><th>To</th><th>Qty</th><th>By</th><th>Note</th></tr></thead>
          <tbody>
            {history.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td>{t.product_name}</td>
                <td>{t.from_branch_name}</td>
                <td>{t.to_branch_name}</td>
                <td>{t.quantity}</td>
                <td>{t.created_by_name || '—'}</td>
                <td>{t.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
