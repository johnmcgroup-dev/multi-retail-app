import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase, query } from '../src/db/database';
import { createSuperAdmin, loginByEmail, createInviteCode } from '../src/db/users';
import { signUpVerified, joinVerified } from './helpers';
import { addProduct, getProduct } from '../src/db/products';
import { addCustomer, getCustomer, setCustomerCreditLimit, ensureWalkInCustomer } from '../src/db/customers';
import { addToCart, completeSale, listCart, clearCart } from '../src/db/cart';
import { getCompanySettings, saveCompanySettings } from '../src/db/companySettings';
import { listVarietiesForProduct } from '../src/db/varieties';

let A, rice, jane;
const piece = () => listVarietiesForProduct(rice).find((v) => v.name === 'Piece');
const fill = async (n) => { await clearCart(); await addToCart(getProduct(rice), piece(), n); }; // n pieces = n x 100
const count = (t) => query(`SELECT COUNT(*) AS c FROM ${t}`)[0].c;
const snap = () => ({ sales: count('sales'), stock: getProduct(rice).quantity, balance: getCustomer(jane).balance, cart: listCart().length });

beforeAll(async () => {
  await initDatabase();
  await createSuperAdmin({ name: 'Dev', email: 'dev@x.com' });
  A = await signUpVerified({ tenantName: 'Acme', name: 'Alice', email: 'alice@a.com' });
  rice = await addProduct({ name: 'Rice', quantity: 1000, base_price: 100 });
  jane = await addCustomer({ name: 'Jane' });
});

describe('with no limit set (how every existing customer behaves)', () => {
  it('a customer can run up credit without restriction', async () => {
    expect(getCustomer(jane).credit_limit).toBeNull();
    await fill(2);
    await completeSale({ customerId: jane, amountPaid: 0 });
    expect(getCustomer(jane).balance).toBe(200);
  });
});

describe('with a limit', () => {
  it('only an Owner/Admin sets it; it can be cleared; bad values and the Walk-in are refused', async () => {
    await setCustomerCreditLimit(jane, 500);
    expect(getCustomer(jane).credit_limit).toBe(500);
    await expect(setCustomerCreditLimit(jane, -5)).rejects.toThrow(/negative/);
    await expect(setCustomerCreditLimit(await ensureWalkInCustomer(), 100)).rejects.toThrow(/Walk-in/);
    await setCustomerCreditLimit(jane, '');
    expect(getCustomer(jane).credit_limit).toBeNull();
    await setCustomerCreditLimit(jane, 500);
  });

  it('a sale that lands EXACTLY on the limit is allowed', async () => {
    await fill(3); // balance 200 + 300 unpaid = 500
    await completeSale({ customerId: jane, amountPaid: 0 });
    expect(getCustomer(jane).balance).toBe(500);
  });

  it('one more unit of credit is refused with nothing written - even with a part payment that still adds debt', async () => {
    await fill(1);
    const before = snap();
    await expect(completeSale({ customerId: jane, amountPaid: 0 })).rejects.toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED', message: expect.stringMatching(/Credit limit exceeded.*\$500\.00.*\$600\.00/) });
    await expect(completeSale({ customerId: jane, amountPaid: 50 })).rejects.toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED' });
    expect(snap()).toEqual(before); // cart kept, stock and balance untouched
  });

  it('a sale that adds no debt is always allowed, even at the limit', async () => {
    await fill(1);
    await completeSale({ customerId: jane, amountPaid: 100 });
    expect(getCustomer(jane).balance).toBe(500);
  });

  it('paying down the old balance inside the sale counts - landing under the limit is fine', async () => {
    await fill(1); // 100 unpaid, but 200 goes to the old balance: 500 - 200 + 100 = 400
    await completeSale({ customerId: jane, amountPaid: 200, includeOutstanding: true });
    expect(getCustomer(jane).balance).toBe(400);
  });

  it('lowering the limit below what is owed blocks new credit but never blocks paying', async () => {
    await setCustomerCreditLimit(jane, 300); // owes 400, limit 300
    await fill(1);
    await expect(completeSale({ customerId: jane, amountPaid: 0 })).rejects.toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED' });
    await completeSale({ customerId: jane, amountPaid: 100 }); // pays in full: fine
    expect(getCustomer(jane).balance).toBe(400);
    await fill(1); // 400 - 200 + 100 = 300, exactly at the limit
    await completeSale({ customerId: jane, amountPaid: 200, includeOutstanding: true });
    expect(getCustomer(jane).balance).toBe(300);
  });
});

describe('approving a sale over the limit', () => {
  let cashierId;

  it('a cashier is refused, cannot override, and cannot change limits', async () => {
    const code = await createInviteCode({ tenantId: A.tenantId, role: 'cashier', createdByUserId: A.userId });
    const r = await joinVerified({ code, name: 'Chidi', email: 'chidi@a.com' });
    cashierId = r.userId;
    await fill(5); // 500 unpaid on top of 300 owed
    await expect(completeSale({ customerId: jane, amountPaid: 0 })).rejects.toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED' });
    await expect(completeSale({ customerId: jane, amountPaid: 0, overrideCreditLimit: true })).rejects.toThrow(/Only an Owner or Admin/);
    await expect(setCustomerCreditLimit(jane, 100000)).rejects.toThrow(/Only an Owner or Admin/);
    expect(getCustomer(jane).balance).toBe(300);
  });

  it('an Owner can approve it, and the sale records who did', async () => {
    await loginByEmail('alice@a.com');
    await fill(5);
    const saleId = await completeSale({ customerId: jane, amountPaid: 0, overrideCreditLimit: true });
    expect(getCustomer(jane).balance).toBe(800);
    expect(query(`SELECT credit_override_by FROM sales WHERE id = ?`, [saleId])[0].credit_override_by).toBe(A.userId);
    expect(cashierId).toBeTruthy();
  });

  it('an override flag changes nothing when the sale was within the limit anyway', async () => {
    await fill(1);
    const saleId = await completeSale({ customerId: jane, amountPaid: 100, overrideCreditLimit: true });
    expect(query(`SELECT credit_override_by FROM sales WHERE id = ?`, [saleId])[0].credit_override_by).toBeNull();
  });
});

describe('default limit for new customers, and isolation', () => {
  it('new customers get the business default; clearing it gives them none', async () => {
    await saveCompanySettings({ ...getCompanySettings(), default_credit_limit: 250 });
    expect(getCustomer(await addCustomer({ name: 'Bob' })).credit_limit).toBe(250);
    await saveCompanySettings({ ...getCompanySettings(), default_credit_limit: '' });
    expect(getCustomer(await addCustomer({ name: 'Cara' })).credit_limit).toBeNull();
    await expect(saveCompanySettings({ ...getCompanySettings(), default_credit_limit: -1 })).rejects.toThrow(/negative/);
  });

  it('another business cannot change this customer\'s limit', async () => {
    await signUpVerified({ tenantName: 'Beta', name: 'Bob', email: 'bob@b.com' });
    await expect(setCustomerCreditLimit(jane, 1)).rejects.toThrow(/not found/);
    expect(getCustomer(jane).credit_limit).toBe(300);
  });
});
