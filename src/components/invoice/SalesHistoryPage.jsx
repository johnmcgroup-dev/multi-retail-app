import { useEffect, useState } from 'react';
import { listSales } from '../../db/sales';
import Invoice from './Invoice';

export default function SalesHistoryPage() {
  const [sales, setSales] = useState([]);
  const [openSaleId, setOpenSaleId] = useState(null);

  useEffect(() => {
    setSales(listSales());
  }, []);

  if (openSaleId) {
    return <Invoice saleId={openSaleId} onBack={() => setOpenSaleId(null)} />;
  }

  return (
    <div>
      <header>
        <h1>Sales History</h1>
        <p className="subtitle">Click a sale to view and print its invoice.</p>
      </header>

      {sales.length === 0 ? (
        <p className="empty-state">No completed sales yet.</p>
      ) : (
        <table className="product-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id}>
                <td>{s.id.slice(-8).toUpperCase()}</td>
                <td>{new Date(s.created_at).toLocaleString()}</td>
                <td>{s.customer_name || 'Walk-in'}</td>
                <td>{s.total.toFixed(2)}</td>
                <td>
                  <button className="link-btn name-link" onClick={() => setOpenSaleId(s.id)}>
                    View Invoice
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
