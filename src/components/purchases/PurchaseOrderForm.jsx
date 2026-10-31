import { useState } from 'react';
import { listSuppliers, createPurchaseOrder } from '../../db/purchases';
import { listProducts } from '../../db/products';
import { listVarietiesForProduct } from '../../db/varieties';
import { listBranches } from '../../db/branches';
import { getCurrentBranchId } from '../../db/session';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';

const today = () => new Date().toISOString().slice(0, 10);
let lineKey = 1;
const blankLine = () => ({ key: lineKey++, productId: '', varietyId: '', quantity: '', unitCost: '' });

export default function PurchaseOrderForm({ onCreated, onCancel }) {
  const suppliers = listSuppliers();
  const products = listProducts();
  const branches = listBranches();
  const needsBranchChoice = !getCurrentBranchId(); // viewing all branches
  const currencyCode = getCompanySettings().currency_code;

  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const usableUnits = (productId) => (productId ? listVarietiesForProduct(productId).filter((v) => v.qty > 0) : []);
  const update = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function pickProduct(key, productId) {
    const units = usableUnits(productId);
    update(key, { productId, varietyId: (units.find((v) => v.name === 'Piece') || units[0])?.id || '' });
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const id = await createPurchaseOrder({
        supplierId, branchId, orderDate, expectedDate: expectedDate || null, note,
        items: lines.map((l) => ({ productId: l.productId, varietyId: l.varietyId, quantity: l.quantity, unitCost: l.unitCost })),
      });
      onCreated(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (suppliers.length === 0) {
    return (
      <div>
        <button className="link-btn" onClick={onCancel}>← Back</button>
        <p className="empty-state">Add a supplier on the Suppliers page before creating a purchase order.</p>
      </div>
    );
  }

  return (
    <div>
      <button className="link-btn" onClick={onCancel}>← Back to purchase orders</button>
      <header>
        <h1>New Purchase Order</h1>
        <p className="subtitle">Ordering does not change stock. Stock goes up when you mark the goods as received.</p>
      </header>

      <form onSubmit={handleSubmit} className="product-form">
        <div className="transfer-grid">
          <div>
            <label className="modal-label">Supplier</label>
            <select className="modal-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="">Choose a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {needsBranchChoice && (
            <div>
              <label className="modal-label">Deliver to branch</label>
              <select className="modal-select" value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
                <option value="">Choose a branch…</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="modal-label">Order date</label>
            <input type="date" className="modal-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
          </div>
          <div>
            <label className="modal-label">Expected delivery (optional)</label>
            <input type="date" className="modal-input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
        </div>

        <h3>Items</h3>
        <table className="product-table po-lines">
          <thead><tr><th>Product</th><th>Unit</th><th>Qty</th><th>Cost per unit</th><th>Line total</th><th></th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td>
                  <select className="modal-select" value={l.productId} onChange={(e) => pickProduct(l.key, e.target.value)} required>
                    <option value="">Choose a product…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td>
                  <select className="modal-select" value={l.varietyId} onChange={(e) => update(l.key, { varietyId: e.target.value })} required>
                    {usableUnits(l.productId).map((v) => <option key={v.id} value={v.id}>{v.name} (= {v.qty} pcs)</option>)}
                  </select>
                </td>
                <td><input type="number" min="0.01" step="0.01" className="modal-input" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} required /></td>
                <td><input type="number" min="0" step="0.01" className="modal-input" value={l.unitCost} onChange={(e) => update(l.key, { unitCost: e.target.value })} required /></td>
                <td>{formatMoney((Number(l.quantity) || 0) * (Number(l.unitCost) || 0), currencyCode)}</td>
                <td>
                  {lines.length > 1 && (
                    <button type="button" className="link-btn danger" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="small-btn secondary" onClick={() => setLines((ls) => [...ls, blankLine()])} style={{ marginTop: '0.6rem' }}>
          + Add another item
        </button>

        <label className="modal-label">Note (optional)</label>
        <input className="modal-input" value={note} onChange={(e) => setNote(e.target.value)} />

        <div className="cart-totals"><span>Order total</span><strong>{formatMoney(total, currencyCode)}</strong></div>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="small-btn secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="small-btn" disabled={saving}>{saving ? 'Saving…' : 'Create Purchase Order'}</button>
        </div>
      </form>
    </div>
  );
}
