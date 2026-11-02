import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import { initDatabase, query } from '../src/db/database';
import { runMigrations } from '../src/db/migrations';

// A database exactly as the previous version left it: branch stock with no
// average cost, sale lines with no cost columns, products with no cost price -
// but with purchase deliveries already recorded.
beforeAll(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE branches (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE products (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT, name TEXT NOT NULL, barcode TEXT, sku TEXT, category_id TEXT,
      quantity REAL NOT NULL DEFAULT 0, base_price REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT);
    CREATE TABLE branch_stock (product_id TEXT NOT NULL, branch_id TEXT NOT NULL, tenant_id TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 0, PRIMARY KEY (product_id, branch_id));
    CREATE TABLE sales (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT, total REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE sale_items (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, product_id TEXT NOT NULL, variety_id TEXT NOT NULL, product_name TEXT NOT NULL,
      variety_name TEXT NOT NULL, unit_price REAL NOT NULL, quantity REAL NOT NULL, line_total REAL NOT NULL);
    CREATE TABLE purchase_orders (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, supplier_id TEXT NOT NULL, po_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ordered', order_date TEXT NOT NULL, total REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE purchase_order_items (id TEXT PRIMARY KEY, purchase_order_id TEXT NOT NULL, product_id TEXT NOT NULL, variety_id TEXT, product_name TEXT NOT NULL,
      unit_name TEXT NOT NULL, units_per_unit REAL NOT NULL, quantity_ordered REAL NOT NULL, quantity_received REAL NOT NULL DEFAULT 0, unit_cost REAL NOT NULL DEFAULT 0);
    CREATE TABLE purchase_receipts (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, purchase_order_id TEXT NOT NULL, branch_id TEXT NOT NULL,
      total_value REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE purchase_receipt_items (id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL, purchase_order_item_id TEXT NOT NULL, quantity_received REAL NOT NULL);

    INSERT INTO tenants (id, name) VALUES ('t1', 'Biz');
    INSERT INTO branches (id, tenant_id, name) VALUES ('b1', 't1', 'Main Branch');
    INSERT INTO products (id, tenant_id, name, quantity) VALUES ('p1', 't1', 'Rice', 0), ('p2', 't1', 'Beans', 0);
    INSERT INTO branch_stock (product_id, branch_id, tenant_id, quantity) VALUES ('p1', 'b1', 't1', 60), ('p2', 'b1', 't1', 5);
    INSERT INTO sales (id, tenant_id, branch_id, total) VALUES ('s1', 't1', 'b1', 600);
    INSERT INTO sale_items VALUES ('si1', 's1', 'p1', 'v1', 'Rice', 'Piece', 100, 6, 600);
    INSERT INTO purchase_orders (id, tenant_id, branch_id, supplier_id, po_number, order_date) VALUES ('po1', 't1', 'b1', 'sup1', 'PO-0001', '2026-10-01');
    INSERT INTO purchase_order_items VALUES ('i1', 'po1', 'p1', 'v9', 'Rice', 'Carton', 10, 5, 5, 800), ('i2', 'po1', 'p1', 'v9', 'Rice', 'Carton', 10, 1, 1, 1000);
    INSERT INTO purchase_receipts (id, tenant_id, purchase_order_id, branch_id) VALUES ('r1', 't1', 'po1', 'b1');
    INSERT INTO purchase_receipt_items VALUES ('ri1', 'r1', 'i1', 5), ('ri2', 'r1', 'i2', 1);
  `);
  const bytes = db.export();
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('stockapp-db', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('sqlite-file');
    req.onsuccess = () => {
      const tx = req.result.transaction('sqlite-file', 'readwrite');
      tx.objectStore('sqlite-file').put(bytes, 'main');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
  await initDatabase();
});

const columns = (table) => query(`PRAGMA table_info(${table})`).map((c) => c.name);

describe('upgrading a database that already has purchase deliveries', () => {
  it('adds the new cost columns without losing anything', () => {
    expect(columns('products')).toContain('cost_price');
    expect(columns('branch_stock')).toContain('avg_cost');
    expect(columns('sale_items')).toEqual(expect.arrayContaining(['cost_per_base_unit', 'line_cost', 'cost_known']));
    expect(query(`SELECT quantity FROM branch_stock ORDER BY product_id`).map((r) => r.quantity)).toEqual([60, 5]);
  });

  it('works out the average cost from the deliveries already received', () => {
    const rows = Object.fromEntries(query(`SELECT product_id, avg_cost FROM branch_stock`).map((r) => [r.product_id, r.avg_cost]));
    expect(rows.p1).toBeCloseTo((5 * 800 + 1 * 1000) / (6 * 10), 6); // 83.3333 per piece
    expect(rows.p2).toBeNull(); // never bought through an order: cost genuinely unknown
  });

  it('marks old sale lines as cost-unknown instead of pretending they were free', () => {
    expect(query(`SELECT cost_known, line_cost FROM sale_items`)[0]).toEqual({ cost_known: 0, line_cost: null });
  });

  it('is safe to run again', async () => {
    await runMigrations();
    expect(query(`SELECT avg_cost FROM branch_stock WHERE product_id = 'p1'`)[0].avg_cost).toBeCloseTo(83.3333333, 4);
  });
});
