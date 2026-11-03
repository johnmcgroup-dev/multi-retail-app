import { useEffect, useState } from 'react';
import { listCart, addToCart } from '../../db/cart';
import POSSearchBox from './POSSearchBox';
import VarietyPickerModal from './VarietyPickerModal';
import CartPanel from './CartPanel';
import Invoice from '../invoice/Invoice';
import AddStockModal from './AddStockModal';
import { listVarietiesForProduct, PIECE_NAME } from '../../db/varieties';

export default function POSPage() {
  const [cartItems, setCartItems] = useState([]);
  const [pickerProduct, setPickerProduct] = useState(null);
  const [addStockModalOpen, setAddStockModalOpen] = useState(false);
  const [addStockInitialProduct, setAddStockInitialProduct] = useState(null);
  const [saleMessage, setSaleMessage] = useState('');
  const [scanMessage, setScanMessage] = useState(null); // { ok, text } feedback for the last scan
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

  // A scanned barcode / QR code: one Piece goes straight into the cart, and
  // scanning the same item again simply raises its quantity. Stock limits apply.
  async function handleScan(product) {
    const piece = listVarietiesForProduct(product.id).find((v) => v.name === PIECE_NAME);
    try {
      await addToCart(product, piece, 1);
      refreshCart();
      bumpRefresh();
      const line = listCart().find((i) => i.product_id === product.id && i.variety_id === piece.id);
      setScanMessage({ ok: true, text: `${product.name} - ${line ? line.quantity : 1} in cart` });
    } catch (err) {
      setScanMessage({ ok: false, text: `${product.name}: ${err.message}` });
    }
  }

  function handleScanMiss(code, why) {
    setScanMessage({
      ok: false,
      text: why === 'ambiguous' ? `Several products share the code "${code}" - search by name instead.` : `No product found for "${code}".`,
    });
  }

  function openAddStock(product = null) {
    setAddStockInitialProduct(product);
    setAddStockModalOpen(true);
  }

  function closeAddStock() {
    setAddStockModalOpen(false);
    setAddStockInitialProduct(null);
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
        <div className="header-row">
          <div>
            <h1>Point of Sale</h1>
            <p className="subtitle">
              Search for a product, choose a variety and quantity, and build a sale.
              The cart is saved offline — refresh the page and it will still be here.
            </p>
          </div>
          <button className="small-btn secondary" onClick={() => openAddStock(null)}>
            + Add Stock
          </button>
        </div>
      </header>

      <POSSearchBox
        onSelectProduct={setPickerProduct}
        onQuickAddStock={openAddStock}
        onScan={handleScan}
        onScanMiss={handleScanMiss}
        refreshSignal={refreshSignal}
      />
      {scanMessage && <p className={scanMessage.ok ? 'saved-msg scan-msg' : 'modal-error scan-msg'}>{scanMessage.text}</p>}

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

      {addStockModalOpen && (
        <AddStockModal
          initialProduct={addStockInitialProduct}
          onDone={bumpRefresh}
          onClose={closeAddStock}
        />
      )}
    </div>
  );
}
