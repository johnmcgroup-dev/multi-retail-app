import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase, query } from '../src/db/database';
import { createSuperAdmin, loginByEmail, createInviteCode } from '../src/db/users';
import { signUpVerified, joinVerified } from './helpers';
import { listBranches, addBranch } from '../src/db/branches';
import { addProduct, getProduct, updateProduct } from '../src/db/products';
import { listVarietiesForProduct, updateParentVariety } from '../src/db/varieties';
import { setViewingBranchId } from '../src/db/session';
import { addSupplier, createPurchaseOrder, receivePurchaseOrder, getPurchaseOrder } from '../src/db/purchases';
import { transferStock, listProductStockByBranch } from '../src/db/stock';
import { addToCart, completeSale } from '../src/db/cart';
import { addExpense, getTotalExpenses } from '../src/db/expenses';
import { getSalesRevenue } from '../src/db/sales';
import { getCostOfGoodsSold, getProfitByProduct, getStockValue } from '../src/db/profit';
import { getBranchBreakdown } from '../src/db/branchReports';

let A, main, lekki, rice, beans, supplierId, riceUnits;
const avgAt = (productId, branchId) =>
  query(`SELECT avg_cost, quantity FROM branch_stock WHERE product_id = ? AND branch_id = ?`, [productId, branchId])[0];

async function buy(productId, unitName, qty, cost) {
  const unit = listVarietiesForProduct(productId).find((v) => v.name === unitName);
  const poId = await createPurchaseOrder({ supplierId, orderDate: '2026-10-01', items: [{ productId, varietyId: unit.id, quantity: qty, unitCost: cost }] });
  const po = getPurchaseOrder(poId);
  await receivePurchaseOrder(poId, { lines: po.items.map((i) => ({ itemId: i.id, quantity: i.quantity_ordered })) });
}
async function sell(productId, unitName, qty) {
  const unit = listVarietiesForProduct(productId).find((v) => v.name === unitName);
  await addToCart(getProduct(productId), unit, qty);
  return completeSale();
}

beforeAll(async () => {
  await initDatabase();
  await createSuperAdmin({ name: 'Dev', email: 'dev@x.com' });
  A = await signUpVerified({ tenantName: 'Acme', name: 'Alice', email: 'alice@a.com' });
  main = listBranches()[0];
  await addBranch('Lekki');
  lekki = listBranches().find((b) => b.name === 'Lekki');
  rice = await addProduct({ name: 'Rice', quantity: 0, base_price: 100 });
  const carton = listVarietiesForProduct(rice).find((v) => v.name === 'Carton');
  await updateParentVariety(carton.id, { qty: 10, price: 900 });
  supplierId = await addSupplier({ name: 'Dangote Foods' });
});

describe('average cost is kept per branch', () => {
  it('the first delivery sets the cost per piece (a carton of 10 at 800 = 80 each)', async () => {
    await buy(rice, 'Carton', 5, 800);
    expect(avgAt(rice, main.id)).toEqual({ avg_cost: 80, quantity: 50 });
  });

  it('a later delivery at a different price blends into a weighted average', async () => {
    await buy(rice, 'Carton', 1, 1000); // 10 more pieces at 100 each
    const row = avgAt(rice, main.id);
    expect(row.quantity).toBe(60);
    expect(row.avg_cost).toBeCloseTo((80 * 50 + 100 * 10) / 60, 6); // 83.3333
  });

  it('two lines for the SAME product in one delivery each blend correctly', async () => {
    const piece = listVarietiesForProduct(rice).find((v) => v.name === 'Piece');
    const carton = listVarietiesForProduct(rice).find((v) => v.name === 'Carton');
    const poId = await createPurchaseOrder({
      supplierId, orderDate: '2026-10-01',
      items: [{ productId: rice, varietyId: piece.id, quantity: 10, unitCost: 100 }, { productId: rice, varietyId: carton.id, quantity: 1, unitCost: 1000 }],
    });
    const po = getPurchaseOrder(poId);
    const before = avgAt(rice, main.id);
    await receivePurchaseOrder(poId, { lines: po.items.map((i) => ({ itemId: i.id, quantity: i.quantity_ordered })) });
    const after = avgAt(rice, main.id);
    expect(after.quantity).toBe(80);
    // all 20 extra pieces cost 100 each, whichever line they came in on
    expect(after.avg_cost).toBeCloseTo((before.avg_cost * 60 + 100 * 20) / 80, 6);
  });
});

describe('a sale freezes the cost of what it sold', () => {
  it('records cost per piece and the line cost, leaves the average alone, and flags it as known', async () => {
    const avgBefore = avgAt(rice, main.id).avg_cost;
    const saleId = await sell(rice, 'Piece', 6);
    const line = query(`SELECT * FROM sale_items WHERE sale_id = ?`, [saleId])[0];
    expect(line.cost_known).toBe(1);
    expect(line.cost_per_base_unit).toBeCloseTo(avgBefore, 6);
    expect(line.line_cost).toBeCloseTo(avgBefore * 6, 6);
    expect(avgAt(rice, main.id).avg_cost).toBeCloseTo(avgBefore, 6); // selling does not change the average
  });

  it('selling a Carton costs 10 pieces', async () => {
    const avg = avgAt(rice, main.id).avg_cost;
    const saleId = await sell(rice, 'Carton', 1);
    const line = query(`SELECT * FROM sale_items WHERE sale_id = ?`, [saleId])[0];
    expect(line.line_total).toBe(900);
    expect(line.line_cost).toBeCloseTo(avg * 10, 6);
  });

  it('a later, dearer delivery does not rewrite the profit of sales already made', async () => {
    const before = getCostOfGoodsSold().cogs;
    await buy(rice, 'Piece', 10, 500);
    expect(getCostOfGoodsSold().cogs).toBeCloseTo(before, 6);
  });
});

describe('transfers carry their cost with them', () => {
  it('the destination takes on the source cost, then blends with its own deliveries', async () => {
    const sourceAvg = avgAt(rice, main.id).avg_cost;
    await transferStock({ productId: rice, fromBranchId: main.id, toBranchId: lekki.id, quantity: 20 });
    expect(avgAt(rice, lekki.id).avg_cost).toBeCloseTo(sourceAvg, 6);
    expect(avgAt(rice, main.id).avg_cost).toBeCloseTo(sourceAvg, 6); // source unchanged

    setViewingBranchId(lekki.id);
    await buy(rice, 'Piece', 20, 110);
    const row = avgAt(rice, lekki.id);
    expect(row.quantity).toBe(40);
    expect(row.avg_cost).toBeCloseTo((sourceAvg * 20 + 110 * 20) / 40, 6);
    setViewingBranchId(main.id);
  });
});

describe('products with no known cost are flagged, not treated as free', () => {
  it('unknown-cost sales are counted separately; setting a cost price fixes future sales only', async () => {
    beans = await addProduct({ name: 'Beans', quantity: 10, base_price: 60 }); // opening stock, no cost
    const s1 = await sell(beans, 'Piece', 2); // revenue 120, cost unknown
    const l1 = query(`SELECT * FROM sale_items WHERE sale_id = ?`, [s1])[0];
    expect(l1).toMatchObject({ cost_known: 0, line_cost: 0 });
    expect(getCostOfGoodsSold()).toMatchObject({ unknownLines: 1, unknownRevenue: 120 });

    const b = getProduct(beans);
    await updateProduct(beans, { name: b.name, barcode: '', sku: '', categoryId: '', quantity: b.quantity, base_price: b.base_price, cost_price: 50 });
    const s2 = await sell(beans, 'Piece', 3); // revenue 180, cost 50 each from the product's cost price
    const l2 = query(`SELECT * FROM sale_items WHERE sale_id = ?`, [s2])[0];
    expect(l2).toMatchObject({ cost_known: 1, cost_per_base_unit: 50, line_cost: 150 });
    expect(getCostOfGoodsSold().unknownLines).toBe(1); // the old sale stays unknown
    await expect(updateProduct(beans, { name: 'Beans', quantity: 5, base_price: 60, cost_price: -1 })).rejects.toThrow(/negative/);
  });
});

describe('profit reports', () => {
  it('revenue, cost of goods, gross profit and net profit add up', async () => {
    await addExpense({ amount: 100, expenseDate: '2026-10-01' });
    const revenue = getSalesRevenue();
    const { cogs } = getCostOfGoodsSold();
    expect(revenue).toBe(600 + 900 + 120 + 180);
    // Rice cost: 6 pieces + 1 carton (10 pieces) at the average then; Beans: 3 x 50
    const riceAvg = (80 * 50 + 100 * 10 + 100 * 20 * 1) / 80; // average after the blended delivery, before the sales
    expect(cogs).toBeCloseTo(riceAvg * 16 + 150, 4);
    const gross = revenue - cogs;
    expect(gross - getTotalExpenses()).toBeCloseTo(revenue - cogs - 100, 6);
  });

  it('profit by product uses only lines with a known cost and counts the rest', () => {
    const rows = Object.fromEntries(getProfitByProduct().map((r) => [r.product_name, r]));
    expect(rows.Rice.revenue).toBe(1500);
    expect(rows.Rice.unknown_lines).toBe(0);
    expect(rows.Rice.profit).toBeCloseTo(1500 - rows.Rice.cost, 6);
    expect(rows.Rice.margin).toBeCloseTo(rows.Rice.profit / 1500, 6);
    expect(rows.Beans).toMatchObject({ revenue: 300, revenue_with_cost: 180, cost: 150, profit: 30, unknown_lines: 1 });
  });

  it('stock value uses the average cost, falling back to the product cost price', () => {
    const riceQty = avgAt(rice, main.id).quantity;
    const beansQty = avgAt(beans, main.id).quantity; // 5 left, valued at the 50 cost price
    const v = getStockValue();
    expect(v.value).toBeCloseTo(riceQty * avgAt(rice, main.id).avg_cost + beansQty * 50, 4);
    expect(v.unknownUnits).toBe(0);
  });

  it('stock with no cost anywhere is reported as unknown units, not valued at zero', async () => {
    const mystery = await addProduct({ name: 'Mystery', quantity: 7, base_price: 10 });
    expect(getStockValue().unknownUnits).toBe(7);
    expect(listProductStockByBranch(mystery).find((r) => r.branch_id === main.id).avg_cost).toBeNull();
  });

  it('branch views are separate and all-branches adds them up', () => {
    setViewingBranchId(lekki.id);
    expect(getCostOfGoodsSold().cogs).toBe(0);
    expect(getSalesRevenue()).toBe(0);
    const lekkiValue = getStockValue().value;
    expect(lekkiValue).toBeCloseTo(40 * avgAt(rice, lekki.id).avg_cost, 4);
    setViewingBranchId(null);
    const rows = Object.fromEntries(getBranchBreakdown().map((r) => [r.branch_name, r]));
    expect(rows['Main Branch'].revenue).toBe(1800);
    expect(rows['Main Branch'].net).toBeCloseTo(rows['Main Branch'].revenue - rows['Main Branch'].cogs - 100, 6);
    expect(rows.Lekki).toMatchObject({ revenue: 0, cogs: 0, net: 0 });
    expect(getCostOfGoodsSold().cogs).toBeCloseTo(rows['Main Branch'].cogs, 6);
    setViewingBranchId(main.id);
  });

  it('a Lekki manager sees only Lekki, and another business sees nothing', async () => {
    const code = await createInviteCode({ tenantId: A.tenantId, role: 'manager', branchId: lekki.id, createdByUserId: A.userId });
    await joinVerified({ code, name: 'Lola', email: 'lola@a.com' });
    expect(getCostOfGoodsSold().cogs).toBe(0);
    expect(getProfitByProduct()).toHaveLength(0);
    expect(getStockValue().value).toBeCloseTo(40 * avgAt(rice, lekki.id).avg_cost, 4);

    await signUpVerified({ tenantName: 'Beta', name: 'Bob', email: 'bob@b.com' });
    expect(getStockValue()).toEqual({ value: 0, unknownUnits: 0 });
    expect(getProfitByProduct()).toHaveLength(0);
    expect(getCostOfGoodsSold()).toEqual({ cogs: 0, unknownRevenue: 0, unknownLines: 0 });
  });
});
