// varieties.js
//
// Rules this file encodes (matching what you specified):
//  - A product has these parent varieties: Piece, Roll, Bundle, Dozen, Packet, Carton
//  - Each parent (except Piece) has a "Half-X" variety: Half-Roll, Half-Bundle,
//    Half-Dozen, Half-Packet, Half-Carton
//  - By default, Half-X qty/price = parent qty/price ÷ 2
//  - The user CAN manually overwrite a Half-X value. Once overwritten, it stays
//    at that value and does NOT get silently recalculated when the parent changes.
//  - A "Reset to half" action restores it back to exactly half of the current parent.

import { query, run } from './database';
import { newId } from './id';

export const PARENT_VARIETY_NAMES = ['Piece', 'Roll', 'Bundle', 'Dozen', 'Packet', 'Carton'];

// Maps each half-variety name to its parent name. Piece has no half.
export const HALF_TO_PARENT = {
  'Half-Roll': 'Roll',
  'Half-Bundle': 'Bundle',
  'Half-Dozen': 'Dozen',
  'Half-Packet': 'Packet',
  'Half-Carton': 'Carton',
};

export function isHalfVariety(name) {
  return Object.prototype.hasOwnProperty.call(HALF_TO_PARENT, name);
}

export function roundPrice(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function roundQty(n) {
  // Qty allows decimals (e.g. half of 3 pieces = 1.5), rounded to 2 decimal places.
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Pure calculation function - no database access, easy to verify/test on its own.
export function calcHalf(parentQty, parentPrice) {
  return {
    qty: roundQty(Number(parentQty) / 2),
    price: roundPrice(Number(parentPrice) / 2),
  };
}

export function listVarietiesForProduct(productId) {
  return query(`SELECT * FROM product_varieties WHERE product_id = ? ORDER BY name`, [productId]);
}

// Creates all 6 parent varieties + 5 half varieties for a brand-new product.
// Parents start at qty 0 / price 0 (user fills them in); halves start auto-calculated (0/0, so also 0).
export async function createDefaultVarieties(productId) {
  const parentIds = {};

  for (const name of PARENT_VARIETY_NAMES) {
    const id = newId('var');
    parentIds[name] = id;
    await run(
      `INSERT INTO product_varieties (id, product_id, name, qty, price, is_half_variant, parent_variety_id, is_manual_override)
       VALUES (?, ?, ?, 0, 0, 0, NULL, 0)`,
      [id, productId, name]
    );
  }

  for (const [halfName, parentName] of Object.entries(HALF_TO_PARENT)) {
    const id = newId('var');
    await run(
      `INSERT INTO product_varieties (id, product_id, name, qty, price, is_half_variant, parent_variety_id, is_manual_override)
       VALUES (?, ?, ?, 0, 0, 1, ?, 0)`,
      [id, productId, halfName, parentIds[parentName]]
    );
  }
}

// Update a PARENT variety's qty/price. After saving, re-sync any of its half-variety
// children that have NOT been manually overridden by the user.
export async function updateParentVariety(varietyId, { qty, price }) {
  await run(`UPDATE product_varieties SET qty = ?, price = ? WHERE id = ?`, [
    roundQty(qty),
    roundPrice(price),
    varietyId,
  ]);

  const children = query(
    `SELECT * FROM product_varieties WHERE parent_variety_id = ? AND is_manual_override = 0`,
    [varietyId]
  );

  for (const child of children) {
    const half = calcHalf(qty, price);
    await run(`UPDATE product_varieties SET qty = ?, price = ? WHERE id = ?`, [
      half.qty,
      half.price,
      child.id,
    ]);
  }
}

// Update a HALF variety manually - this marks it as overridden so future parent
// changes will no longer silently recalculate it.
export async function overrideHalfVariety(varietyId, { qty, price }) {
  await run(
    `UPDATE product_varieties SET qty = ?, price = ?, is_manual_override = 1 WHERE id = ?`,
    [roundQty(qty), roundPrice(price), varietyId]
  );
}

// "Reset to half" button action - recalculates from the CURRENT parent value right now,
// and clears the override flag so it goes back to tracking the parent automatically.
export async function resetHalfToParent(varietyId) {
  const [variety] = query(`SELECT * FROM product_varieties WHERE id = ?`, [varietyId]);
  if (!variety || !variety.parent_variety_id) return;

  const [parent] = query(`SELECT * FROM product_varieties WHERE id = ?`, [variety.parent_variety_id]);
  if (!parent) return;

  const half = calcHalf(parent.qty, parent.price);
  await run(
    `UPDATE product_varieties SET qty = ?, price = ?, is_manual_override = 0 WHERE id = ?`,
    [half.qty, half.price, variety.id]
  );
}
