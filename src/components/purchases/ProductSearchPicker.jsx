import { useEffect, useRef, useState } from 'react';
import { searchProducts } from '../../db/search';

// One search box for finding a product to add: type a name, SKU, barcode or
// category, or scan a barcode / QR code (a scanner just types the code and
// presses Enter). Enter adds an exact barcode/SKU match straight away,
// otherwise the highlighted result. Focus stays in the box so several items
// can be scanned or searched one after another.
export default function ProductSearchPicker({ onPick }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = open ? searchProducts(term) : [];

  function pick(product) {
    onPick(product);
    setTerm('');
    setHighlight(0);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault(); // this box sits inside the order form - Enter must not submit it
      if (results.length === 0) return;
      const t = term.trim().toLowerCase();
      const exact = t && results.find((p) => (p.barcode || '').toLowerCase() === t || (p.sku || '').toLowerCase() === t);
      pick(exact || results[Math.min(highlight, results.length - 1)]);
    }
  }

  return (
    <div className="pos-search po-search" ref={boxRef}>
      <input
        ref={inputRef}
        className="pos-search-input"
        placeholder="Search or scan: name, SKU, barcode / QR code, or category…"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div className="pos-search-dropdown">
          {results.length === 0 ? (
            <div className="pos-search-empty">No products found.</div>
          ) : (
            results.map((p, i) => (
              <button
                type="button"
                key={p.id}
                className={`pos-search-result ${i === highlight ? 'highlighted' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(p)}
              >
                <span className="psr-name">{p.name}</span>
                <span className="psr-meta">
                  {p.category_name || 'Uncategorized'} · {p.barcode || p.sku || '—'}
                </span>
                <span className="psr-stock">{p.quantity} in stock</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
