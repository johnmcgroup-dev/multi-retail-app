// migrations.js
//
// Problem this solves: schema.sql only runs CREATE TABLE IF NOT EXISTS, which
// does nothing to a table that already exists - even if we've since added a
// new column to it in a later module. Since each person's database lives in
// their own browser (offline-first), everyone is on whatever structure their
// database had the last time they loaded the app. Without this file, adding
// a column in code would silently break for anyone who already has data.
//
// This runs after schema.sql, checks what columns/tables actually exist, and
// adds whatever is missing. It's safe to run every time the app starts -
// already-up-to-date databases simply have nothing to do.

import { query, run, runUnsaved } from './database';
import { newId } from './id';

function columnExists(table, column) {
  const rows = query(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

function tableExists(table) {
  const rows = query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    [table]
  );
  return rows.length > 0;
}

async function addColumnIfMissing(table, column, definition) {
  if (!tableExists(table)) return; // schema.sql will have created it fresh with the column already
  if (!columnExists(table, column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Multi-branch backfill. Safe to run on every startup (every step only touches
// rows that are still missing branch info):
//  - every tenant gets a "Main Branch" if it has none
//  - existing stock (products.quantity) becomes that branch's stock
//  - existing sales / expenses / adjustments / ledger rows / carts are
//    attributed to that branch
//  - staff with no branch are assigned to it
function backfillBranches() {
  for (const t of query(`SELECT id FROM tenants`)) {
    const has = query(`SELECT id FROM branches WHERE tenant_id = ? LIMIT 1`, [t.id]);
    if (has.length === 0) {
      runUnsaved(`INSERT INTO branches (id, tenant_id, name) VALUES (?, ?, 'Main Branch')`, [newId('branch'), t.id]);
    }
  }

  const DEFAULT_BRANCH = (col) =>
    `(SELECT b.id FROM branches b WHERE b.tenant_id = ${col} AND b.is_active = 1 ORDER BY b.created_at ASC, b.rowid ASC LIMIT 1)`;

  runUnsaved(
    `INSERT INTO branch_stock (product_id, branch_id, tenant_id, quantity)
     SELECT p.id, ${DEFAULT_BRANCH('p.tenant_id')}, p.tenant_id, p.quantity FROM products p
     WHERE NOT EXISTS (SELECT 1 FROM branch_stock bs WHERE bs.product_id = p.id)
       AND ${DEFAULT_BRANCH('p.tenant_id')} IS NOT NULL`
  );

  for (const table of ['sales', 'expenses', 'stock_adjustments', 'cart_items', 'customer_ledger']) {
    runUnsaved(`UPDATE ${table} SET branch_id = ${DEFAULT_BRANCH(`${table}.tenant_id`)} WHERE branch_id IS NULL`);
  }

  runUnsaved(
    `UPDATE users SET branch_id = ${DEFAULT_BRANCH('users.tenant_id')}
     WHERE branch_id IS NULL AND tenant_id IS NOT NULL AND role IN ('manager', 'cashier')`
  );

  // Carts from before logins existed belong to nobody - hand them to the owner.
  runUnsaved(
    `UPDATE cart_items SET user_id =
       (SELECT u.id FROM users u WHERE u.tenant_id = cart_items.tenant_id AND u.role = 'owner'
        ORDER BY u.created_at ASC, u.rowid ASC LIMIT 1)
     WHERE user_id IS NULL`
  );
}

export async function runMigrations() {
  // Module 4: invoicing - customer snapshot fields on sales
  await addColumnIfMissing('sales', 'customer_name', 'TEXT');
  await addColumnIfMissing('sales', 'customer_phone', 'TEXT');

  // Module 4.1: real customer records + credit ledger
  await addColumnIfMissing('sales', 'customer_id', 'TEXT');
  await addColumnIfMissing('sales', 'amount_paid', 'REAL NOT NULL DEFAULT 0');

  // Module 5: outstanding-balance-inclusive payments, payment methods, loyalty
  await addColumnIfMissing('sales', 'previous_balance_paid', 'REAL NOT NULL DEFAULT 0');
  await addColumnIfMissing('sales', 'payment_method', "TEXT NOT NULL DEFAULT 'cash'");
  await addColumnIfMissing('sales', 'loyalty_points_earned', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('customers', 'loyalty_points', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('customer_ledger', 'payment_method', 'TEXT');
  await addColumnIfMissing('company_settings', 'points_per_amount', 'REAL NOT NULL DEFAULT 0.1');
  await addColumnIfMissing('company_settings', 'points_redeem_value', 'REAL NOT NULL DEFAULT 1.0');

  // Multi-currency: each tenant picks the one currency their business operates in
  await addColumnIfMissing('company_settings', 'currency_code', "TEXT NOT NULL DEFAULT 'USD'");

  // Multi-branch: which branch each record belongs to
  await addColumnIfMissing('sales', 'branch_id', 'TEXT');
  await addColumnIfMissing('expenses', 'branch_id', 'TEXT');
  await addColumnIfMissing('stock_adjustments', 'branch_id', 'TEXT');
  await addColumnIfMissing('cart_items', 'branch_id', 'TEXT');
  await addColumnIfMissing('cart_items', 'user_id', 'TEXT');
  await addColumnIfMissing('customer_ledger', 'branch_id', 'TEXT');

  backfillBranches();
}
