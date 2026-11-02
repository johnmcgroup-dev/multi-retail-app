import { useState } from 'react';
import { listSuppliers, createPurchaseOrder } from '../../db/purchases';
import { listVarietiesForProduct } from '../../db/varieties';
import { listBranches } from '../../db/branches';
import { getCurrentBranchId } from '../../db/session';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';
import ProductSearchPicker from './ProductSearchPicker';

const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
let lineKey = 1;

export default function PurchaseOrderForm({ onCreated, onCancel }) {
  const suppliers = listSuppliers();
  const branches = listBranches();
  const needsBranchChoice = !getCurrentBranchId(); // viewing all branches
  const currencyCode = getCompanySettings().currency_code;

  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const usableUnits = (productId) => listVarietiesForProduct(productId).filter((v) => v.qty > 0);
  const update = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // A product chosen in the search box becomes a line, starting with 1 piece.
  // Picking the same product again just adds one more to that line.
  function addProduct(product) {
    const units = usableUnits(product.id);
    const unit = units.find((v) => v.name === 'Piece') || units[0];
    if (!unit) { setError(`"${product.name}" has no usable unit yet.`); return; }
    setError('');

    const existing = lines.find((l) => l.productId === product.id && l.varietyId === unit.id);
    if (existing) {
      update(existing.key, { quantity: String((Number(existing.quantity) || 0) + 1) });
      return;
    }
    // If the product has a standard cost, start the line's cost from it (still editable).
    const stdPerBase = product.cost_price ?? null;
    setLines((ls) => [...ls, {
      key: lineKey++, productId: product.id, productName: product.name, varietyId: unit.id,
      quantity: '1', unitCost: stdPerBase == null ? '' : String(round2(stdPerBase * unit.qty)),
      stdPerBase, costAuto: stdPerBase != null,
    }]);
  }

  function changeUnit(line, varietyId) {
    const unit = usableUnits(line.productId).find((v) => v.id === varietyId);
    const recost = line.costAuto && line.stdPerBase != null && unit ? { unitCost: String(round2(line.stdPerBase * unit.qty)) } : {};
    update(line.key, { varietyId, ...recost });
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
        <ProductSearchPicker onPick={addProduct} />

        <table className="product-table po-lines" style={{ marginTop: '0.8rem' }}>
          <thead><tr><th>Product</th><th>Unit</th><th>Qty</th><th>Cost per unit</th><th>Line total</th><th></th></tr></thead>
          <tbody>
            {lines.length === 0 && (
              <tr><td colSpan={6} className="empty-state">Search above to add products to this order.</td></tr>
            )}
            {lines.map((l) => (
              <tr key={l.key}>
                <td>{l.productName}</td>
                <td>
                  <select className="modal-select" value={l.varietyId} onChange={(e) => changeUnit(l, e.target.value)} required>
                    {usableUnits(l.productId).map((v) => <option key={v.id} value={v.id}>{v.name} (= {v.qty} pcs)</option>)}
                  </select>
                </td>
                <td><input type="number" min="0.01" step="0.01" className="modal-input" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} required /></td>
                <td><input type="number" min="0" step="0.01" className="modal-input" value={l.unitCost} onChange={(e) => update(l.key, { unitCost: e.target.value, costAuto: false })} required /></td>
                <td>{formatMoney((Number(l.quantity) || 0) * (Number(l.unitCost) || 0), currencyCode)}</td>
                <td><button type="button" className="link-btn danger" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        <label className="modal-label">Note (optional)</label>
        <input className="modal-input" value={note} onChange={(e) => setNote(e.target.value)} />

        <div className="cart-totals"><span>Order total</span><strong>{formatMoney(total, currencyCode)}</strong></div>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="small-btn secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="small-btn" disabled={saving || lines.length === 0}>{saving ? 'Saving…' : 'Create Purchase Order'}</button>
        </div>
      </form>
    </div>
  );
}
