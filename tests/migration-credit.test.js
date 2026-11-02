import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import { initDatabase, query } from '../src/db/database';
import { loginByEmail } from '../src/db/users';
import { setCustomerCreditLimit, getCustomer } from '../src/db/customers';
import { getCompanySettings } from '../src/db/companySettings';

// A database as the previous version left it: customers with no credit limit,
// company settings with no default limit, sales with no approval column.
beforeAll(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT, branch_id TEXT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', email_verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE customers (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, address TEXT,
      is_walkin INTEGER NOT NULL DEFAULT 0, balance REAL NOT NULL DEFAULT 0, loyalty_points INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE company_settings (tenant_id TEXT PRIMARY KEY, company_name TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '', points_per_amount REAL NOT NULL DEFAULT 0.1, points_redeem_value REAL NOT NULL DEFAULT 1.0, currency_code TEXT NOT NULL DEFAULT 'USD');
    CREATE TABLE sales (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, total REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO tenants (id, name) VALUES ('t1', 'Biz');
    INSERT INTO users (id, tenant_id, name, email, role, email_verified) VALUES ('u1', 't1', 'Olu', 'olu@biz.com', 'owner', 1);
    INSERT INTO customers (id, tenant_id, name, balance) VALUES ('c1', 't1', 'Old Customer', 150);
    INSERT INTO company_settings (tenant_id, company_name) VALUES ('t1', 'Biz Ltd');
    INSERT INTO sales (id, tenant_id, total) VALUES ('s1', 't1', 100);
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

describe('upgrading a database from before credit limits', () => {
  it('adds the new columns', () => {
    const cols = (t) => query(`PRAGMA table_info(${t})`).map((c) => c.name);
    expect(cols('customers')).toContain('credit_limit');
    expect(cols('company_settings')).toContain('default_credit_limit');
    expect(cols('sales')).toContain('credit_override_by');
  });

  it('existing customers have NO limit, so nothing about how they buy changes', async () => {
    await loginByEmail('olu@biz.com');
    expect(getCustomer('c1')).toMatchObject({ balance: 150, credit_limit: null });
    expect(getCompanySettings().default_credit_limit).toBeNull();
  });

  it('a limit can then be set on an existing customer', async () => {
    await setCustomerCreditLimit('c1', 400);
    expect(getCustomer('c1').credit_limit).toBe(400);
  });
});
