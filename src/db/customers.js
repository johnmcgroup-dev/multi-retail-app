import { query, run, runBatch } from './database';
import { newId } from './id';
import { getCurrentTenantId, getCurrentBranchId, getDefaultBranchId } from './session';

const WALKIN_NAME = 'Walk-in Customer';

// Guarantees a single "Walk-in Customer" exists for the tenant and returns its id.
// This is the default used whenever no specific customer is chosen at checkout.
export async function ensureWalkInCustomer() {
  const rows = query(
    `SELECT id FROM customers WHERE tenant_id = ? AND is_walkin = 1 LIMIT 1`,
    [getCurrentTenantId()]
  );
  if (rows.length > 0) return rows[0].id;

  const id = newId('cust');
  await run(
    `INSERT INTO customers (id, tenant_id, name, is_walkin, balance) VALUES (?, ?, ?, 1, 0)`,
    [id, getCurrentTenantId(), WALKIN_NAME]
  );
  return id;
}

export function getWalkInCustomerIdSync() {
  // Sync lookup for places that already know ensureWalkInCustomer has run once
  // this session (e.g. re-reading after initial setup). Falls back to null if
  // not yet created - callers should use ensureWalkInCustomer() on first load.
  const rows = query(`SELECT id FROM customers WHERE tenant_id = ? AND is_walkin = 1 LIMIT 1`, [
    getCurrentTenantId(),
  ]);
  return rows[0]?.id || null;
}

// Walk-in always sorts first, everyone else alphabetically after.
export function listCustomers() {
  return query(
    `SELECT * FROM customers WHERE tenant_id = ? ORDER BY is_walkin DESC, name ASC`,
    [getCurrentTenantId()]
  );
}

export function getCustomer(id) {
  const rows = query(`SELECT * FROM customers WHERE id = ?`, [id]);
  return rows[0] || null;
}

export async function addCustomer({ name, phone, address }) {
  const id = newId('cust');
  await run(
    `INSERT INTO customers (id, tenant_id, name, phone, address, is_walkin, balance) VALUES (?, ?, ?, ?, ?, 0, 0)`,
    [id, getCurrentTenantId(), name, phone || null, address || null]
  );
  return id;
}

// Walk-in Customer's name is intentionally not editable here (the UI hides
// the option for it) since POS logic elsewhere identifies it by is_walkin,
// not by name - but phone/address could still be edited if ever needed.
export async function updateCustomer(id, { name, phone, address }) {
  await run(`UPDATE customers SET name = ?, phone = ?, address = ? WHERE id = ? AND tenant_id = ?`, [
    name,
    phone || null,
    address || null,
    id,
    getCurrentTenantId(),
  ]);
}

export function listCustomerLedger(customerId) {
  return query(
    `SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY created_at ASC`,
    [customerId]
  );
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Builds (but does NOT run) the two writes behind one money movement on a
// customer's account: the balance change and its ledger line. Returning
// statements instead of running them is what lets a whole sale - stock,
// invoice, balance, points, cart - be committed as ONE all-or-nothing batch.
// `balanceBefore` is the balance going into THIS entry (callers chain several
// entries by feeding each result's `balanceAfter` into the next).
export function ledgerStatements({ customerId, balanceBefore, type, amount, note, saleId = null, paymentMethod = null, branchId = null }) {
  const tenantId = getCurrentTenantId();
  const delta = type === 'payment' ? -amount : amount; // payments reduce what they owe
  const balanceAfter = round2(balanceBefore + delta);
  return {
    balanceAfter,
    statements: [
      { sql: `UPDATE customers SET balance = ROUND(balance + ?, 2) WHERE id = ? AND tenant_id = ?`, params: [delta, customerId, tenantId] },
      {
        sql: `INSERT INTO customer_ledger (id, tenant_id, branch_id, customer_id, sale_id, type, amount, balance_after, payment_method, note)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        // Customers are shared by the whole tenant, but each money movement is
        // attributed to the branch it happened at (the default branch when an
        // owner records it while viewing all branches).
        params: [newId('ledg'), tenantId, branchId || getCurrentBranchId() || getDefaultBranchId(tenantId),
          customerId, saleId, type, amount, balanceAfter, paymentMethod, note || null],
      },
    ],
  };
}

// Same idea for loyalty points: the balance change plus its history line.
export function loyaltyStatements({ customerId, pointsBefore, type, points, note, saleId = null }) {
  const tenantId = getCurrentTenantId();
  const delta = type === 'redeem' ? -points : points;
  const pointsAfter = pointsBefore + delta;
  return {
    pointsAfter,
    statements: [
      { sql: `UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ? AND tenant_id = ?`, params: [delta, customerId, tenantId] },
      {
        sql: `INSERT INTO loyalty_ledger (id, tenant_id, customer_id, sale_id, type, points, balance_after, note)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [newId('loy'), tenantId, customerId, saleId, type, points, pointsAfter, note || null],
      },
    ],
  };
}

// A customer paying down some or all of what they owe, independent of any
// specific new sale (e.g. they come in later and pay off an old balance,
// with nothing in their cart). Reachable from a customer's ledger page.
export async function recordPayment(customerId, amount, note = '', paymentMethod = 'cash') {
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('Payment amount must be greater than zero.');
  const customer = getCustomer(customerId);
  if (!customer || customer.tenant_id !== getCurrentTenantId()) throw new Error('Customer not found.');

  const { statements } = ledgerStatements({
    customerId, balanceBefore: customer.balance, type: 'payment', amount: amt,
    note: note || 'Payment received', paymentMethod,
  });
  await runBatch(statements);
}

// --- Loyalty points history ---

export function listLoyaltyLedger(customerId) {
  return query(
    `SELECT * FROM loyalty_ledger WHERE customer_id = ? ORDER BY created_at ASC, rowid ASC`,
    [customerId]
  );
}
