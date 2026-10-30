import { useState } from 'react';
import { getSale, getSaleItems } from '../../db/sales';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';

const THERMAL_PAGE_STYLE_ID = 'thermal-page-style';

function paymentMethodLabel(method) {
  switch (method) {
    case 'bank_transfer': return 'Bank Transfer';
    case 'card': return 'Card Payment';
    case 'loyalty': return 'Loyalty Credits';
    default: return 'Cash';
  }
}

export default function Invoice({ saleId, onBack }) {
  const [format, setFormat] = useState('standard'); // 'standard' | 'thermal'
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

  function handlePrint() {
    // Thermal receipt printers use a narrow continuous roll (commonly 80mm or
    // 58mm), not a standard page size. Browsers don't let @media print rules
    // be scoped to one element, so for a thermal print we temporarily inject
    // a global @page rule sized for the roll, then remove it right after -
    // the standard invoice print is completely unaffected.
    if (format === 'thermal') {
      const style = document.createElement('style');
      style.id = THERMAL_PAGE_STYLE_ID;
      style.textContent = `@page { size: 80mm auto; margin: 3mm; }`;
      document.head.appendChild(style);

      const cleanup = () => {
        const el = document.getElementById(THERMAL_PAGE_STYLE_ID);
        if (el) el.remove();
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
    }
    window.print();
  }

  return (
    <div className="invoice-wrapper">
      <div className="invoice-toolbar no-print">
        <button className="link-btn" onClick={onBack}>← Back</button>
        <div className="format-toggle">
          <button
            className={format === 'standard' ? 'small-btn' : 'small-btn secondary'}
            onClick={() => setFormat('standard')}
          >
            Standard
          </button>
          <button
            className={format === 'thermal' ? 'small-btn' : 'small-btn secondary'}
            onClick={() => setFormat('thermal')}
          >
            Thermal Receipt
          </button>
        </div>
        <button className="small-btn" onClick={handlePrint}>Print / Save as PDF</button>
      </div>

      <div className={`invoice ${format === 'thermal' ? 'thermal' : ''}`}>
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
          <div><strong>Invoice #:</strong> {sale.id.slice(-8).toUpperCase()}</div>
          <div><strong>Date:</strong> {date.toLocaleDateString()} {date.toLocaleTimeString()}</div>
          {sale.branch_name && <div><strong>Branch:</strong> {sale.branch_name}</div>}
          <div><strong>Customer:</strong> {sale.customer_name || 'N/A'}</div>
          <div><strong>Phone:</strong> {sale.customer_phone || 'N/A'}</div>
        </div>

        {/* Itemized list with S/N column, bordered rows and columns */}
        <table className="invoice-table">
          <thead>
            <tr>
              <th className="col-sn">S/N</th>
              <th>Item</th>
              {format === 'standard' && <th>Variety</th>}
              <th className="col-num">Qty</th>
              <th className="col-num">Price</th>
              <th className="col-num">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id}>
                <td className="col-sn">{idx + 1}</td>
                <td>
                  {item.product_name}
                  {format === 'thermal' && <div className="thermal-variety-line">{item.variety_name}</div>}
                </td>
                {format === 'standard' && <td>{item.variety_name}</td>}
                <td className="col-num">{item.quantity}</td>
                <td className="col-num">{formatMoney(item.unit_price, company.currency_code)}</td>
                <td className="col-num">{formatMoney(item.line_total, company.currency_code)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals-block">
          <div className="invoice-total-row">
            <span>Grand Total</span>
            <strong>{formatMoney(sale.total, company.currency_code)}</strong>
          </div>
          <div className="invoice-subtotal-row">
            <span>Payment Method</span>
            <span>{paymentMethodLabel(sale.payment_method)}</span>
          </div>
          <div className="invoice-subtotal-row">
            <span>Amount Paid</span>
            <span>{formatMoney(sale.amount_paid, company.currency_code)}</span>
          </div>
          {sale.previous_balance_paid > 0.004 && (
            <div className="invoice-subtotal-row">
              <span>Also Paid Toward Previous Balance</span>
              <span>{formatMoney(sale.previous_balance_paid, company.currency_code)}</span>
            </div>
          )}
          {sale.total - sale.amount_paid > 0.004 && (
            <div className="invoice-subtotal-row balance-owing">
              <span>Balance Due (this sale)</span>
              <span>{formatMoney(sale.total - sale.amount_paid, company.currency_code)}</span>
            </div>
          )}
          {sale.loyalty_points_earned > 0 && (
            <div className="invoice-subtotal-row">
              <span>Loyalty Points Earned</span>
              <span>{sale.loyalty_points_earned}</span>
            </div>
          )}
        </div>

        {format === 'thermal' && <p className="thermal-footer">Thank you for your purchase!</p>}
      </div>
    </div>
  );
}
