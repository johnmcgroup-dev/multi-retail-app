import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase, query, run } from '../src/db/database';
import { createSuperAdmin, signUpAsNewTenantOwner } from '../src/db/users';
import { addProduct, getProduct } from '../src/db/products';
import { addCustomer, getCustomer, recordPayment } from '../src/db/customers';
import { addToCart, completeSale, listCart, clearCart } from '../src/db/cart';
import { listVarietiesForProduct } from '../src/db/varieties';

let productId, jane;
const piece = () => listVarietiesForProduct(productId).find((v) => v.name === 'Piece');
const fill = (n) => addToCart(getProduct(productId), piece(), n);
const count = (table) => query(`SELECT COUNT(*) AS c FROM ${table}`)[0].c;

// Everything a sale touches, captured so a failed sale can be proven to have
// changed NOTHING.
function snapshot() {
  const c = getCustomer(jane);
  return {
    sales: count('sales'),
    saleItems: count('sale_items'),
    ledger: count('customer_ledger'),
    loyalty: count('loyalty_ledger'),
    stock: getProduct(productId).quantity,
    cart: listCart().map((i) => [i.variety_name, i.quantity]),
    balance: c.balance,
    points: c.loyalty_points,
  };
}

beforeAll(async () => {
  await initDatabase();
  await createSuperAdmin({ name: 'Dev', email: 'dev@x.com' });
  await signUpAsNewTenantOwner({ tenantName: 'Acme', name: 'Alice', email: 'alice@a.com' });
  productId = await addProduct({ name: 'Rice', quantity: 20, base_price: 100 });
  jane = await addCustomer({ name: 'Jane', phone: '080' });
});

describe('sale accounting (through the real code)', () => {
  it('a part-paid credit sale records debt, points, stock and the invoice together', async () => {
    await fill(5); // 500
    const saleId = await completeSale({ customerId: jane, amountPaid: 300 });
    expect(getCustomer(jane)).toMatchObject({ balance: 200, loyalty_points: 30 });
    expect(getProduct(productId).quantity).toBe(15);
    expect(listCart()).toHaveLength(0);
    expect(query(`SELECT total, amount_paid FROM sales WHERE id = ?`, [saleId])[0]).toEqual({ total: 500, amount_paid: 300 });
    expect(query(`SELECT type, amount, balance_after FROM customer_ledger WHERE customer_id = ? ORDER BY rowid`, [jane]))
      .toEqual([{ type: 'sale_credit', amount: 200, balance_after: 200 }]);
  });

  it('paying the old balance inside a new sale splits the payment correctly', async () => {
    await fill(3); // 300, customer owes 200 -> due 500, pays 400
    const saleId = await completeSale({ customerId: jane, amountPaid: 400, includeOutstanding: true });
    expect(query(`SELECT amount_paid, previous_balance_paid FROM sales WHERE id = ?`, [saleId])[0])
      .toEqual({ amount_paid: 200, previous_balance_paid: 200 });
    expect(getCustomer(jane)).toMatchObject({ balance: 100, loyalty_points: 50 });
    expect(query(`SELECT type, amount, balance_after FROM customer_ledger WHERE customer_id = ? ORDER BY rowid`, [jane]).slice(1))
      .toEqual([
        { type: 'payment', amount: 200, balance_after: 0 },
        { type: 'sale_credit', amount: 100, balance_after: 100 },
      ]);
    expect(getProduct(productId).quantity).toBe(12);
  });
});

describe('a sale is all-or-nothing', () => {
  it('if the customer-ledger write fails midway, NOTHING is saved and the cart is kept; retry then works', async () => {
    await fill(2);
    const before = snapshot();
    await run(`CREATE TRIGGER boom BEFORE INSERT ON customer_ledger BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;`);
    await expect(completeSale({ customerId: jane, amountPaid: 100 })).rejects.toThrow(/simulated failure/);
    expect(snapshot()).toEqual(before); // sale, items, stock, balance, points, ledger, cart: all untouched
    expect(before.cart).toEqual([['Piece', 2]]);

    await run(`DROP TRIGGER boom`);
    await completeSale({ customerId: jane, amountPaid: 100 }); // the retry succeeds
    expect(getProduct(productId).quantity).toBe(10);
    expect(listCart()).toHaveLength(0);
    expect(getCustomer(jane)).toMatchObject({ balance: 200, loyalty_points: 60 });
  });

  it('even if the very LAST step (emptying the cart) fails, the whole sale rolls back', async () => {
    await fill(1);
    const before = snapshot();
    await run(`CREATE TRIGGER boom2 BEFORE DELETE ON cart_items BEGIN SELECT RAISE(ABORT, 'simulated cart failure'); END;`);
    await expect(completeSale()).rejects.toThrow(/simulated cart failure/); // walk-in sale
    expect(snapshot()).toEqual(before);

    await run(`DROP TRIGGER boom2`);
    await completeSale();
    expect(getProduct(productId).quantity).toBe(9);
    expect(count('sales')).toBe(before.sales + 1);
  });
});

describe('checks that must refuse BEFORE anything is written', () => {
  it('paying with loyalty points covers the amount and earns no new points', async () => {
    await fill(1); // 100, Jane has 60 points
    await completeSale({ customerId: jane, paymentMethod: 'loyalty', amountPaid: 40 });
    expect(getCustomer(jane)).toMatchObject({ loyalty_points: 20, balance: 260 }); // 60-40, and 60 unpaid becomes debt
    expect(query(`SELECT type, points, balance_after FROM loyalty_ledger WHERE customer_id = ? ORDER BY rowid DESC LIMIT 1`, [jane])[0])
      .toEqual({ type: 'redeem', points: 40, balance_after: 20 });
  });

  it('not enough points, or overpaying, is refused with nothing changed', async () => {
    await fill(1);
    const before = snapshot();
    await expect(completeSale({ customerId: jane, paymentMethod: 'loyalty', amountPaid: 100 })).rejects.toThrow(/Not enough loyalty points/);
    await expect(completeSale({ customerId: jane, amountPaid: 999 })).rejects.toThrow(/cannot exceed/);
    expect(snapshot()).toEqual(before);
  });

  it('if stock vanished after the item was added to the cart, the sale is refused untouched', async () => {
    const before = snapshot();
    await run(`UPDATE branch_stock SET quantity = 0 WHERE product_id = ?`, [productId]);
    await expect(completeSale()).rejects.toThrow(/Stock changed/);
    expect(count('sales')).toBe(before.sales);
    expect(listCart()).toHaveLength(1);
    await run(`UPDATE branch_stock SET quantity = ? WHERE product_id = ?`, [before.stock, productId]);
    await clearCart();
    expect(listCart()).toHaveLength(0);
  });
});

describe('customer accounts stay consistent', () => {
  it('a standalone payment is recorded atomically', async () => {
    await recordPayment(jane, 60, 'part payment', 'bank_transfer');
    expect(getCustomer(jane).balance).toBe(200);
    expect(query(`SELECT type, amount, balance_after, payment_method FROM customer_ledger WHERE customer_id = ? ORDER BY rowid DESC LIMIT 1`, [jane])[0])
      .toEqual({ type: 'payment', amount: 60, balance_after: 200, payment_method: 'bank_transfer' });
  });

  it('balance and points always equal the last line of their history', () => {
    const c = getCustomer(jane);
    const lastLedger = query(`SELECT balance_after FROM customer_ledger WHERE customer_id = ? ORDER BY rowid DESC LIMIT 1`, [jane])[0];
    const lastLoyalty = query(`SELECT balance_after FROM loyalty_ledger WHERE customer_id = ? ORDER BY rowid DESC LIMIT 1`, [jane])[0];
    expect(c.balance).toBe(lastLedger.balance_after);
    expect(c.loyalty_points).toBe(lastLoyalty.balance_after);
  });
});
