import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase, query, run } from '../src/db/database';
import { createSuperAdmin } from '../src/db/users';
import { signUpVerified } from './helpers';
import { addProduct, updateProduct, getProduct } from '../src/db/products';
import { findProductsByCode } from '../src/db/search';
import { setViewingBranchId } from '../src/db/session';
import { listBranches, addBranch } from '../src/db/branches';
import { SCAN, nextStamps, looksLikeScan } from '../src/db/scanner';

// Replays a code being typed: `gap` ms between characters.
function type(code, gap, start = 1000) {
  let stamps = []; let prev = '';
  [...code].forEach((_, i) => {
    const value = code.slice(0, i + 1);
    stamps = nextStamps(stamps, prev, value, start + i * gap);
    prev = value;
  });
  return stamps;
}

describe('telling a scanner from a person', () => {
  it('a code arriving in a rapid burst looks like a scan', () => {
    expect(looksLikeScan('6001234567890', type('6001234567890', 8))).toBe(true);
    expect(looksLikeScan('6001234567890', type('6001234567890', SCAN.MAX_GAP_MS))).toBe(true);
  });
  it('the same code typed by a person does not', () => {
    expect(looksLikeScan('6001234567890', type('6001234567890', 150))).toBe(false);
    expect(looksLikeScan('6001', type('6001', 300))).toBe(false);
  });
  it('a code delivered in one step (pasted, or a scanner that sends it whole) counts', () => {
    expect(looksLikeScan('6001234567890', [5000])).toBe(true);
  });
  it('very short input never counts, however fast', () => {
    expect(looksLikeScan('123', type('123', 5))).toBe(false);
  });
  it('typing a few letters by hand and then scanning does not count as one scan', () => {
    let stamps = type('ab', 400);
    let prev = 'ab';
    for (const [i, ch] of [...'6001234'].entries()) {
      const value = prev + ch;
      stamps = nextStamps(stamps, prev, value, 3000 + i * 8);
      prev = value;
    }
    expect(looksLikeScan(prev, stamps)).toBe(false);
  });
  it('deleting restarts the measurement', () => {
    expect(nextStamps([1, 2, 3], 'abc', 'ab', 99)).toEqual([99]);
    expect(nextStamps([1, 2], 'ab', '', 99)).toEqual([]);
  });
});

describe('finding the product for a scanned code', () => {
  let main, lekki;
  beforeAll(async () => {
    await initDatabase();
    await createSuperAdmin({ name: 'Dev', email: 'dev@x.com' });
    await signUpVerified({ tenantName: 'Acme', name: 'Alice', email: 'alice@a.com' });
    main = listBranches()[0];
    await addBranch('Lekki');
    lekki = listBranches().find((b) => b.name === 'Lekki');
    await addProduct({ name: 'Rice 50kg', barcode: '6001234567890', sku: 'RICE-50', quantity: 7, base_price: 100 });
    await addProduct({ name: 'Hammer', barcode: 'QR:HAM-001', quantity: 0, base_price: 50 });
  });

  it('matches a barcode or SKU exactly, in any case, and shows the stock at this branch', () => {
    expect(findProductsByCode('6001234567890')).toHaveLength(1);
    expect(findProductsByCode(' qr:ham-001 ')[0].name).toBe('Hammer');
    expect(findProductsByCode('rice-50')[0]).toMatchObject({ name: 'Rice 50kg', quantity: 7 });
    setViewingBranchId(lekki.id);
    expect(findProductsByCode('RICE-50')[0].quantity).toBe(0);
    setViewingBranchId(main.id);
  });

  it('a partial code or a name is not a match', () => {
    expect(findProductsByCode('6001')).toEqual([]);
    expect(findProductsByCode('Rice')).toEqual([]);
    expect(findProductsByCode('')).toEqual([]);
  });

  it('refuses to save a second product with the same barcode or SKU', async () => {
    await expect(addProduct({ name: 'Copy', barcode: '6001234567890', base_price: 1 })).rejects.toThrow(/already used by "Rice 50kg"/);
    await expect(addProduct({ name: 'Copy', barcode: 'x-1', sku: 'rice-50', base_price: 1 })).rejects.toThrow(/SKU .* already used/);
    const id = (await addProduct({ name: 'Spade', barcode: 'SP-1', base_price: 1 }));
    await expect(updateProduct(id, { name: 'Spade', barcode: 'QR:HAM-001', sku: '', quantity: 0, base_price: 1 })).rejects.toThrow(/already used by "Hammer"/);
    await updateProduct(id, { name: 'Spade 2', barcode: 'SP-1', sku: '', quantity: 0, base_price: 1 }); // unchanged code: fine
    expect(getProduct(id).name).toBe('Spade 2');
  });

  it('with older duplicate data it returns BOTH, so nothing is picked by guesswork - and editing such a product still works', async () => {
    const rice = findProductsByCode('RICE-50')[0];
    const dupId = await addProduct({ name: 'Old duplicate', barcode: 'tmp-1', base_price: 1 });
    await run(`UPDATE products SET barcode = '6001234567890' WHERE id = ?`, [dupId]); // as if created before the rule existed
    expect(findProductsByCode('6001234567890').map((p) => p.name).sort()).toEqual(['Old duplicate', 'Rice 50kg']);
    await updateProduct(dupId, { name: 'Old duplicate edited', barcode: '6001234567890', sku: '', quantity: 0, base_price: 1 });
    expect(getProduct(dupId).name).toBe('Old duplicate edited');
    expect(rice.id).toBeTruthy();
  });

  it('another business never matches this one\'s codes', async () => {
    await signUpVerified({ tenantName: 'Beta', name: 'Bob', email: 'bob@b.com' });
    expect(findProductsByCode('6001234567890')).toEqual([]);
    expect(query(`SELECT COUNT(*) AS c FROM products`)[0].c).toBeGreaterThan(0);
  });
});
