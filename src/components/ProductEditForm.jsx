import { useState } from 'react';
import { updateProduct } from '../db/products';
import { getCurrentBranchId } from '../db/session';

export default function ProductEditForm({ product, categories, onSaved, onCancel }) {
  const [name, setName] = useState(product.name);
  const [barcode, setBarcode] = useState(product.barcode || '');
  const [sku, setSku] = useState(product.sku || '');
  const [categoryId, setCategoryId] = useState(product.category_id || '');
  const [quantity, setQuantity] = useState(product.quantity);
  const [basePrice, setBasePrice] = useState(product.base_price);
  const [saving, setSaving] = useState(false);
  const branchSelected = !!getCurrentBranchId();

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    await updateProduct(product.id, { name, barcode, sku, categoryId, quantity, base_price: basePrice });
    setSaving(false);
    onSaved();
  }

  return (
    <form onSubmit={handleSave} className="product-form">
      <h3>Edit Product</h3>
      <div className="form-row">
        <input placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        <input placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">No category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          placeholder="Stock at this branch" type="number" value={quantity} disabled={!branchSelected}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <input placeholder="Base Price" type="number" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
      </div>
      <p className="modal-hint">
        {branchSelected
          ? 'Stock Qty here sets the stock of the branch you are working in (other branches are unchanged). Use Add Stock or Stock Transfers for tracked changes.'
          : 'You are viewing all branches, so stock cannot be edited here. Select a branch to change its stock.'}
      </p>
      <div className="modal-actions">
        <button type="button" className="small-btn secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="small-btn" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </form>
  );
}
