import { useEffect, useState } from 'react';
import { listCart } from '../../db/cart';
import { addToCart } from '../../db/cart';
import POSSearchBox from './POSSearchBox';
import VarietyPickerModal from './VarietyPickerModal';
import CartPanel from './CartPanel';

export default function POSPage() {
  const [cartItems, setCartItems] = useState([]);
  const [pickerProduct, setPickerProduct] = useState(null);
  const [saleMessage, setSaleMessage] = useState('');

  useEffect(() => {
    refreshCart();
  }, []);

  function refreshCart() {
    setCartItems(listCart());
  }

  async function handleAddToCart(product, variety, qty) {
    await addToCart(product, variety, qty);
    refreshCart();
  }

  function handleSaleCompleted(saleId) {
    setSaleMessage(`Sale completed (#${saleId.slice(-6)}). Cart is now empty.`);
    setTimeout(() => setSaleMessage(''), 4000);
  }

  return (
    <div className="pos-page">
      <header>
        <h1>StockApp — Module 3: POS / Cart</h1>
        <p className="subtitle">
          Search for a product, choose a variety and quantity, and build a sale.
          The cart is saved offline — refresh the page and it will still be here.
        </p>
      </header>

      <POSSearchBox onSelectProduct={setPickerProduct} />

      {saleMessage && <p className="saved-msg sale-msg">{saleMessage}</p>}

      <CartPanel items={cartItems} onChanged={refreshCart} onSaleCompleted={handleSaleCompleted} />

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
