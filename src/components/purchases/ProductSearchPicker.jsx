import { useEffect, useRef, useState } from 'react';
import { searchProducts } from '../../db/search';
import { useScanInput } from '../scanner/useScanInput';

// One search box for finding a product to add: type a name, SKU, barcode or
// category, or scan a barcode / QR code. A scanned code that matches one
// product is added at once, and scanning the same item again adds one more to
// its line. Typed by hand, a code still needs Enter or a click. Focus stays in
// the box so several items can be scanned or searched one after another.
export default function ProductSearchPicker({ onPick }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [note, setNote] = useState(null); // { ok, text }
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const scan = useScanInput({
    clear: () => { setTerm(''); setHighlight(0); setOpen(false); inputRef.current?.focus(); },
    onFound: (product) => { onPick(product); setNote({ ok: true, text: `Added ${product.name}` }); },
    onMiss: (code, why) => setNote({
      ok: false,
      text: why === 'ambiguous' ? `Several products share the code "${code}" - search by name instead.` : `No product found for "${code}".`,
    }),
  });

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
    setNote({ ok: true, text: `Added ${product.name}` });
    setTerm('');
    setHighlight(0);
    setOpen(false);
    scan.reset();
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
      if (scan.onEnter(term)) return;                       // exact barcode/SKU
      if (results.length === 0) {
        if (term.trim()) setNote({ ok: false, text: `No product found for "${term.trim()}".` });
        return;
      }
      pick(results[Math.min(highlight, results.length - 1)]);
    }
  }

  return (
    <div className="pos-search po-search" ref={boxRef}>
      <input
        ref={inputRef}
        autoFocus
        className="pos-search-input"
        placeholder="Scan a barcode / QR code, or search: name, SKU, barcode, category…"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); setHighlight(0); setNote(null); scan.onValueChange(e.target.value); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {note && <p className={note.ok ? 'saved-msg scan-msg' : 'modal-error scan-msg'}>{note.text}</p>}
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
