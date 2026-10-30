import { getCompanySettings } from '../db/companySettings';
import { formatMoney } from '../db/currency';

export default function ProductList({ products, onDelete, onOpen }) {
  const currencyCode = getCompanySettings().currency_code;
  if (products.length === 0) {
    return <p className="empty-state">No products yet. Add one above.</p>;
  }

  return (
    <table className="product-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Category</th>
          <th>Barcode</th>
          <th>SKU</th>
          <th>Qty</th>
          <th>Price</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {products.map((p) => (
          <tr key={p.id}>
            <td>
              <button className="link-btn name-link" onClick={() => onOpen(p.id)}>{p.name}</button>
              {!p.varieties_configured && (
                <span className="setup-badge" title="No sellable varieties set up yet">needs setup</span>
              )}
            </td>
            <td>{p.category_name || '—'}</td>
            <td>{p.barcode || '—'}</td>
            <td>{p.sku || '—'}</td>
            <td>{p.quantity}</td>
            <td>{formatMoney(p.base_price, currencyCode)}</td>
            <td><button className="link-btn danger" onClick={() => onDelete(p.id)}>Remove</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
