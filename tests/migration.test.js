import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import { initDatabase, query } from '../src/db/database';
import { runMigrations } from '../src/db/migrations';
import { loginByEmail } from '../src/db/users';
import { listProducts } from '../src/db/products';
import { listSales } from '../src/db/sales';
import { listCart } from '../src/db/cart';
import { getCurrentBranchId } from '../src/db/session';

// Builds a database shaped like the one already sitting in your browser from
// the previous modules (no branches, stock stored on products.quantity, no
// branch columns anywhere), drops it into IndexedDB, then starts the REAL app
// against it - the exact situation that bit us once before.
async function installLegacyDatabase() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT, branch_id TEXT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE branches (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE products (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT, name TEXT NOT NULL, barcode TEXT, sku TEXT,
      category_id TEXT, quantity REAL NOT NULL DEFAULT 0, base_price REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT);
    CREATE TABLE sales (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, total REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE expenses (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, category_id TEXT, amount REAL NOT NULL, description TEXT,
      payment_method TEXT NOT NULL DEFAULT 'cash', expense_date TEXT NOT NULL DEFAULT (date('now')), created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE stock_adjustments (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity_added REAL NOT NULL,
      note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE cart_items (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, product_id TEXT NOT NULL, variety_id TEXT NOT NULL,
      product_name TEXT NOT NULL, variety_name TEXT NOT NULL, unit_price REAL NOT NULL, base_units_per_item REAL NOT NULL,
      quantity REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE customer_ledger (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, sale_id TEXT, type TEXT NOT NULL,
      amount REAL NOT NULL, balance_after REAL NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));

    INSERT INTO tenants (id, name) VALUES ('tenant_demo', 'Legacy Biz');
    INSERT INTO users (id, tenant_id, name, email, role) VALUES ('u_owner', 'tenant_demo', 'Olu', 'olu@legacy.com', 'owner');
    INSERT INTO users (id, tenant_id, name, email, role) VALUES ('u_mgr', 'tenant_demo', 'Mo', 'mo@legacy.com', 'manager');
    INSERT INTO users (id, tenant_id, name, email, role) VALUES ('u_csh', 'tenant_demo', 'Cy', 'cy@legacy.com', 'cashier');
    INSERT INTO products (id, tenant_id, name, quantity, base_price) VALUES ('p1', 'tenant_demo', 'Legacy Rice', 25, 100);
    INSERT INTO products (id, tenant_id, name, quantity, base_price) VALUES ('p2', 'tenant_demo', 'Legacy Beans', 0, 80);
    INSERT INTO sales (id, tenant_id, total) VALUES ('s1', 'tenant_demo', 500);
    INSERT INTO expenses (id, tenant_id, amount) VALUES ('e1', 'tenant_demo', 40);
    INSERT INTO stock_adjustments (id, tenant_id, product_id, quantity_added) VALUES ('a1', 'tenant_demo', 'p1', 25);
    INSERT INTO cart_items (id, tenant_id, product_id, variety_id, product_name, variety_name, unit_price, base_units_per_item, quantity)
      VALUES ('c1', 'tenant_demo', 'p1', 'v1', 'Legacy Rice', 'Piece', 100, 1, 2);
    INSERT INTO customer_ledger (id, tenant_id, customer_id, type, amount, balance_after) VALUES ('l1', 'tenant_demo', 'cu1', 'payment', 10, 0);
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
}

beforeAll(async () => {
  await installLegacyDatabase();
  await initDatabase();
});

describe('upgrading an existing single-branch database', () => {
  it('creates exactly one Main Branch for the existing tenant', () => {
    const branches = query(`SELECT * FROM branches WHERE tenant_id = 'tenant_demo'`);
    expect(branches).toHaveLength(1);
    expect(branches[0].name).toBe('Main Branch');
  });

  it('moves existing stock into that branch, preserving every quantity', () => {
    const main = query(`SELECT id FROM branches WHERE tenant_id = 'tenant_demo'`)[0].id;
    const stock = Object.fromEntries(query(`SELECT product_id, quantity, branch_id FROM branch_stock`).map((r) => [r.product_id, r]));
    expect(stock.p1.quantity).toBe(25);
    expect(stock.p2.quantity).toBe(0);
    expect(stock.p1.branch_id).toBe(main);
  });

  it('attributes existing sales, expenses, adjustments and ledger rows to it', () => {
    const main = query(`SELECT id FROM branches WHERE tenant_id = 'tenant_demo'`)[0].id;
    for (const table of ['sales', 'expenses', 'stock_adjustments', 'customer_ledger']) {
      const rows = query(`SELECT branch_id FROM ${table}`);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.branch_id === main), table).toBe(true);
    }
  });

  it('assigns staff to it, leaves the owner tenant-wide, and gives the old cart to the owner', () => {
    const main = query(`SELECT id FROM branches WHERE tenant_id = 'tenant_demo'`)[0].id;
    const users = Object.fromEntries(query(`SELECT id, branch_id FROM users`).map((u) => [u.id, u.branch_id]));
    expect(users.u_mgr).toBe(main);
    expect(users.u_csh).toBe(main);
    expect(users.u_owner).toBeNull();
    const cart = query(`SELECT user_id, branch_id FROM cart_items WHERE id = 'c1'`)[0];
    expect(cart).toEqual({ user_id: 'u_owner', branch_id: main });
  });

  it('is idempotent: running the migrations again changes nothing', async () => {
    await runMigrations();
    await runMigrations();
    expect(query(`SELECT id FROM branches WHERE tenant_id = 'tenant_demo'`)).toHaveLength(1);
    expect(query(`SELECT quantity FROM branch_stock WHERE product_id = 'p1'`)).toEqual([{ quantity: 25 }]);
  });

  it('the upgraded app shows the old data through the new branch-aware code', async () => {
    await loginByEmail('olu@legacy.com');
    expect(getCurrentBranchId()).toBeTruthy();
    const products = Object.fromEntries(listProducts().map((p) => [p.name, p.quantity]));
    expect(products).toEqual({ 'Legacy Rice': 25, 'Legacy Beans': 0 });
    expect(listSales()).toHaveLength(1);
    expect(listCart()).toHaveLength(1);

    await loginByEmail('cy@legacy.com'); // the cashier lands in the same branch
    expect(listProducts().find((p) => p.name === 'Legacy Rice').quantity).toBe(25);
  });
});
