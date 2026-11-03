import { useEffect, useRef } from 'react';
import { findProductsByCode, searchProducts } from '../../db/search';
import { SCAN, nextStamps, looksLikeScan } from '../../db/scanner';

// Wires a search box to a barcode / QR scanner (which just "types" the code).
// - A code that arrives at scanner speed and matches ONE product exactly is
//   picked straight away, no click or Enter needed.
// - Typed by hand, the same code still waits for Enter, so a half-typed code
//   can never grab the wrong product.
// - A code shared by several products is reported, never guessed.
export function useScanInput({ clear, onFound, onMiss }) {
  const stamps = useRef([]);
  const prev = useRef('');
  const timer = useRef(null);
  const handlers = useRef({ clear, onFound, onMiss });
  handlers.current = { clear, onFound, onMiss };

  useEffect(() => () => clearTimeout(timer.current), []);

  function finish() {
    stamps.current = [];
    prev.current = '';
    handlers.current.clear();
  }

  // true = dealt with (a product was found, or the code was ambiguous)
  function resolve(code) {
    const matches = findProductsByCode(code);
    if (matches.length === 1) { handlers.current.onFound(matches[0]); finish(); return true; }
    if (matches.length > 1) { handlers.current.onMiss(code, 'ambiguous'); finish(); return true; }
    return false;
  }

  return {
    // call from the input's onChange with the NEW value
    onValueChange(value) {
      stamps.current = nextStamps(stamps.current, prev.current, value, Date.now());
      prev.current = value;
      clearTimeout(timer.current);
      if (!looksLikeScan(value, stamps.current)) return;
      timer.current = setTimeout(() => {
        const code = value.trim();
        if (resolve(code)) return;
        if (searchProducts(code).length === 0) { handlers.current.onMiss(code, 'notfound'); finish(); }
      }, SCAN.IDLE_MS);
    },
    // call when Enter is pressed; true = handled
    onEnter(value) {
      clearTimeout(timer.current);
      const code = value.trim();
      return code ? resolve(code) : false;
    },
    reset() {
      stamps.current = [];
      prev.current = '';
      clearTimeout(timer.current);
    },
  };
}
