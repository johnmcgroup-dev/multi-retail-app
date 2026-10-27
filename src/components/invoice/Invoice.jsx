import { getSale, getSaleItems } from '../../db/sales';
import { getCompanySettings } from '../../db/companySettings';

export default function Invoice({ saleId, onBack }) {
  const sale = getSale(saleId);
  const items = getSaleItems(saleId);
  const company = getCompanySettings();

  if (!sale) {
    return (
      <div>
        <button className="link-btn" onClick={onBack}>← Back</button>
        <p>Sale not found.</p>
      </div>
    );
  }

  const date = new Date(sale.created_at);

  return (
    <div className="invoice-wrapper">
      <div className="invoice-toolbar no-print">
        <button className="link-btn" onClick={onBack}>← Back</button>
        <button className="small-btn" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      <div className="invoice">
        {/* Company info section */}
        <div className="invoice-company">
          <h2>{company.company_name || 'Your Company Name'}</h2>
          {company.address && <p>{company.address}</p>}
          <p>
            {company.phone && <span>Tel: {company.phone} </span>}
            {company.email && <span>· {company.email}</span>}
          </p>
        </div>

        {/* Customer details section - directly after company info, before items */}
        <div className="invoice-customer">
          <div>
            <strong>Invoice #:</strong> {sale.id.slice(-8).toUpperCase()}
          </div>
          <div>
            <strong>Date:</strong> {date.toLocaleDateString()} {date.toLocaleTimeString()}
          </div>
          <div>
            <strong>Customer Name:</strong> {sale.customer_name || 'N/A'}
          </div>
          <div>
            <strong>Customer Phone:</strong> {sale.customer_phone || 'N/A'}
          </div>
        </div>

        {/* Itemized list with S/N column, bordered rows and columns */}
        <table className="invoice-table">
          <thead>
            <tr>
              <th className="col-sn">S/N</th>
              <th>Item</th>
              <th>Variety</th>
              <th className="col-num">Qty</th>
              <th className="col-num">Unit Price</th>
              <th className="col-num">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id}>
                <td className="col-sn">{idx + 1}</td>
                <td>{item.product_name}</td>
                <td>{item.variety_name}</td>
                <td className="col-num">{item.quantity}</td>
                <td className="col-num">{item.unit_price.toFixed(2)}</td>
                <td className="col-num">{item.line_total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-total-row">
          <span>Grand Total</span>
          <strong>{sale.total.toFixed(2)}</strong>
        </div>
      </div>
    </div>
  );
}
