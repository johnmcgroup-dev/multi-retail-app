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
import { DEMO_TENANT_ID } from './products';

export function listCart() {
  return query(
    `SELECT * FROM cart_items WHERE tenant_id = ? ORDER BY created_at ASC`,
    [DEMO_TENANT_ID]
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
       (id, tenant_id, product_id, variety_id, product_name, variety_name, unit_price, base_units_per_item, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, DEMO_TENANT_ID, product.id, variety.id, product.name, variety.name, variety.price, variety.qty, qtyToAdd]
  );
  return id;
}

export async function updateCartItemQuantity(cartItemId, newQuantity) {
  const [item] = query(`SELECT * FROM cart_items WHERE id = ?`, [cartItemId]);
  if (!item) return;

  if (newQuantity <= 0) {
    await removeCartItem(cartItemId);
    return;
  }

  const [product] = query(`SELECT * FROM products WHERE id = ?`, [item.product_id]);
  const available = availableStockFor(product, item.product_id, cartItemId);
  const requiredBaseUnits = item.base_units_per_item * newQuantity;

  if (requiredBaseUnits > available) {
    throw new Error(`Not enough stock. Only ${available} unit(s) of "${item.product_name}" available.`);
  }

  await run(`UPDATE cart_items SET quantity = ? WHERE id = ?`, [newQuantity, cartItemId]);
}

export async function removeCartItem(cartItemId) {
  await run(`DELETE FROM cart_items WHERE id = ?`, [cartItemId]);
}

// Clear button action - empties the whole cart. UI is responsible for asking
// the user to confirm before calling this.
export async function clearCart() {
  await run(`DELETE FROM cart_items WHERE tenant_id = ?`, [DEMO_TENANT_ID]);
}

// Completes the sale:
//  1. Creates a sales record + frozen sale_items snapshot of the cart.
//  2. Deducts the correct base-unit stock from each product.
//  3. Empties the cart.
// If anything looks wrong (e.g. stock changed since items were added), this
// re-checks stock right before committing, so we never oversell.
export async function completeSale({ customerName = '', customerPhone = '' } = {}) {
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
    const [product] = query(`SELECT * FROM products WHERE id = ?`, [productId]);
    if (!product || product.quantity < required) {
      throw new Error(
        `Stock changed and is no longer sufficient for "${product ? product.name : productId}". Please adjust the cart.`
      );
    }
  }

  const total = cartTotal(items);
  const saleId = newId('sale');
  await run(
    `INSERT INTO sales (id, tenant_id, total, customer_name, customer_phone) VALUES (?, ?, ?, ?, ?)`,
    [saleId, DEMO_TENANT_ID, total, customerName || null, customerPhone || null]
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
    await run(`UPDATE products SET quantity = quantity - ? WHERE id = ?`, [required, productId]);
  }

  await run(`DELETE FROM cart_items WHERE tenant_id = ?`, [DEMO_TENANT_ID]);

  return saleId;
}
