import { useEffect, useRef, useState } from 'react';
import { searchProducts } from '../../db/search';

export default function POSSearchBox({ onSelectProduct, onQuickAddStock, refreshSignal }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

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

  return (
    <div className="pos-search" ref={boxRef}>
      <div className="pos-search-input-row">
        <input
          className="pos-search-input"
          placeholder="Search by name, category, barcode, or SKU…"
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {term && (
          <button className="pos-search-clear" onClick={() => setTerm('')} aria-label="Clear search">
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
