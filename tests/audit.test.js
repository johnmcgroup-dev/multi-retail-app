import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase, query, run } from '../src/db/database';
import { createSuperAdmin, loginByEmail, createInviteCode } from '../src/db/users';
import { signUpVerified, joinVerified } from './helpers';
import { addProduct, getProduct, addStock, listStockAdjustments } from '../src/db/products';
import { addCustomer, recordPayment, listCustomerLedger } from '../src/db/customers';
import { addToCart, completeSale } from '../src/db/cart';
import { listVarietiesForProduct } from '../src/db/varieties';
import { listSales, getSale } from '../src/db/sales';
import { addExpense, listExpenses } from '../src/db/expenses';
import { addSupplier, createPurchaseOrder, receivePurchaseOrder, getPurchaseOrder, recordSupplierPayment, listSupplierLedger } from '../src/db/purchases';
import { setViewingBranchId } from '../src/db/session';

let A, rice, jane, supplierId;
const piece = () => listVarietiesForProduct(rice).find((v) => v.name === 'Piece');

beforeAll(async () => {
  await initDatabase();
  await createSuperAdmin({ name: 'Dev', email: 'dev@x.com' });
  A = await signUpVerified({ tenantName: 'Acme', name: 'Alice', email: 'alice@a.com' });
  rice = await addProduct({ name: 'Rice', quantity: 100, base_price: 100 });
  jane = await addCustomer({ name: 'Jane' });
  supplierId = await addSupplier({ name: 'Dangote' });
  for (const [role, name, email] of [['cashier', 'Chidi', 'chidi@a.com'], ['manager', 'Mary', 'mary@a.com']]) {
    await loginByEmail('alice@a.com');
    const code = await createInviteCode({ tenantId: A.tenantId, role, createdByUserId: A.userId });
    await joinVerified({ code, name, email });
  }
});

describe('every transaction records who made it', () => {
  it('sales: the cashier who rang it up, visible in the list and on the invoice record', async () => {
    await loginByEmail('chidi@a.com');
    await addToCart(getProduct(rice), piece(), 2);
    const bySale = await completeSale();
    await loginByEmail('alice@a.com');
    await addToCart(getProduct(rice), piece(), 1);
    const byOwner = await completeSale({ customerId: jane, amountPaid: 0 });

    setViewingBranchId(null);
    const names = Object.fromEntries(listSales().map((s) => [s.id, s.served_by_name]));
    expect(names[bySale]).toBe('Chidi');
    expect(names[byOwner]).toBe('Alice');
    expect(getSale(bySale).served_by_name).toBe('Chidi');
  });

  it('the customer account lines made by a sale or a payment carry the user too', async () => {
    await loginByEmail('mary@a.com');
    await recordPayment(jane, 40, 'part', 'cash');
    await loginByEmail('alice@a.com');
    const rows = listCustomerLedger(jane);
    expect(rows.map((r) => [r.type, r.created_by_name])).toEqual([['sale_credit', 'Alice'], ['payment', 'Mary']]);
  });

  it('expenses', async () => {
    await loginByEmail('mary@a.com');
    await addExpense({ amount: 25, expenseDate: '2026-10-01', description: 'fuel' });
    expect(listExpenses()[0]).toMatchObject({ description: 'fuel', created_by_name: 'Mary' });
  });

  it('stock added from POS and stock received on a purchase order', async () => {
    await loginByEmail('chidi@a.com');
    await addStock(rice, 5, 'top-up');
    await loginByEmail('alice@a.com');
    const piece1 = piece();
    const poId = await createPurchaseOrder({ supplierId, orderDate: '2026-10-01', items: [{ productId: rice, varietyId: piece1.id, quantity: 10, unitCost: 80 }] });
    expect(getPurchaseOrder(poId).created_by_name).toBe('Alice');
    await loginByEmail('mary@a.com');
    await receivePurchaseOrder(poId, { lines: getPurchaseOrder(poId).items.map((i) => ({ itemId: i.id, quantity: 10 })), paidNow: 100 });
    const hist = listStockAdjustments(rice);
    expect(hist.map((h) => [h.note, h.created_by_name])).toEqual([['Received on PO-0001', 'Mary'], ['top-up', 'Chidi']]);
    expect(hist[0].branch_name).toBe('Main Branch');
  });

  it('supplier account lines', async () => {
    await loginByEmail('alice@a.com');
    await recordSupplierPayment(supplierId, 50, 'settle', 'cash');
    const rows = listSupplierLedger(supplierId);
    expect(rows.map((r) => [r.type, r.created_by_name])).toEqual([['purchase', 'Mary'], ['payment', 'Mary'], ['payment', 'Alice']]);
  });

  it('older records made before this was tracked show no name instead of a wrong one', async () => {
    await run(`UPDATE sales SET created_by = NULL`);
    setViewingBranchId(null);
    expect(listSales().every((s) => s.served_by_name === null)).toBe(true);
    expect(query(`SELECT COUNT(*) AS c FROM sales`)[0].c).toBeGreaterThan(0);
  });
});
