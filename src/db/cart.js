// cart.js
//
// Key rules this encodes:
//  - The cart is stored in the database (not just memory/localStorage), so it
//    survives a refresh, navigating away, or closing the browser.
//  - The cart is ONLY emptied by: a completed sale, or the Clear button.
//  - Adding/editing cart quantity must never let stock go negative. Each
//    variety has its own "qty" (how many base Piece-units it represents),
//    e.g. 1 Carton might equal 12 Pieces - so selling 2 Cartons requires
//    24 Pieces of stock to be available.

import { query, run } from './database';
import { newId } from './id';
import { getCurrentTenantId, getCurrentBranchId, requireBranchId, getCurrentUser } from './session';
import { getProduct } from './products';
import { changeBranchStock } from './stock';
import {
  ensureWalkInCustomer,
  getCustomer,
  recordSaleCredit,
  recordPaymentAppliedFromSale,
  earnLoyaltyPoints,
  redeemLoyaltyPoints,
} from './customers';
import { getCompanySettings } from './companySettings';
import { formatMoney } from './currency';

// A cart belongs to ONE user working in ONE branch. Two cashiers at the same
// branch each have their own cart, and an owner viewing "all branches" has
// no cart at all (selling needs a specific branch).
export function listCart() {
  const branchId = getCurrentBranchId();
  const user = getCurrentUser();
  if (!branchId || !user) return [];
  return query(
    `SELECT * FROM cart_items WHERE tenant_id = ? AND branch_id = ? AND user_id = ? ORDER BY created_at ASC, rowid ASC`,
    [getCurrentTenantId(), branchId, user.id]
  );
}

export function cartTotal(items) {
  return items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
}

// How many base (Piece) units are currently reserved across the whole cart
// for a given product - needed so we don't let two different cart lines of
// the SAME product (e.g. 1 Carton + 3 Pieces of the same item) together
// oversell the stock.
function baseUnitsReservedForProduct(productId, excludingCartItemId = null) {
  const items = listCart().filter(
    (i) => i.product_id === productId && i.id !== excludingCartItemId
  );
  return items.reduce((sum, i) => sum + i.base_units_per_item * i.quantity, 0);
}

export function availableStockFor(product, productId = product.id, excludingCartItemId = null) {
  const reserved = baseUnitsReservedForProduct(productId, excludingCartItemId);
  return product.quantity - reserved;
}

// Adds a variety to the cart, or increases quantity if that exact product+variety
// is already in the cart. Throws a plain Error with a user-facing message if
// there isn't enough stock - the UI is expected to catch and display it.
export async function addToCart(product, variety, qtyToAdd = 1) {
  if (!variety.qty || variety.qty <= 0) {
    throw new Error(
      `"${variety.name}" has not been set up yet (Qty is 0). Open this product and set its Qty/Price in Product Varieties before selling it.`
    );
  }

  const branchId = requireBranchId();
  const requiredBaseUnits = variety.qty * qtyToAdd;
  const available = availableStockFor(product);

  if (requiredBaseUnits > available) {
    throw new Error(
      `Not enough stock. Only ${available} unit(s) of "${product.name}" available.`
    );
  }

  const existing = listCart().find(
    (i) => i.product_id === product.id && i.variety_id === variety.id
  );

  if (existing) {
    await run(`UPDATE cart_items SET quantity = quantity + ? WHERE id = ?`, [
      qtyToAdd,
      existing.id,
    ]);
    return existing.id;
  }

  const id = newId('cart');
  await run(
    `INSERT INTO cart_items
       (id, tenant_id, branch_id, user_id, product_id, variety_id, product_name, variety_name, unit_price, base_units_per_item, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, getCurrentTenantId(), branchId, getCurrentUser().id, product.id, variety.id, product.name, variety.name, variety.price, variety.qty, qtyToAdd]
  );
  return id;
}

export async function updateCartItemQuantity(cartItemId, newQuantity) {
  const item = listCart().find((i) => i.id === cartItemId);
  if (!item) return;

  if (newQuantity <= 0) {
    await removeCartItem(cartItemId);
    return;
  }

  const product = getProduct(item.product_id);
  if (!product) throw new Error('Product not found.');
  const available = availableStockFor(product, item.product_id, cartItemId);
  const requiredBaseUnits = item.base_units_per_item * newQuantity;

  if (requiredBaseUnits > available) {
    throw new Error(`Not enough stock. Only ${available} unit(s) of "${item.product_name}" available.`);
  }

  await run(`UPDATE cart_items SET quantity = ? WHERE id = ?`, [newQuantity, cartItemId]);
}

// Changes a cart line's variety and/or unit price before the sale is
// completed. Re-validates stock exactly like a quantity change does: the
// new variety's base-unit cost is checked against what's available, counting
// this line's OWN current reservation as free (since it's being replaced,
// not added on top of).
export async function updateCartItemDetails(cartItemId, { varietyId, unitPrice, quantity }) {
  const item = listCart().find((i) => i.id === cartItemId);
  if (!item) return;

  const [variety] = query(`SELECT * FROM product_varieties WHERE id = ?`, [varietyId]);
  if (!variety) throw new Error('Variety not found.');
  if (!variety.qty || variety.qty <= 0) {
    throw new Error(`"${variety.name}" has not been set up yet (Qty is 0). Set it up in Product Varieties first.`);
  }

  const newQty = Number(quantity);
  if (newQty <= 0) throw new Error('Quantity must be greater than zero.');

  const product = getProduct(item.product_id);
  if (!product) throw new Error('Product not found.');
  const available = availableStockFor(product, item.product_id, cartItemId);
  const requiredBaseUnits = variety.qty * newQty;

  if (requiredBaseUnits > available) {
    throw new Error(`Not enough stock. Only ${available} unit(s) of "${product.name}" available.`);
  }

  await run(
    `UPDATE cart_items
       SET variety_id = ?, variety_name = ?, unit_price = ?, base_units_per_item = ?, quantity = ?
     WHERE id = ?`,
    [variety.id, variety.name, Number(unitPrice), variety.qty, newQty, cartItemId]
  );
}

export async function removeCartItem(cartItemId) {
  const item = listCart().find((i) => i.id === cartItemId);
  if (!item) return; // not this user's cart line - ignore
  await run(`DELETE FROM cart_items WHERE id = ?`, [cartItemId]);
}

// Empties the CURRENT user's cart at the CURRENT branch - never anyone else's.
async function deleteOwnCart() {
  const branchId = getCurrentBranchId();
  const user = getCurrentUser();
  if (!branchId || !user) return;
  await run(`DELETE FROM cart_items WHERE tenant_id = ? AND branch_id = ? AND user_id = ?`, [
    getCurrentTenantId(), branchId, user.id,
  ]);
}

// Clear button action - empties the whole cart. UI is responsible for asking
// the user to confirm before calling this.
export async function clearCart() {
  await deleteOwnCart();
}

// Completes the sale:
//  1. Creates a sales record + frozen sale_items snapshot of the cart.
//  2. Deducts the correct base-unit stock from each product.
//  3. Empties the cart.
// If anything looks wrong (e.g. stock changed since items were added), this
// re-checks stock right before committing, so we never oversell.
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// customerId: if not given, defaults to Walk-in Customer.
// amountPaid: how much is being paid right now, in currency.
// includeOutstanding: if true and the customer has a previous balance, the
//   amount paid can cover that balance too (oldest debt first), on top of
//   this sale's own total - so "total due" becomes sale total + old balance.
// paymentMethod: 'cash' | 'bank_transfer' | 'card' | 'loyalty'.
//
// Walk-in customers are always full payment on the sale itself and never
// carry a balance or loyalty points - there's no identity to track either
// across visits.
export async function completeSale({
  customerId = null,
  amountPaid = null,
  includeOutstanding = false,
  paymentMethod = 'cash',
} = {}) {
  const branchId = requireBranchId();
  const items = listCart();
  if (items.length === 0) {
    throw new Error('Cart is empty.');
  }

  // Re-validate stock per product right before committing, combining all
  // cart lines of the same product.
  const requiredByProduct = {};
  for (const item of items) {
    requiredByProduct[item.product_id] =
      (requiredByProduct[item.product_id] || 0) + item.base_units_per_item * item.quantity;
  }
  for (const [productId, required] of Object.entries(requiredByProduct)) {
    const product = getProduct(productId); // stock at THIS branch
    if (!product || product.quantity < required) {
      throw new Error(
        `Stock changed and is no longer sufficient for "${product ? product.name : productId}". Please adjust the cart.`
      );
    }
  }

  const saleTotal = cartTotal(items);
  const company = getCompanySettings();

  const resolvedCustomerId = customerId || (await ensureWalkInCustomer());
  const customer = getCustomer(resolvedCustomerId);
  const isWalkin = !!customer?.is_walkin;
  const applyToOldBalance = !isWalkin && includeOutstanding;
  const oldBalanceBefore = applyToOldBalance ? customer.balance : 0;

  const totalDue = round2(saleTotal + oldBalanceBefore);

  // Walk-in sales are always full payment on the sale - no credit tracking
  // for an anonymous customer, since there'd be no one to collect it from.
  const paid = isWalkin ? saleTotal : amountPaid === null ? totalDue : round2(Number(amountPaid));

  if (paid < 0) throw new Error('Amount paid cannot be negative.');
  if (paid > totalDue) {
    throw new Error(
      applyToOldBalance
        ? `Amount paid cannot exceed the total due (${formatMoney(totalDue, company.currency_code)}, including the previous balance of ${formatMoney(oldBalanceBefore, company.currency_code)}).`
        : `Amount paid cannot exceed the total (${formatMoney(totalDue, company.currency_code)}).`
    );
  }

  // Allocate the payment: previous balance first, then this sale.
  const paidTowardOldBalance = applyToOldBalance ? Math.min(paid, oldBalanceBefore) : 0;
  const paidTowardSale = round2(paid - paidTowardOldBalance);
  const saleOutstanding = round2(saleTotal - paidTowardSale);

  if (isWalkin && saleOutstanding > 0) {
    throw new Error('Walk-in Customer sales must be paid in full. Select a named customer to sell on credit.');
  }

  // If paying with loyalty points, confirm the customer has enough BEFORE
  // writing anything, so a failed redemption never leaves a sale half-done.
  let pointsToRedeem = 0;
  if (paymentMethod === 'loyalty' && paid > 0) {
    const redeemValue = company.points_redeem_value || 1;
    pointsToRedeem = Math.ceil(paid / redeemValue);
    if (pointsToRedeem > (customer?.loyalty_points || 0)) {
      throw new Error(
        `Not enough loyalty points. "${customer?.name}" has ${customer?.loyalty_points || 0}, but ${pointsToRedeem} are needed to cover ${formatMoney(paid, company.currency_code)}.`
      );
    }
  }

  // Points are earned on the portion of THIS sale actually paid, and only
  // when payment wasn't itself made with loyalty points - otherwise a
  // customer could pay with points and immediately earn points back on the
  // same money, inflating their balance for free.
  const pointsEarned =
    !isWalkin && paymentMethod !== 'loyalty'
      ? Math.floor(paidTowardSale * (company.points_per_amount || 0))
      : 0;

  const saleId = newId('sale');
  await run(
    `INSERT INTO sales
       (id, tenant_id, branch_id, total, amount_paid, previous_balance_paid, payment_method, loyalty_points_earned,
        customer_id, customer_name, customer_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      saleId,
      getCurrentTenantId(),
      branchId,
      saleTotal,
      paidTowardSale,
      paidTowardOldBalance,
      paymentMethod,
      pointsEarned,
      resolvedCustomerId,
      customer?.name || null,
      customer?.phone || null,
    ]
  );

  for (const item of items) {
    const lineTotal = item.unit_price * item.quantity;
    await run(
      `INSERT INTO sale_items
         (id, sale_id, product_id, variety_id, product_name, variety_name, unit_price, quantity, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId('si'), saleId, item.product_id, item.variety_id, item.product_name, item.variety_name, item.unit_price, item.quantity, lineTotal]
    );
  }

  for (const [productId, required] of Object.entries(requiredByProduct)) {
    await changeBranchStock(productId, branchId, -required);
  }

  if (saleOutstanding > 0) {
    await recordSaleCredit(resolvedCustomerId, saleId, saleOutstanding);
  }
  if (paidTowardOldBalance > 0) {
    await recordPaymentAppliedFromSale(resolvedCustomerId, saleId, paidTowardOldBalance, paymentMethod);
  }
  if (paymentMethod === 'loyalty' && pointsToRedeem > 0) {
    await redeemLoyaltyPoints(resolvedCustomerId, pointsToRedeem, 'Redeemed for sale payment', saleId);
  }
  if (pointsEarned > 0) {
    await earnLoyaltyPoints(resolvedCustomerId, pointsEarned, 'Earned from purchase', saleId);
  }

  await deleteOwnCart();

  return saleId;
}
