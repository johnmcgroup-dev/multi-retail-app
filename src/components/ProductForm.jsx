import { useState } from 'react';

export default function ProductForm({ categories, onAdd, stockEnabled = true }) {
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onAdd({ name: name.trim(), barcode, sku, categoryId, quantity, base_price: price });
    setName(''); setBarcode(''); setSku(''); setCategoryId(''); setQuantity(''); setPrice('');
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="product-form">
      <h3>Add Product</h3>
      <div className="form-row">
        <input placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        <input placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          placeholder={stockEnabled ? 'Opening stock (Pieces)' : 'Pick a branch to set stock'}
          type="number" value={quantity} disabled={!stockEnabled}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <input placeholder="Base Price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Product'}</button>
      </div>
      {!stockEnabled && (
        <p className="modal-hint">You are viewing all branches, so the product will be created with no stock. Select a branch to add opening stock.</p>
      )}
    </form>
  );
}
