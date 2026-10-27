import { useEffect, useState } from 'react';
import { listCart, addToCart } from '../../db/cart';
import POSSearchBox from './POSSearchBox';
import VarietyPickerModal from './VarietyPickerModal';
import CartPanel from './CartPanel';
import Invoice from '../invoice/Invoice';

export default function POSPage() {
  const [cartItems, setCartItems] = useState([]);
  const [pickerProduct, setPickerProduct] = useState(null);
  const [saleMessage, setSaleMessage] = useState('');
  const [lastSaleId, setLastSaleId] = useState(null);
  const [viewingInvoice, setViewingInvoice] = useState(false);
  // Bumped after any cart change or completed sale, so the search box
  // re-reads current stock levels instead of showing stale numbers.
  const [refreshSignal, setRefreshSignal] = useState(0);
  function bumpRefresh() {
    setRefreshSignal((n) => n + 1);
  }

  useEffect(() => {
    refreshCart();
  }, []);

  function refreshCart() {
    setCartItems(listCart());
  }

  async function handleAddToCart(product, variety, qty) {
    await addToCart(product, variety, qty);
    refreshCart();
    bumpRefresh();
  }

  function handleCartChanged() {
    refreshCart();
    bumpRefresh();
  }

  function handleSaleCompleted(saleId) {
    setLastSaleId(saleId);
    setSaleMessage(`Sale completed (#${saleId.slice(-6).toUpperCase()}). Cart is now empty.`);
    setTimeout(() => setSaleMessage(''), 6000);
    bumpRefresh();
  }

  if (viewingInvoice && lastSaleId) {
    return <Invoice saleId={lastSaleId} onBack={() => setViewingInvoice(false)} />;
  }

  return (
    <div className="pos-page">
      <header>
        <h1>StockApp — Module 4: POS + Invoicing</h1>
        <p className="subtitle">
          Search for a product, choose a variety and quantity, and build a sale.
          The cart is saved offline — refresh the page and it will still be here.
        </p>
      </header>

      <POSSearchBox onSelectProduct={setPickerProduct} refreshSignal={refreshSignal} />

      {saleMessage && (
        <p className="saved-msg sale-msg">
          {saleMessage}{' '}
          <button className="link-btn name-link" onClick={() => setViewingInvoice(true)}>
            View Invoice
          </button>
        </p>
      )}

      <CartPanel items={cartItems} onChanged={handleCartChanged} onSaleCompleted={handleSaleCompleted} />

      {pickerProduct && (
        <VarietyPickerModal
          product={pickerProduct}
          onAdd={handleAddToCart}
          onClose={() => setPickerProduct(null)}
        />
      )}
    </div>
  );
}
