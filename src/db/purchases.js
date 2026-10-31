import { query, run, runBatch } from './database';
import { newId } from './id';
import {
  getCurrentTenantId, getCurrentUser, getCurrentBranchId, getDefaultBranchId, branchFilter, canAccessPage,
} from './session';
import { stockChangeStatement } from './stock';
import { getCompanySettings } from './companySettings';
import { formatMoney } from './currency';

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function assertPurchasingAccess() {
  const user = getCurrentUser();
  if (!user || !canAccessPage(user.role, 'purchases')) {
    throw new Error('You do not have permission to manage purchases.');
  }
  return user;
}

const money = (n) => formatMoney(n, getCompanySettings().currency_code);

// =========================== Suppliers ===========================

export function listSuppliers() {
  return query(`SELECT * FROM suppliers WHERE tenant_id = ? ORDER BY name COLLATE NOCASE ASC`, [getCurrentTenantId()]);
}

export function getSupplier(id) {
  return query(`SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?`, [id, getCurrentTenantId()])[0] || null;
}

function supplierNameTaken(name, exceptId = '') {
  return query(
    `SELECT id FROM suppliers WHERE tenant_id = ? AND LOWER(name) = LOWER(?) AND id != ?`,
    [getCurrentTenantId(), name, exceptId]
  ).length > 0;
}

export async function addSupplier({ name, phone, address }) {
  assertPurchasingAccess();
  const clean = (name || '').trim();
  if (!clean) throw new Error('Supplier name is required.');
  if (supplierNameTaken(clean)) throw new Error(`A supplier named "${clean}" already exists.`);
  const id = newId('sup');
  await run(`INSERT INTO suppliers (id, tenant_id, name, phone, address) VALUES (?, ?, ?, ?, ?)`, [
    id, getCurrentTenantId(), clean, phone || null, address || null,
  ]);
  return id;
}

export async function updateSupplier(id, { name, phone, address }) {
  assertPurchasingAccess();
  if (!getSupplier(id)) throw new Error('Supplier not found.');
  const clean = (name || '').trim();
  if (!clean) throw new Error('Supplier name is required.');
  if (supplierNameTaken(clean, id)) throw new Error(`A supplier named "${clean}" already exists.`);
  await run(`UPDATE suppliers SET name = ?, phone = ?, address = ? WHERE id = ? AND tenant_id = ?`, [
    clean, phone || null, address || null, id, getCurrentTenantId(),
  ]);
}

export function listSupplierLedger(supplierId) {
  if (!getSupplier(supplierId)) return [];
  return query(
    `SELECT l.*, po.po_number FROM supplier_ledger l
     LEFT JOIN purchase_orders po ON po.id = l.purchase_order_id
     WHERE l.supplier_id = ? AND l.tenant_id = ? ORDER BY l.created_at ASC, l.rowid ASC`,
    [supplierId, getCurrentTenantId()]
  );
}

// Builds (does not run) the balance change + ledger line for one movement on a
// supplier's account, so it can join a larger all-or-nothing batch.
function supplierLedgerStatements({ supplierId, balanceBefore, type, amount, note, purchaseOrderId = null, paymentMethod = null, branchId }) {
  const tenantId = getCurrentTenantId();
  const delta = type === 'payment' ? -amount : amount; // payments reduce what we owe
  const balanceAfter = round2(balanceBefore + delta);
  return {
    balanceAfter,
    statements: [
      { sql: `UPDATE suppliers SET balance = ROUND(balance + ?, 2) WHERE id = ? AND tenant_id = ?`, params: [delta, supplierId, tenantId] },
      {
        sql: `INSERT INTO supplier_ledger (id, tenant_id, branch_id, supplier_id, purchase_order_id, type, amount, balance_after, payment_method, note)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [newId('sled'), tenantId, branchId, supplierId, purchaseOrderId, type, amount, balanceAfter, paymentMethod, note || null],
      },
    ],
  };
}

// Paying a supplier directly (not tied to receiving an order). Cannot pay more
// than is owed - that is almost always a typo.
export async function recordSupplierPayment(supplierId, amount, note = '', paymentMethod = 'cash') {
  assertPurchasingAccess();
  const amt = round2(Number(amount));
  if (!(amt > 0)) throw new Error('Payment amount must be greater than zero.');
  const supplier = getSupplier(supplierId);
  if (!supplier) throw new Error('Supplier not found.');
  if (amt > supplier.balance + 0.005) {
    throw new Error(`You only owe ${supplier.name} ${money(supplier.balance)}.`);
  }
  const branchId = getCurrentBranchId() || getDefaultBranchId(getCurrentTenantId());
  const { statements } = supplierLedgerStatements({
    supplierId, balanceBefore: supplier.balance, type: 'payment', amount: amt,
    note: note || 'Payment to supplier', paymentMethod, branchId,
  });
  await runBatch(statements);
}

// ======================== Purchase orders ========================

// Creates an order. Changes NO stock - stock only rises when goods are received.
// items: [{ productId, varietyId, quantity, unitCost }] (quantity is in the
// chosen unit, e.g. 5 Cartons, and unitCost is the cost of ONE such unit).
// The order belongs to the branch being worked in; only when viewing all
// branches is `branchId` taken from the caller.
export async function createPurchaseOrder({ supplierId, branchId = null, orderDate, expectedDate = null, note = '', items }) {
  const user = assertPurchasingAccess();
  const tenantId = getCurrentTenantId();

  if (!getSupplier(supplierId)) throw new Error('Supplier not found.');
  const branch = getCurrentBranchId() || branchId;
  if (!branch) throw new Error('Choose which branch this order is for.');
  if (query(`SELECT id FROM branches WHERE id = ? AND tenant_id = ? AND is_active = 1`, [branch, tenantId]).length === 0) {
    throw new Error('Branch not found in this business.');
  }
  if (!items || items.length === 0) throw new Error('Add at least one item to the order.');
  if (!orderDate) throw new Error('Order date is required.');

  const lines = items.map((line) => {
    const qty = Number(line.quantity);
    const cost = Number(line.unitCost);
    if (!(qty > 0)) throw new Error('Every line needs a quantity greater than zero.');
    if (!(cost >= 0)) throw new Error('Unit cost cannot be negative.');
    const product = query(`SELECT id, name FROM products WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [line.productId, tenantId])[0];
    if (!product) throw new Error('Product not found in this business.');
    const variety = query(`SELECT * FROM product_varieties WHERE id = ? AND product_id = ?`, [line.varietyId, line.productId])[0];
    if (!variety) throw new Error(`Unit not found for ${product.name}.`);
    if (!(variety.qty > 0)) throw new Error(`"${variety.name}" of ${product.name} is not set up yet (Qty is 0).`);
    return { product, variety, qty, cost };
  });

  const total = round2(lines.reduce((sum, l) => sum + l.qty * l.cost, 0));
  const poId = newId('po');
  const count = query(`SELECT COUNT(*) AS c FROM purchase_orders WHERE tenant_id = ?`, [tenantId])[0].c;
  const poNumber = `PO-${String(count + 1).padStart(4, '0')}`;

  const statements = [
    {
      sql: `INSERT INTO purchase_orders (id, tenant_id, branch_id, supplier_id, po_number, order_date, expected_date, note, total, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [poId, tenantId, branch, supplierId, poNumber, orderDate, expectedDate || null, note || null, total, user.id],
    },
    ...lines.map((l) => ({
      sql: `INSERT INTO purchase_order_items
              (id, purchase_order_id, product_id, variety_id, product_name, unit_name, units_per_unit, quantity_ordered, unit_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [newId('poi'), poId, l.product.id, l.variety.id, l.product.name, l.variety.name, l.variety.qty, l.qty, l.cost],
    })),
  ];
  await runBatch(statements);
  return poId;
}

export function listPurchaseOrders({ status = null } = {}) {
  const bf = branchFilter('po.branch_id');
  return query(
    `SELECT po.*, s.name AS supplier_name, b.name AS branch_name,
       (SELECT COALESCE(SUM(i.quantity_received * i.unit_cost), 0) FROM purchase_order_items i WHERE i.purchase_order_id = po.id) AS received_value
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     LEFT JOIN branches b ON b.id = po.branch_id
     WHERE po.tenant_id = ? ${status ? 'AND po.status = ?' : ''}${bf.sql}
     ORDER BY po.created_at DESC, po.rowid DESC`,
    [getCurrentTenantId(), ...(status ? [status] : []), ...bf.params]
  );
}

// One order with its lines and delivery history, only if the current user is
// allowed to see it (their tenant, and their branch unless viewing all).
export function getPurchaseOrder(id) {
  const bf = branchFilter('po.branch_id');
  const po = query(
    `SELECT po.*, s.name AS supplier_name, b.name AS branch_name
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     LEFT JOIN branches b ON b.id = po.branch_id
     WHERE po.id = ? AND po.tenant_id = ?${bf.sql}`,
    [id, getCurrentTenantId(), ...bf.params]
  )[0];
  if (!po) return null;

  const items = query(`SELECT * FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY rowid ASC`, [id]);
  const receipts = query(
    `SELECT r.*, u.name AS received_by_name FROM purchase_receipts r LEFT JOIN users u ON u.id = r.received_by
     WHERE r.purchase_order_id = ? ORDER BY r.created_at ASC, r.rowid ASC`,
    [id]
  ).map((r) => ({
    ...r,
    lines: query(
      `SELECT ri.quantity_received, i.product_name, i.unit_name FROM purchase_receipt_items ri
       JOIN purchase_order_items i ON i.id = ri.purchase_order_item_id WHERE ri.receipt_id = ? ORDER BY ri.rowid ASC`,
      [r.id]
    ),
  }));
  return { ...po, items, receipts };
}

// Records goods arriving against an order - all or part of it. In ONE
// all-or-nothing batch: each line's received count, the branch's stock, the
// stock-history line, the delivery record, what we now owe the supplier, any
// payment made on the spot, and the order's status. If anything fails, none of
// it is saved.
// lines: [{ itemId, quantity }] - quantity in the line's own unit.
export async function receivePurchaseOrder(id, { lines, paidNow = 0, paymentMethod = 'cash', note = '' }) {
  const user = assertPurchasingAccess();
  const tenantId = getCurrentTenantId();
  const po = getPurchaseOrder(id);
  if (!po) throw new Error('Purchase order not found.');
  if (!['ordered', 'partial'].includes(po.status)) {
    throw new Error(`This order is ${po.status} and cannot receive more stock.`);
  }
  const supplier = getSupplier(po.supplier_id);

  const wanted = new Map();
  for (const l of lines || []) {
    if (!po.items.some((i) => i.id === l.itemId)) throw new Error('A line does not belong to this order.');
    wanted.set(l.itemId, Number(l.quantity) || 0);
  }

  const receiptId = newId('rcpt');
  const itemStatements = [];
  let value = 0;
  let any = false;
  for (const item of po.items) {
    const qty = wanted.get(item.id) || 0;
    if (qty < 0) throw new Error('Quantity received cannot be negative.');
    if (qty === 0) continue;
    const outstanding = item.quantity_ordered - item.quantity_received;
    if (qty > outstanding + 1e-9) {
      throw new Error(`Cannot receive ${qty} ${item.unit_name}(s) of ${item.product_name}: only ${outstanding} still outstanding.`);
    }
    any = true;
    value += qty * item.unit_cost;
    itemStatements.push(
      { sql: `UPDATE purchase_order_items SET quantity_received = quantity_received + ? WHERE id = ?`, params: [qty, item.id] },
      { sql: `INSERT INTO purchase_receipt_items (id, receipt_id, purchase_order_item_id, quantity_received) VALUES (?, ?, ?, ?)`, params: [newId('rci'), receiptId, item.id, qty] },
      stockChangeStatement(item.product_id, po.branch_id, tenantId, qty * item.units_per_unit),
      {
        sql: `INSERT INTO stock_adjustments (id, tenant_id, product_id, branch_id, quantity_added, note) VALUES (?, ?, ?, ?, ?, ?)`,
        params: [newId('adj'), tenantId, item.product_id, po.branch_id, qty * item.units_per_unit, `Received on ${po.po_number}`],
      }
    );
  }
  if (!any) throw new Error('Enter a quantity to receive for at least one line.');
  value = round2(value);

  const statements = [
    {
      sql: `INSERT INTO purchase_receipts (id, tenant_id, purchase_order_id, branch_id, received_by, note, total_value) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [receiptId, tenantId, id, po.branch_id, user.id, note || null, value],
    },
    ...itemStatements,
  ];

  let balance = supplier.balance;
  if (value > 0) {
    const r = supplierLedgerStatements({
      supplierId: supplier.id, balanceBefore: balance, type: 'purchase', amount: value,
      note: `Goods received on ${po.po_number}`, purchaseOrderId: id, branchId: po.branch_id,
    });
    statements.push(...r.statements);
    balance = r.balanceAfter;
  }

  const paid = round2(Number(paidNow) || 0);
  if (paid < 0) throw new Error('Payment cannot be negative.');
  if (paid > balance + 0.005) throw new Error(`You only owe ${supplier.name} ${money(balance)} after this delivery.`);
  if (paid > 0) {
    statements.push(...supplierLedgerStatements({
      supplierId: supplier.id, balanceBefore: balance, type: 'payment', amount: paid,
      note: `Paid on delivery, ${po.po_number}`, purchaseOrderId: id, paymentMethod, branchId: po.branch_id,
    }).statements);
  }

  const fullyReceived = po.items.every(
    (i) => i.quantity_received + (wanted.get(i.id) || 0) >= i.quantity_ordered - 1e-9
  );
  statements.push({
    sql: `UPDATE purchase_orders SET status = ? WHERE id = ? AND tenant_id = ?`,
    params: [fullyReceived ? 'received' : 'partial', id, tenantId],
  });

  await runBatch(statements);
  return receiptId;
}

// Nothing received yet -> the order can simply be cancelled.
export async function cancelPurchaseOrder(id) {
  assertPurchasingAccess();
  const po = getPurchaseOrder(id);
  if (!po) throw new Error('Purchase order not found.');
  if (po.status !== 'ordered') throw new Error('Only an order with nothing received yet can be cancelled. Use Close Order for a partly delivered one.');
  await run(`UPDATE purchase_orders SET status = 'cancelled' WHERE id = ? AND tenant_id = ?`, [id, getCurrentTenantId()]);
}

// Partly delivered and the supplier won't send the rest: stop waiting for it.
export async function closePurchaseOrder(id) {
  assertPurchasingAccess();
  const po = getPurchaseOrder(id);
  if (!po) throw new Error('Purchase order not found.');
  if (po.status !== 'partial') throw new Error('Only a partly delivered order can be closed.');
  await run(`UPDATE purchase_orders SET status = 'closed' WHERE id = ? AND tenant_id = ?`, [id, getCurrentTenantId()]);
}
