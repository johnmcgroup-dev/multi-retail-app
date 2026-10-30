// Lets the REAL app modules (which expect a browser) run under Node:
//  - fake-indexeddb stands in for the browser's IndexedDB
//  - a tiny in-memory localStorage
//  - sql.js is pointed at the wasm file on disk instead of a URL
import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import path from 'node:path';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};

vi.mock('sql.js', async () => {
  const actual = await vi.importActual('sql.js');
  const init = actual.default ?? actual;
  const wasm = path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
  return { default: (cfg) => init({ ...cfg, locateFile: () => wasm }) };
});
