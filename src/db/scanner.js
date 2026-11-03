// Telling a barcode/QR scanner apart from a person typing.
//
// A scanner is a keyboard that types the whole code in a few milliseconds,
// usually ending with Enter. A person cannot type that fast. So when a code
// arrives as a rapid burst (or in one go) and matches a product EXACTLY, the
// app can add it without anyone pressing a button - while ordinary typing, even
// of a full barcode, still needs Enter or a click, so a half-typed code can
// never grab the wrong product.

export const SCAN = {
  MAX_GAP_MS: 80,   // characters arriving closer together than this look like a scanner
  MIN_LENGTH: 4,    // anything shorter is never treated as a scan
  IDLE_MS: 150,     // quiet time after the last character that means "the code is complete"
};

// Keeps the arrival time of each character of the CURRENT code.
export function nextStamps(stamps, prevValue, nextValue, now) {
  if (!nextValue) return [];
  if (nextValue.length <= prevValue.length) return [now];              // deleting/replacing: start over
  const last = stamps[stamps.length - 1];
  if (last !== undefined && now - last > SCAN.MAX_GAP_MS * 6) return [now]; // a long pause: start over
  return [...stamps, now];
}

export function looksLikeScan(value, stamps) {
  if (String(value).trim().length < SCAN.MIN_LENGTH) return false;
  if (stamps.length === 1) return true;              // the whole code arrived in a single step
  if (stamps.length < value.length) return false;    // part of it was typed by hand earlier
  for (let i = 1; i < stamps.length; i++) {
    if (stamps[i] - stamps[i - 1] > SCAN.MAX_GAP_MS) return false;
  }
  return true;
}
