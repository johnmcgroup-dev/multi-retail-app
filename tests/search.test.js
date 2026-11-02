import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase } from '../src/db/database';
import { createSuperAdmin } from '../src/db/users';
import { signUpVerified } from './helpers';
import { addProduct } from '../src/db/products';
import { addCategory } from '../src/db/categories';
import { searchProducts } from '../src/db/search';

beforeAll(async () => {
  await initDatabase();
  await createSuperAdmin({ name: 'Dev', email: 'dev@x.com' });
  await signUpVerified({ tenantName: 'Acme', name: 'Alice', email: 'alice@a.com' });
  const groceries = await addCategory('Groceries');
  const tools = await addCategory('Hardware Tools');
  await addProduct({ name: 'Rice 50kg', barcode: '6001234567890', sku: 'RICE-50', categoryId: groceries, quantity: 4, base_price: 100 });
  await addProduct({ name: 'Hammer', barcode: 'QR:HAM-001', sku: 'HM-1', categoryId: tools, quantity: 0, base_price: 50 });
});

describe('finding a product on the purchase order screen', () => {
  const names = (term) => searchProducts(term).map((p) => p.name);

  it('by name, partial and any case', () => {
    expect(names('rice')).toEqual(['Rice 50kg']);
    expect(names('HAMM')).toEqual(['Hammer']);
  });
  it('by barcode, including a scanned QR code\'s text', () => {
    expect(names('6001234567890')).toEqual(['Rice 50kg']);
    expect(names('QR:HAM-001')).toEqual(['Hammer']);
  });
  it('by SKU', () => {
    expect(names('rice-50')).toEqual(['Rice 50kg']);
  });
  it('by category', () => {
    expect(names('groc')).toEqual(['Rice 50kg']);
    expect(names('tools')).toEqual(['Hammer']);
  });
  it('finds products with no stock too (you buy what you ran out of)', () => {
    expect(searchProducts('hammer')[0].quantity).toBe(0);
  });
  it('shows nothing for a miss, and lists products when the box is empty', () => {
    expect(names('zzzz')).toEqual([]);
    expect(names('').sort()).toEqual(['Hammer', 'Rice 50kg']);
  });
});
