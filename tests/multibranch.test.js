import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase, query, runBatch } from '../src/db/database';
import { createSuperAdmin, signUpAsNewTenantOwner, loginByEmail, createInviteCode, joinWithInviteCode } from '../src/db/users';
import { listBranches, addBranch, setBranchActive } from '../src/db/branches';
import { addProduct, listProducts, getProduct, addStock } from '../src/db/products';
import { searchProducts } from '../src/db/search';
import { transferStock, listTransfers, listProductStockByBranch } from '../src/db/stock';
import { addToCart, completeSale, listCart } from '../src/db/cart';
import { listSales, getSale, getSaleItems, getSalesRevenue } from '../src/db/sales';
import { addExpense, listExpenses, getTotalExpenses } from '../src/db/expenses';
import { listVarietiesForProduct } from '../src/db/varieties';
import { getCurrentBranchId, setViewingBranchId } from '../src/db/session';

let A, B, mainA, lekki, productId;

const piece = () => listVarietiesForProduct(productId).find((v) => v.name === 'Piece');
const stockAt = (branchId) => listProductStockByBranch(productId).find((r) => r.branch_id === branchId).quantity;

beforeAll(async () => {
  await initDatabase();
  await createSuperAdmin({ name: 'Dev', email: 'dev@x.com' });
  A = await signUpAsNewTenantOwner({ tenantName: 'Acme', name: 'Alice', email: 'alice@a.com' });
});

describe('branches', () => {
  it('a new tenant starts with one Main Branch, selected by default', () => {
    const branches = listBranches();
    expect(branches).toHaveLength(1);
    expect(branches[0].name).toBe('Main Branch');
    mainA = branches[0];
    expect(getCurrentBranchId()).toBe(mainA.id);
  });

  it('owner can add a branch; duplicate names are refused', async () => {
    const id = await addBranch('Lekki Outlet');
    lekki = listBranches().find((b) => b.id === id);
    expect(listBranches()).toHaveLength(2);
    await expect(addBranch('lekki outlet')).rejects.toThrow(/already exists/);
  });
});

describe('per-branch stock', () => {
  it('opening stock goes to the selected branch only', async () => {
    productId = await addProduct({ name: 'Rice 50kg', quantity: 10, base_price: 100 });
    expect(listProducts()[0].quantity).toBe(10);
    setViewingBranchId(lekki.id);
    expect(listProducts()[0].quantity).toBe(0);
    expect(searchProducts('rice')[0].quantity).toBe(0);
  });

  it('Add Stock applies to the working branch and "all" sums them', async () => {
    await addStock(productId, 5, 'delivery');
    expect(getProduct(productId).quantity).toBe(5);
    setViewingBranchId(null);
    expect(getCurrentBranchId()).toBeNull();
    expect(getProduct(productId).quantity).toBe(15);
    expect(listProducts()[0].quantity).toBe(15);
  });

  it('writing branch data while viewing all branches is refused', async () => {
    await expect(addStock(productId, 1)).rejects.toThrow(/specific branch/);
    await expect(addToCart(getProduct(productId), piece(), 1)).rejects.toThrow(/specific branch/);
  });
});

describe('stock transfers', () => {
  it('moves stock between branches and logs it', async () => {
    setViewingBranchId(mainA.id);
    await transferStock({ productId, fromBranchId: mainA.id, toBranchId: lekki.id, quantity: 4, note: 'restock Lekki' });
    expect(stockAt(mainA.id)).toBe(6);
    expect(stockAt(lekki.id)).toBe(9);
    const log = listTransfers();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ product_name: 'Rice 50kg', from_branch_name: 'Main Branch', to_branch_name: 'Lekki Outlet', quantity: 4 });
  });

  it('refuses over-transfers, same-branch transfers and bad quantities - and changes nothing', async () => {
    await expect(transferStock({ productId, fromBranchId: mainA.id, toBranchId: lekki.id, quantity: 7 })).rejects.toThrow(/Not enough stock/);
    await expect(transferStock({ productId, fromBranchId: mainA.id, toBranchId: mainA.id, quantity: 1 })).rejects.toThrow(/two different branches/);
    await expect(transferStock({ productId, fromBranchId: mainA.id, toBranchId: lekki.id, quantity: 0 })).rejects.toThrow(/greater than zero/);
    expect(stockAt(mainA.id)).toBe(6);
    expect(stockAt(lekki.id)).toBe(9);
    expect(listTransfers()).toHaveLength(1);
  });

  it('a failed batch is rolled back completely (atomic)', async () => {
    await expect(
      runBatch([
        { sql: `INSERT INTO tenants (id, name) VALUES ('ghost', 'Ghost')` },
        { sql: `INSERT INTO table_that_does_not_exist VALUES (1)` },
      ])
    ).rejects.toThrow();
    expect(query(`SELECT id FROM tenants WHERE id = 'ghost'`)).toHaveLength(0);
  });
});

describe('branch staff', () => {
  let managerMain;

  it('a cashier invited to Lekki is locked to Lekki and cannot transfer or manage branches', async () => {
    const code = await createInviteCode({ tenantId: A.tenantId, role: 'cashier', branchId: lekki.id, createdByUserId: A.userId });
    await joinWithInviteCode({ code, name: 'Chidi', email: 'chidi@a.com' });
    expect(getCurrentBranchId()).toBe(lekki.id);
    setViewingBranchId(mainA.id); // a cashier cannot pick another branch
    expect(getCurrentBranchId()).toBe(lekki.id);
    expect(listProducts()[0].quantity).toBe(9);
    await expect(transferStock({ productId, fromBranchId: lekki.id, toBranchId: mainA.id, quantity: 1 })).rejects.toThrow(/permission/);
    await expect(addBranch('Sneaky')).rejects.toThrow(/Only an Owner or Admin/);
  });

  it('a sale deducts only the selling branch and is recorded against it', async () => {
    await addToCart(getProduct(productId), piece(), 3);
    expect(listCart()).toHaveLength(1);
    const saleId = await completeSale();
    expect(getProduct(productId).quantity).toBe(6); // Lekki: 9 - 3
    expect(listCart()).toHaveLength(0);
    expect(getSale(saleId).branch_name).toBe('Lekki Outlet');
    expect(getSaleItems(saleId)).toHaveLength(1);
    expect(listSales()).toHaveLength(1);
  });

  it('the cashier only sees Lekki sales; the owner sees them per branch and combined', async () => {
    await loginByEmail('alice@a.com');
    setViewingBranchId(mainA.id);
    expect(listSales()).toHaveLength(0);
    expect(stockAt(mainA.id)).toBe(6); // untouched by Lekki's sale
    setViewingBranchId(lekki.id);
    expect(listSales()).toHaveLength(1);
    setViewingBranchId(null);
    expect(listSales()).toHaveLength(1);
    expect(listSales()[0].branch_name).toBe('Lekki Outlet');
    expect(getSalesRevenue()).toBe(300);
  });

  it('carts are per user: the owner never sees the cashier\'s open cart', async () => {
    await loginByEmail('chidi@a.com');
    await addToCart(getProduct(productId), piece(), 1);
    expect(listCart()).toHaveLength(1);
    await loginByEmail('alice@a.com');
    setViewingBranchId(lekki.id);
    expect(listCart()).toHaveLength(0);
  });

  it('a manager can only transfer OUT of their own branch', async () => {
    const code = await createInviteCode({ tenantId: A.tenantId, role: 'manager', branchId: mainA.id, createdByUserId: A.userId });
    await joinWithInviteCode({ code, name: 'Mary', email: 'mary@a.com' });
    managerMain = true;
    await expect(transferStock({ productId, fromBranchId: lekki.id, toBranchId: mainA.id, quantity: 1 })).rejects.toThrow(/own branch/);
    await transferStock({ productId, fromBranchId: mainA.id, toBranchId: lekki.id, quantity: 1 });
    expect(stockAt(mainA.id)).toBe(5);
    expect(stockAt(lekki.id)).toBe(7);
  });

  it('expenses belong to one branch; staff cannot file against another', async () => {
    await addExpense({ amount: 50, expenseDate: '2026-10-01', description: 'Main rent' });
    await loginByEmail('chidi@a.com');
    await addExpense({ amount: 20, expenseDate: '2026-10-01', description: 'Lekki fuel', branchId: mainA.id });
    expect(listExpenses().map((e) => e.description)).toEqual(['Lekki fuel']);
    expect(getTotalExpenses()).toBe(20);
    expect(managerMain).toBe(true);
    await loginByEmail('alice@a.com');
    setViewingBranchId(null);
    expect(getTotalExpenses()).toBe(70);
    await expect(addExpense({ amount: 5, expenseDate: '2026-10-01' })).rejects.toThrow(/Choose which branch/);
  });
});

describe('branch rules', () => {
  it('cannot deactivate a branch that still has active staff', async () => {
    await loginByEmail('alice@a.com');
    await expect(setBranchActive(lekki.id, false)).rejects.toThrow(/staff/);
  });
});

describe('tenant isolation still holds', () => {
  it('a second business cannot see or touch the first one\'s branches, stock or sales', async () => {
    B = await signUpAsNewTenantOwner({ tenantName: 'Beta', name: 'Bob', email: 'bob@b.com' });
    expect(listBranches()).toHaveLength(1);
    expect(listBranches()[0].id).not.toBe(mainA.id);
    expect(listProducts()).toHaveLength(0);
    expect(getProduct(productId)).toBeNull();
    expect(listSales()).toHaveLength(0);
    const bMain = listBranches()[0];
    await expect(transferStock({ productId, fromBranchId: mainA.id, toBranchId: bMain.id, quantity: 1 })).rejects.toThrow(/not found/i);
  });

  it('cannot deactivate the last active branch', async () => {
    await expect(setBranchActive(listBranches()[0].id, false)).rejects.toThrow(/last active branch/);
  });
});
