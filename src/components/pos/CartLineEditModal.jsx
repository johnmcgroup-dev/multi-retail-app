import { useState } from 'react';
import { listVarietiesForProduct, isHalfVariety } from '../../db/varieties';
import { updateCartItemDetails, availableStockFor } from '../../db/cart';
import { getProduct } from '../../db/products';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';

export default function CartLineEditModal({ item, onSaved, onClose }) {
  const varieties = listVarietiesForProduct(item.product_id);
  const [varietyId, setVarietyId] = useState(item.variety_id);
  const [qty, setQty] = useState(item.quantity);
  const [unitPrice, setUnitPrice] = useState(item.unit_price);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedVariety = varieties.find((v) => v.id === varietyId);
  const product = getProduct(item.product_id);
  const currencyCode = getCompanySettings().currency_code;

  function handleVarietyChange(id) {
    setVarietyId(id);
    const v = varieties.find((x) => x.id === id);
    if (v) setUnitPrice(v.price); // default to the new variety's price; still manually editable below
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      await updateCartItemDetails(item.id, { varietyId, unitPrice: Number(unitPrice), quantity: Number(qty) });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const available = selectedVariety
    ? availableStockFor(product, item.product_id, item.id) / (selectedVariety.qty || 1)
    : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit "{item.product_name}"</h3>

        <label className="modal-label">Variety</label>
        <select value={varietyId} onChange={(e) => handleVarietyChange(e.target.value)} className="modal-select">
          {varieties.map((v) => {
            const notSetUp = !v.qty || v.qty <= 0;
            return (
              <option key={v.id} value={v.id} disabled={notSetUp}>
                {isHalfVariety(v.name) ? `↳ ${v.name}` : v.name} {notSetUp ? '(not set up)' : `— ${formatMoney(v.price, currencyCode)}`}
              </option>
            );
          })}
        </select>

        <label className="modal-label">Quantity</label>
        <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="modal-input" />

        <label className="modal-label">Unit Price (editable, e.g. for a discount)</label>
        <input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="modal-input" />

        <p className="modal-hint">Up to {Math.max(0, Math.floor(available))} available with the current selection.</p>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="small-btn secondary" onClick={onClose}>Cancel</button>
          <button className="small-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
