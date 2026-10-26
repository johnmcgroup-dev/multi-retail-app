import { useState } from 'react';
import { listVarietiesForProduct, isHalfVariety } from '../../db/varieties';
import { availableStockFor } from '../../db/cart';

export default function VarietyPickerModal({ product, onAdd, onClose }) {
  const varieties = listVarietiesForProduct(product.id);
  const [varietyId, setVarietyId] = useState(varieties[0]?.id || '');
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');

  const selected = varieties.find((v) => v.id === varietyId);

  function handleAdd() {
    setError('');
    if (!selected) return;
    try {
      onAdd(product, selected, Number(qty));
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  const available = selected ? Math.floor(availableStockFor(product) / (selected.qty || 1)) : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add "{product.name}" to cart</h3>

        <label className="modal-label">Variety</label>
        <select value={varietyId} onChange={(e) => setVarietyId(e.target.value)} className="modal-select">
          {varieties.map((v) => (
            <option key={v.id} value={v.id}>
              {isHalfVariety(v.name) ? `↳ ${v.name}` : v.name} — {v.price.toFixed(2)}
            </option>
          ))}
        </select>

        <label className="modal-label">Quantity</label>
        <input
          type="number"
          min="1"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="modal-input"
        />

        <p className="modal-hint">
          Up to {available > 0 ? available : 0} of this variety available based on current stock.
        </p>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="small-btn secondary" onClick={onClose}>Cancel</button>
          <button className="small-btn" onClick={handleAdd}>Add to Cart</button>
        </div>
      </div>
    </div>
  );
}
