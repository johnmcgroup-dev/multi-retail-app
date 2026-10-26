import { getProduct } from '../db/products';
import VarietyEditor from './VarietyEditor';

export default function ProductDetail({ productId, onBack }) {
  const product = getProduct(productId);
  if (!product) {
    return (
      <div>
        <button className="link-btn" onClick={onBack}>← Back to products</button>
        <p>Product not found.</p>
      </div>
    );
  }

  return (
    <div className="product-detail">
      <button className="link-btn" onClick={onBack}>← Back to products</button>
      <h2>{product.name}</h2>
      <p className="product-meta">
        Barcode: {product.barcode || '—'} · SKU: {product.sku || '—'}
      </p>
      <VarietyEditor productId={productId} />
    </div>
  );
}
