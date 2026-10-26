import { useState } from 'react';
import { cartTotal, updateCartItemQuantity, removeCartItem, clearCart, completeSale } from '../../db/cart';

export default function CartPanel({ items, onChanged, onSaleCompleted }) {
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);

  const total = cartTotal(items);

  async function handleQtyChange(item, newQty) {
    setError('');
    try {
      await updateCartItemQuantity(item.id, Number(newQty));
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemove(item) {
    await removeCartItem(item.id);
    onChanged();
  }

  async function handleClear() {
    if (items.length === 0) return;
    const confirmed = window.confirm('Clear all items from the cart?');
    if (!confirmed) return;
    await clearCart();
    onChanged();
  }

  async function handleCompleteSale() {
    setError('');
    setCompleting(true);
    try {
      const saleId = await completeSale();
      onChanged();
      onSaleCompleted(saleId);
    } catch (err) {
      setError(err.message);
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="cart-panel">
      <h3>Cart</h3>

      {items.length === 0 ? (
        <p className="empty-state">Cart is empty. Search and add a product to begin.</p>
      ) : (
        <table className="cart-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Variety</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Line Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.product_name}</td>
                <td>{item.variety_name}</td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => handleQtyChange(item, e.target.value)}
                    className="cart-qty-input"
                  />
                </td>
                <td>{item.unit_price.toFixed(2)}</td>
                <td>{(item.unit_price * item.quantity).toFixed(2)}</td>
                <td>
                  <button className="link-btn danger" onClick={() => handleRemove(item)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <p className="modal-error">{error}</p>}

      <div className="cart-totals">
        <span>Total</span>
        <strong>{total.toFixed(2)}</strong>
      </div>

      <div className="cart-actions">
        <button className="small-btn secondary" onClick={handleClear} disabled={items.length === 0}>
          Clear
        </button>
        <button
          className="small-btn complete-sale-btn"
          onClick={handleCompleteSale}
          disabled={items.length === 0 || completing}
        >
          {completing ? 'Processing…' : 'Complete Sale'}
        </button>
      </div>
    </div>
  );
}
