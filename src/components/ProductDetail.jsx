import { useState } from 'react';
import { getProduct, listStockAdjustments } from '../db/products';
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
  const stockHistory = listStockAdjustments(productId);

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
            {' · '}Cost price: {product.cost_price == null ? '—' : formatMoney(product.cost_price, currencyCode)}
          </p>
        </>
      )}

      {isElevated(user.role) && (
        <div className="variety-editor">
          <h3>Stock by Branch</h3>
          <table className="variety-table">
            <thead><tr><th>Branch</th><th>Units in stock</th><th>Avg cost / piece</th><th>Value at cost</th></tr></thead>
            <tbody>
              {listProductStockByBranch(productId).map((r) => (
                <tr key={r.branch_id}>
                  <td>{r.branch_name}{r.is_active ? '' : ' (inactive)'}</td>
                  <td>{r.quantity}</td>
                  <td>{(r.avg_cost ?? product.cost_price) == null ? '—' : formatMoney(r.avg_cost ?? product.cost_price, currencyCode)}</td>
                  <td>{(r.avg_cost ?? product.cost_price) == null ? '—' : formatMoney(r.quantity * (r.avg_cost ?? product.cost_price), currencyCode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="variety-editor">
        <h3>Stock Additions</h3>
        {stockHistory.length === 0 ? (
          <p className="empty-state">No stock additions recorded yet.</p>
        ) : (
          <table className="variety-table">
            <thead><tr><th>Date</th><th>Branch</th><th>Units added</th><th>By</th><th>Note</th></tr></thead>
            <tbody>
              {stockHistory.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleString()}</td>
                  <td>{h.branch_name || '—'}</td>
                  <td>{h.quantity_added}</td>
                  <td>{h.created_by_name || '—'}</td>
                  <td>{h.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <VarietyEditor productId={productId} />
    </div>
  );
}
