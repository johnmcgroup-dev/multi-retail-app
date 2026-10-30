import { useState } from 'react';
import { searchProducts } from '../../db/search';
import { addStock } from '../../db/products';

export default function AddStockModal({ initialProduct, onDone, onClose }) {
  const [term, setTerm] = useState(initialProduct?.name || '');
  const [results, setResults] = useState(initialProduct ? [] : searchProducts(''));
  const [selected, setSelected] = useState(initialProduct || null);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  function handleSearchChange(value) {
    setTerm(value);
    setSelected(null);
    setResults(searchProducts(value));
  }

  function handlePick(product) {
    setSelected(product);
    setTerm(product.name);
    setResults([]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!selected) {
      setError('Choose a product first.');
      return;
    }
    setSaving(true);
    try {
      await addStock(selected.id, qty, note);
      setSuccess(`Added ${qty} unit(s) to "${selected.name}". It can be sold right away.`);
      setQty('');
      setNote('');
      onDone(); // tells POSPage to refresh search/cart stock views, cart itself is untouched
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add Stock</h3>
        <p className="modal-hint">
          Increases stock instantly without closing or losing your current cart.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="modal-label">Product</label>
          <input
            className="modal-input"
            placeholder="Search by name, barcode, or SKU…"
            value={term}
            onChange={(e) => handleSearchChange(e.target.value)}
            disabled={!!initialProduct}
          />
          {!initialProduct && results.length > 0 && (
            <div className="add-stock-results">
              {results.map((p) => (
                <button type="button" key={p.id} className="add-stock-result" onClick={() => handlePick(p)}>
                  <span>{p.name}</span>
                  <span className="psr-meta">{p.quantity} in stock</span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <>
              <label className="modal-label">Quantity to Add (base Pieces)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                className="modal-input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
              <label className="modal-label">Note (optional)</label>
              <input
                className="modal-input"
                placeholder="e.g. new delivery, correction…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="modal-hint">Current stock: {selected.quantity}</p>
            </>
          )}

          {error && <p className="modal-error">{error}</p>}
          {success && <p className="saved-msg">{success}</p>}

          <div className="modal-actions">
            <button type="button" className="small-btn secondary" onClick={onClose}>
              {success ? 'Close' : 'Cancel'}
            </button>
            <button type="submit" className="small-btn" disabled={!selected || saving}>
              {saving ? 'Adding…' : 'Add Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
