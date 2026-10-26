// database.js
//
// This file is the ONLY place that talks to the database directly.
// Everything else in the app (screens, buttons) calls functions from here.
//
// How it works, in plain terms:
// 1. sql.js loads a real SQLite engine into the browser (compiled to WASM).
// 2. The actual database file lives in the browser's IndexedDB storage,
//    so it survives page refreshes, closing the browser, and works fully offline.
// 3. Every time we change data, we save the updated database file back to IndexedDB.
// 4. Later, when we add cloud sync, this same database file format is what
//    gets compared against the server - no redesign needed.

import initSqlJs from 'sql.js';
import schemaSql from './schema.sql?raw';

const DB_NAME = 'stockapp-db';
const STORE_NAME = 'sqlite-file';
const FILE_KEY = 'main';

let SQL = null;
let db = null;

// --- IndexedDB helpers (just for storing the raw SQLite file bytes) ---

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadSavedFile() {
  const idb = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(FILE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function persistFile(bytes) {
  const idb = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(bytes, FILE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Public API ---

export async function initDatabase() {
  if (db) return db;

  SQL = await initSqlJs({
    // loads the WASM file from node_modules via Vite's static asset handling
    locateFile: (file) => `/sql-wasm.wasm`,
  });

  const saved = await loadSavedFile();
  db = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();

  // Run schema every time - all statements use IF NOT EXISTS, so this is safe
  // and lets us add new tables in later modules without wiping existing data.
  db.run(schemaSql);

  await saveToDisk();
  return db;
}

export async function saveToDisk() {
  if (!db) return;
  const bytes = db.export();
  await persistFile(bytes);
}

// Run a query that returns rows (SELECT)
export function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Run a statement that changes data (INSERT/UPDATE/DELETE)
export async function run(sql, params = []) {
  db.run(sql, params);
  await saveToDisk();
}

export function isReady() {
  return !!db;
}
