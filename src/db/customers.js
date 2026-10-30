import { query, run } from './database';
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

// Internal helper - adds a ledger entry and updates the customer's running
// balance in one step, so the two can never drift apart from each other.
async function addLedgerEntry(customerId, type, amount, note, saleId = null, paymentMethod = null) {
  const customer = getCustomer(customerId);
  const delta = type === 'payment' ? -amount : amount; // payments reduce what they owe
  const newBalance = Math.round((customer.balance + delta + Number.EPSILON) * 100) / 100;

  await run(`UPDATE customers SET balance = ? WHERE id = ?`, [newBalance, customerId]);
  await run(
    `INSERT INTO customer_ledger (id, tenant_id, branch_id, customer_id, sale_id, type, amount, balance_after, payment_method, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    // Customers are shared by the whole tenant, but each money movement is
    // attributed to the branch it happened at (the default branch when an
    // owner records it while viewing all branches).
    [newId('ledg'), getCurrentTenantId(), getCurrentBranchId() || getDefaultBranchId(getCurrentTenantId()),
     customerId, saleId, type, amount, newBalance, paymentMethod, note || null]
  );
}

// Called from cart.js when a sale isn't fully paid - records the unpaid
// portion as debt owed by this customer.
export async function recordSaleCredit(customerId, saleId, outstandingAmount) {
  await addLedgerEntry(customerId, 'sale_credit', outstandingAmount, 'Unpaid balance from sale', saleId);
}

// A customer paying down some or all of what they owe, independent of any
// specific new sale (e.g. they come in later and pay off an old balance,
// with nothing in their cart). This is the "pay outstanding bill without
// buying anything" path - reachable from a customer's ledger page.
export async function recordPayment(customerId, amount, note = '', paymentMethod = 'cash') {
  if (amount <= 0) throw new Error('Payment amount must be greater than zero.');
  await addLedgerEntry(customerId, 'payment', amount, note || 'Payment received', null, paymentMethod);
}

// Called from cart.js when part of a sale's payment is applied toward an
// EXISTING outstanding balance rather than today's purchase - keeps that
// distinct from a standalone recordPayment so the ledger note is accurate.
export async function recordPaymentAppliedFromSale(customerId, saleId, amount, paymentMethod) {
  await addLedgerEntry(customerId, 'payment', amount, 'Applied toward previous balance during a sale', saleId, paymentMethod);
}

// --- Loyalty points ---

export function listLoyaltyLedger(customerId) {
  return query(
    `SELECT * FROM loyalty_ledger WHERE customer_id = ? ORDER BY created_at ASC`,
    [customerId]
  );
}

async function addLoyaltyEntry(customerId, type, points, note, saleId = null) {
  const customer = getCustomer(customerId);
  const delta = type === 'redeem' ? -points : points;
  const newBalance = customer.loyalty_points + delta;

  await run(`UPDATE customers SET loyalty_points = ? WHERE id = ?`, [newBalance, customerId]);
  await run(
    `INSERT INTO loyalty_ledger (id, tenant_id, customer_id, sale_id, type, points, balance_after, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId('loy'), getCurrentTenantId(), customerId, saleId, type, points, newBalance, note || null]
  );
}

export async function earnLoyaltyPoints(customerId, points, note, saleId = null) {
  if (points <= 0) return;
  await addLoyaltyEntry(customerId, 'earn', points, note || 'Earned from purchase', saleId);
}

// Throws if the customer doesn't have enough points - cart.js calls this
// BEFORE completing the sale, so a failed redemption never leaves a sale
// half-finished.
export async function redeemLoyaltyPoints(customerId, points, note, saleId = null) {
  const customer = getCustomer(customerId);
  if (points > customer.loyalty_points) {
    throw new Error(
      `Not enough loyalty points. "${customer.name}" has ${customer.loyalty_points}, but ${points} are needed.`
    );
  }
  await addLoyaltyEntry(customerId, 'redeem', points, note || 'Redeemed for payment', saleId);
}
