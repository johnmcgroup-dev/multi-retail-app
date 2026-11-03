import { useEffect, useRef, useState } from 'react';
import { searchProducts } from '../../db/search';
import { useScanInput } from '../scanner/useScanInput';

export default function POSSearchBox({ onSelectProduct, onQuickAddStock, onScan, onScanMiss, refreshSignal }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  // A scanned code adds the item to the cart by itself; the box is cleared and
  // keeps focus so the next item can be scanned straight away.
  const scan = useScanInput({
    clear: () => { setTerm(''); setOpen(false); inputRef.current?.focus(); },
    onFound: (product) => onScan?.(product),
    onMiss: (code, why) => onScanMiss?.(code, why),
  });

  useEffect(() => {
    setResults(searchProducts(term));
    // refreshSignal changes after any cart action or completed sale, so stock
    // levels shown here (and the out-of-stock disabled state) stay current
    // without needing a page refresh.
  }, [term, open, refreshSignal]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(product) {
    if (product.quantity <= 0) return; // out of stock, not selectable
    onSelectProduct(product);
    setTerm('');
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (scan.onEnter(term)) return;                         // exact barcode/SKU: added
    if (term.trim() && results.length === 0) onScanMiss?.(term.trim(), 'notfound');
  }

  return (
    <div className="pos-search" ref={boxRef}>
      <div className="pos-search-input-row">
        <input
          ref={inputRef}
          autoFocus
          className="pos-search-input"
          placeholder="Scan a barcode / QR code, or search by name, category, barcode, or SKU…"
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); scan.onValueChange(e.target.value); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
        />
        {term && (
          <button className="pos-search-clear" onClick={() => { setTerm(''); scan.reset(); }} aria-label="Clear search">
            ×
          </button>
        )}
      </div>

      {open && (
        <div className="pos-search-dropdown">
          {results.length === 0 ? (
            <div className="pos-search-empty">No products found.</div>
          ) : (
            results.map((p) => {
              const outOfStock = p.quantity <= 0;
              return (
                <div key={p.id} className="pos-search-result-row">
                  <button
                    className={`pos-search-result ${outOfStock ? 'disabled' : ''}`}
                    disabled={outOfStock}
                    onClick={() => handleSelect(p)}
                  >
                    <span className="psr-name">{p.name}</span>
                    <span className="psr-meta">
                      {p.category_name || 'Uncategorized'} · {p.barcode || p.sku || '—'}
                    </span>
                    <span className="psr-stock">
                      {outOfStock ? 'Out of stock' : `${p.quantity} in stock`}
                    </span>
                  </button>
                  {outOfStock && onQuickAddStock && (
                    <button
                      type="button"
                      className="quick-add-stock-btn"
                      onClick={() => { onQuickAddStock(p); setOpen(false); }}
                    >
                      + Stock
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
