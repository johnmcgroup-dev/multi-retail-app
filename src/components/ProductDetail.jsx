import { useState } from 'react';
import { getProduct } from '../db/products';
import { listCategories } from '../db/categories';
import { getCompanySettings } from '../db/companySettings';
import { formatMoney } from '../db/currency';
import { listProductStockByBranch } from '../db/stock';
import { getCurrentUser, getCurrentBranchId, isElevated } from '../db/session';
import VarietyEditor from './VarietyEditor';
import ProductEditForm from './ProductEditForm';

export default function ProductDetail({ productId, onBack }) {
  const [editing, setEditing] = useState(false);
  const product = getProduct(productId);
  const categories = listCategories();
  const currencyCode = getCompanySettings().currency_code;
  const user = getCurrentUser();

  if (!product) {
    return (
      <div>
        <button className="link-btn" onClick={onBack}>← Back to products</button>
        <p>Product not found.</p>
      </div>
    );
  }

  const stockLabel = getCurrentBranchId() ? 'Stock (this branch)' : 'Stock (all branches)';

  return (
    <div className="product-detail">
      <button className="link-btn" onClick={onBack}>← Back to products</button>

      {editing ? (
        <ProductEditForm
          product={product}
          categories={categories}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="product-detail-header">
            <h2>{product.name}</h2>
            <button className="link-btn name-link" onClick={() => setEditing(true)}>Edit Product</button>
          </div>
          <p className="product-meta">
            Category: {product.category_name || '—'} · Barcode: {product.barcode || '—'} · SKU: {product.sku || '—'}
            {' · '}{stockLabel}: {product.quantity} · Base Price: {formatMoney(product.base_price, currencyCode)}
          </p>
        </>
      )}

      {isElevated(user.role) && (
        <div className="variety-editor">
          <h3>Stock by Branch</h3>
          <table className="variety-table">
            <thead><tr><th>Branch</th><th>Units in stock</th></tr></thead>
            <tbody>
              {listProductStockByBranch(productId).map((r) => (
                <tr key={r.branch_id}>
                  <td>{r.branch_name}{r.is_active ? '' : ' (inactive)'}</td>
                  <td>{r.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VarietyEditor productId={productId} />
    </div>
  );
}
