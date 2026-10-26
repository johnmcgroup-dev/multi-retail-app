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

export const PIECE_NAME = 'Piece';

export function listVarietiesForProduct(productId) {
  return query(`SELECT * FROM product_varieties WHERE product_id = ? ORDER BY name`, [productId]);
}

// True if this product has at least one variety (besides Piece, which is
// always fixed) that has actually been configured with a real Qty and Price.
// Used to warn on the product list that a new product still needs setup.
export function hasConfiguredVarieties(productId) {
  const rows = query(
    `SELECT COUNT(*) AS c FROM product_varieties
     WHERE product_id = ? AND name != ? AND qty > 0 AND price > 0`,
    [productId, PIECE_NAME]
  );
  return rows[0].c > 0;
}

// Creates all 6 parent varieties + 5 half varieties for a brand-new product.
// "Piece" is special: it IS the base stock unit, so its Qty is always fixed
// at 1 (never 0, and not user-editable) - otherwise stock math would treat
// selling a Piece as consuming zero stock, which allowed unlimited overselling.
// Its starting price comes from the product's base price entered on the form.
// Other parents start at qty 0 / price 0 until the user sets them up; halves
// start auto-calculated from their (currently 0) parent, so also 0.
export async function createDefaultVarieties(productId, piecePrice = 0) {
  const parentIds = {};

  for (const name of PARENT_VARIETY_NAMES) {
    const id = newId('var');
    parentIds[name] = id;
    const isPiece = name === PIECE_NAME;
    await run(
      `INSERT INTO product_varieties (id, product_id, name, qty, price, is_half_variant, parent_variety_id, is_manual_override)
       VALUES (?, ?, ?, ?, ?, 0, NULL, 0)`,
      [id, productId, name, isPiece ? 1 : 0, isPiece ? piecePrice : 0]
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
// Locked at this layer (not just the UI): Piece's Qty can never become anything
// but 1, since it defines what "1 base stock unit" means.
export async function updateParentVariety(varietyId, { qty, price }) {
  const [existing] = query(`SELECT * FROM product_varieties WHERE id = ?`, [varietyId]);
  const safeQty = existing && existing.name === PIECE_NAME ? 1 : roundQty(qty);

  await run(`UPDATE product_varieties SET qty = ?, price = ? WHERE id = ?`, [
    safeQty,
    roundPrice(price),
    varietyId,
  ]);

  const children = query(
    `SELECT * FROM product_varieties WHERE parent_variety_id = ? AND is_manual_override = 0`,
    [varietyId]
  );

  for (const child of children) {
    const half = calcHalf(safeQty, price);
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
