import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase, query, run } from '../src/db/database';
import { createSuperAdmin, loginByEmail, createInviteCode } from '../src/db/users';
import { signUpVerified, joinVerified } from './helpers';
import { listBranches, addBranch } from '../src/db/branches';
import { addProduct, getProduct } from '../src/db/products';
import { listVarietiesForProduct, updateParentVariety } from '../src/db/varieties';
import { setViewingBranchId } from '../src/db/session';
import {
  addSupplier, getSupplier, listSuppliers, listSupplierLedger, recordSupplierPayment,
  createPurchaseOrder, receivePurchaseOrder, getPurchaseOrder, listPurchaseOrders,
  cancelPurchaseOrder, closePurchaseOrder,
} from '../src/db/purchases';

let A, mainA, lekki, productId, carton, piece, supplierId, poId;
const count = (table) => query(`SELECT COUNT(*) AS c FROM ${table}`)[0].c;
const stockAt = (branchId) =>
  query(`SELECT COALESCE(SUM(quantity),0) AS q FROM branch_stock WHERE product_id = ? AND branch_id = ?`, [productId, branchId])[0].q;
const item = (po, unit) => po.items.find((i) => i.unit_name === unit);

function snapshot() {
  const po = getPurchaseOrder(poId);
  return {
    stock: stockAt(mainA.id),
    status: po.status,
    received: po.items.map((i) => i.quantity_received),
    balance: getSupplier(supplierId).balance,
    receipts: count('purchase_receipts'),
    receiptItems: count('purchase_receipt_items'),
    ledger: count('supplier_ledger'),
    adjustments: count('stock_adjustments'),
  };
}

beforeAll(async () => {
  await initDatabase();
  await createSuperAdmin({ name: 'Dev', email: 'dev@x.com' });
  A = await signUpVerified({ tenantName: 'Acme', name: 'Alice', email: 'alice@a.com' });
  mainA = listBranches()[0];
  const id = await addBranch('Lekki');
  lekki = listBranches().find((b) => b.id === id);
  productId = await addProduct({ name: 'Rice 50kg', quantity: 0, base_price: 100 });
  const vs = listVarietiesForProduct(productId);
  piece = vs.find((v) => v.name === 'Piece');
  carton = vs.find((v) => v.name === 'Carton');
  await updateParentVariety(carton.id, { qty: 10, price: 900 }); // 1 Carton = 10 base pieces
  carton = listVarietiesForProduct(productId).find((v) => v.name === 'Carton');
  supplierId = await addSupplier({ name: 'Dangote Foods', phone: '0801' });
});

describe('ordering changes no stock', () => {
  it('creates a numbered order for the branch with the right total, and stock stays at 0', async () => {
    poId = await createPurchaseOrder({
      supplierId, orderDate: '2026-10-01', note: 'first order',
      items: [
        { productId, varietyId: carton.id, quantity: 5, unitCost: 800 },
        { productId, varietyId: piece.id, quantity: 20, unitCost: 90 },
      ],
    });
    const po = getPurchaseOrder(poId);
    expect(po).toMatchObject({ po_number: 'PO-0001', status: 'ordered', total: 5800, branch_id: mainA.id, supplier_name: 'Dangote Foods' });
    expect(item(po, 'Carton')).toMatchObject({ quantity_ordered: 5, units_per_unit: 10, unit_cost: 800 });
    expect(stockAt(mainA.id)).toBe(0);
    expect(getSupplier(supplierId).balance).toBe(0); // we owe nothing until goods arrive
  });

  it('refuses unusable lines', async () => {
    const bad = (line) => createPurchaseOrder({ supplierId, orderDate: '2026-10-01', items: [line] });
    await expect(bad({ productId, varietyId: carton.id, quantity: 0, unitCost: 1 })).rejects.toThrow(/greater than zero/);
    await expect(bad({ productId, varietyId: carton.id, quantity: 1, unitCost: -5 })).rejects.toThrow(/negative/);
    const roll = listVarietiesForProduct(productId).find((v) => v.name === 'Roll'); // never set up
    await expect(bad({ productId, varietyId: roll.id, quantity: 1, unitCost: 1 })).rejects.toThrow(/not set up/);
    await expect(createPurchaseOrder({ supplierId, orderDate: '2026-10-01', items: [] })).rejects.toThrow(/at least one item/);
    expect(count('purchase_orders')).toBe(1);
  });
});

describe('receiving stock', () => {
  it('a PARTIAL delivery adds stock (in base units), raises what we owe, and marks the order partial', async () => {
    const po = getPurchaseOrder(poId);
    await receivePurchaseOrder(poId, { lines: [{ itemId: item(po, 'Carton').id, quantity: 2 }] });
    expect(stockAt(mainA.id)).toBe(20); // 2 cartons x 10
    expect(getProduct(productId).quantity).toBe(20);
    expect(getSupplier(supplierId).balance).toBe(1600); // 2 x 800
    const after = getPurchaseOrder(poId);
    expect(after.status).toBe('partial');
    expect(item(after, 'Carton').quantity_received).toBe(2);
    expect(item(after, 'Piece').quantity_received).toBe(0);
    expect(after.receipts).toHaveLength(1);
    expect(after.receipts[0]).toMatchObject({ total_value: 1600 });
    expect(query(`SELECT note, quantity_added FROM stock_adjustments ORDER BY rowid DESC LIMIT 1`)[0])
      .toEqual({ note: 'Received on PO-0001', quantity_added: 20 });
  });

  it('cannot receive more than is outstanding, or nothing at all - and changes nothing', async () => {
    const before = snapshot();
    const po = getPurchaseOrder(poId);
    await expect(receivePurchaseOrder(poId, { lines: [{ itemId: item(po, 'Carton').id, quantity: 4 }] })).rejects.toThrow(/only 3 still outstanding/);
    await expect(receivePurchaseOrder(poId, { lines: [] })).rejects.toThrow(/at least one line/);
    await expect(receivePurchaseOrder(poId, { lines: [{ itemId: 'nope', quantity: 1 }] })).rejects.toThrow(/does not belong/);
    expect(snapshot()).toEqual(before);
  });

  it('if any write fails midway, NOTHING is saved; after the fault clears the retry works', async () => {
    const po = getPurchaseOrder(poId);
    const lines = [{ itemId: item(po, 'Carton').id, quantity: 3 }, { itemId: item(po, 'Piece').id, quantity: 20 }];
    const before = snapshot();
    await run(`CREATE TRIGGER boom BEFORE INSERT ON supplier_ledger BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;`);
    await expect(receivePurchaseOrder(poId, { lines, paidNow: 2000 })).rejects.toThrow(/simulated failure/);
    expect(snapshot()).toEqual(before); // stock, line counts, receipts, balance, status all untouched
    await run(`DROP TRIGGER boom`);

    await receivePurchaseOrder(poId, { lines, paidNow: 2000, paymentMethod: 'bank_transfer' });
    expect(stockAt(mainA.id)).toBe(20 + 30 + 20);
    expect(getSupplier(supplierId).balance).toBe(3800); // 1600 + 4200 - 2000 paid on delivery
    expect(getPurchaseOrder(poId).status).toBe('received');
    expect(listSupplierLedger(supplierId).map((l) => [l.type, l.amount, l.balance_after, l.po_number])).toEqual([
      ['purchase', 1600, 1600, 'PO-0001'],
      ['purchase', 4200, 5800, 'PO-0001'],
      ['payment', 2000, 3800, 'PO-0001'],
    ]);
  });

  it('a fully received order cannot be received again, cancelled or closed', async () => {
    const po = getPurchaseOrder(poId);
    await expect(receivePurchaseOrder(poId, { lines: [{ itemId: po.items[0].id, quantity: 1 }] })).rejects.toThrow(/cannot receive more/);
    await expect(cancelPurchaseOrder(poId)).rejects.toThrow(/nothing received yet/);
    await expect(closePurchaseOrder(poId)).rejects.toThrow(/partly delivered/);
  });

  it('paying more than is owed on delivery is refused untouched', async () => {
    const id = await createPurchaseOrder({ supplierId, orderDate: '2026-10-02', items: [{ productId, varietyId: piece.id, quantity: 10, unitCost: 50 }] });
    const po = getPurchaseOrder(id);
    const owed = getSupplier(supplierId).balance; // 3800; this delivery adds 500 -> 4300
    await expect(receivePurchaseOrder(id, { lines: [{ itemId: po.items[0].id, quantity: 10 }], paidNow: owed + 500 + 1 })).rejects.toThrow(/only owe/);
    expect(getPurchaseOrder(id).status).toBe('ordered');
    expect(getSupplier(supplierId).balance).toBe(owed);
    await cancelPurchaseOrder(id); // nothing received -> can cancel
    expect(getPurchaseOrder(id).status).toBe('cancelled');
    await expect(receivePurchaseOrder(id, { lines: [{ itemId: po.items[0].id, quantity: 1 }] })).rejects.toThrow(/cancelled/);
  });

  it('a partly delivered order can be closed, after which nothing more can arrive', async () => {
    const id = await createPurchaseOrder({ supplierId, orderDate: '2026-10-03', items: [{ productId, varietyId: piece.id, quantity: 4, unitCost: 90 }] });
    const po = getPurchaseOrder(id);
    await receivePurchaseOrder(id, { lines: [{ itemId: po.items[0].id, quantity: 1 }] });
    await expect(cancelPurchaseOrder(id)).rejects.toThrow(/nothing received yet/);
    await closePurchaseOrder(id);
    expect(getPurchaseOrder(id).status).toBe('closed');
    await expect(receivePurchaseOrder(id, { lines: [{ itemId: po.items[0].id, quantity: 1 }] })).rejects.toThrow(/closed/);
  });
});

describe('paying suppliers', () => {
  it('a standalone payment lowers the balance; overpaying is refused', async () => {
    const owed = getSupplier(supplierId).balance; // 3800 + 90 from the closed order's 1 piece
    expect(owed).toBe(3890);
    await recordSupplierPayment(supplierId, 890, 'part', 'cash');
    expect(getSupplier(supplierId).balance).toBe(3000);
    await expect(recordSupplierPayment(supplierId, 5000)).rejects.toThrow(/only owe/);
    await expect(recordSupplierPayment(supplierId, 0)).rejects.toThrow(/greater than zero/);
    expect(getSupplier(supplierId).balance).toBe(3000);
  });

  it('the supplier balance always equals the last line of its history', () => {
    const last = query(`SELECT balance_after FROM supplier_ledger WHERE supplier_id = ? ORDER BY rowid DESC LIMIT 1`, [supplierId])[0];
    expect(getSupplier(supplierId).balance).toBe(last.balance_after);
  });
});

describe('branches, roles and tenants', () => {
  let lekkiPo;

  it('a cashier cannot manage purchases; a Lekki manager only sees and orders for Lekki', async () => {
    const cCode = await createInviteCode({ tenantId: A.tenantId, role: 'cashier', branchId: lekki.id, createdByUserId: A.userId });
    await joinVerified({ code: cCode, name: 'Chidi', email: 'chidi@a.com' });
    await expect(createPurchaseOrder({ supplierId, orderDate: '2026-10-04', items: [{ productId, varietyId: piece.id, quantity: 1, unitCost: 1 }] }))
      .rejects.toThrow(/permission/);
    await expect(addSupplier({ name: 'Sneaky' })).rejects.toThrow(/permission/);

    await loginByEmail('alice@a.com');
    const mCode = await createInviteCode({ tenantId: A.tenantId, role: 'manager', branchId: lekki.id, createdByUserId: A.userId });
    await joinVerified({ code: mCode, name: 'Lola', email: 'lola@a.com' });

    expect(listPurchaseOrders()).toHaveLength(0); // Main's orders are invisible to her
    lekkiPo = await createPurchaseOrder({
      supplierId, branchId: mainA.id, // she tries to file it against Main: ignored
      orderDate: '2026-10-04', items: [{ productId, varietyId: piece.id, quantity: 6, unitCost: 80 }],
    });
    expect(getPurchaseOrder(lekkiPo).branch_id).toBe(lekki.id);
    expect(listPurchaseOrders()).toHaveLength(1);
    expect(getPurchaseOrder(poId)).toBeNull(); // Main's order: not hers
    await expect(receivePurchaseOrder(poId, { lines: [{ itemId: 'x', quantity: 1 }] })).rejects.toThrow(/not found/);
  });

  it('receiving a Lekki order adds stock to Lekki only', async () => {
    const po = getPurchaseOrder(lekkiPo);
    await receivePurchaseOrder(lekkiPo, { lines: [{ itemId: po.items[0].id, quantity: 6 }] });
    expect(stockAt(lekki.id)).toBe(6);
    expect(stockAt(mainA.id)).toBe(70 + 1); // Main unchanged by Lekki's delivery (+1 from the closed order)
  });

  it('the owner sees every branch\'s orders when viewing all, and each one is stamped with its branch', async () => {
    await loginByEmail('alice@a.com');
    setViewingBranchId(null);
    const all = listPurchaseOrders();
    expect(all.map((p) => p.branch_name).sort()).toEqual(['Lekki', 'Main Branch', 'Main Branch', 'Main Branch']);
    expect(listPurchaseOrders({ status: 'received' }).map((p) => p.po_number).sort()).toEqual(['PO-0001', 'PO-0004']);
    // receiving works from the all-branches view too: the order carries its own branch
    expect(getPurchaseOrder(lekkiPo).branch_name).toBe('Lekki');
  });

  it('another business sees none of it and cannot touch it', async () => {
    await signUpVerified({ tenantName: 'Beta', name: 'Bob', email: 'bob@b.com' });
    expect(listSuppliers()).toHaveLength(0);
    expect(listPurchaseOrders()).toHaveLength(0);
    expect(getPurchaseOrder(poId)).toBeNull();
    expect(getSupplier(supplierId)).toBeNull();
    await expect(receivePurchaseOrder(poId, { lines: [] })).rejects.toThrow(/not found/);
    await expect(createPurchaseOrder({ supplierId, orderDate: '2026-10-05', items: [{ productId, varietyId: piece.id, quantity: 1, unitCost: 1 }] }))
      .rejects.toThrow(/Supplier not found/);
    await expect(recordSupplierPayment(supplierId, 10)).rejects.toThrow(/Supplier not found/);
  });
});
