import { useState } from 'react';
import { listPurchaseOrders } from '../../db/purchases';
import { getCurrentBranchId } from '../../db/session';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';
import PurchaseOrderForm from './PurchaseOrderForm';
import PurchaseOrderDetail, { STATUS_LABELS } from './PurchaseOrderDetail';

export default function PurchaseOrdersPage() {
  const [view, setView] = useState({ mode: 'list', id: null }); // list | new | detail
  const [status, setStatus] = useState('');
  const currencyCode = getCompanySettings().currency_code;
  const showBranch = !getCurrentBranchId(); // viewing all branches

  if (view.mode === 'new') {
    return <PurchaseOrderForm onCreated={(id) => setView({ mode: 'detail', id })} onCancel={() => setView({ mode: 'list', id: null })} />;
  }
  if (view.mode === 'detail') {
    return <PurchaseOrderDetail poId={view.id} onBack={() => setView({ mode: 'list', id: null })} />;
  }

  const orders = listPurchaseOrders({ status: status || null });

  return (
    <div>
      <header>
        <div className="header-row">
          <div>
            <h1>Purchase Orders</h1>
            <p className="subtitle">
              Orders placed with suppliers, one branch each. Stock only goes up when goods are marked as received.
              (The quick Add Stock button in POS still works for on-the-spot top-ups.)
            </p>
          </div>
          <button className="small-btn" onClick={() => setView({ mode: 'new', id: null })}>+ New Purchase Order</button>
        </div>
      </header>

      <div className="expense-filters">
        <label className="modal-label">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      {orders.length === 0 ? (
        <p className="empty-state">No purchase orders found.</p>
      ) : (
        <table className="product-table">
          <thead>
            <tr><th>PO #</th><th>Date</th><th>Supplier</th>{showBranch && <th>Branch</th>}<th>Status</th><th>Total</th><th>Received value</th><th></th></tr>
          </thead>
          <tbody>
            {orders.map((po) => (
              <tr key={po.id}>
                <td>{po.po_number}</td>
                <td>{po.order_date}</td>
                <td>{po.supplier_name}</td>
                {showBranch && <td>{po.branch_name || '—'}</td>}
                <td><span className={`status-badge status-${po.status}`}>{STATUS_LABELS[po.status]}</span></td>
                <td>{formatMoney(po.total, currencyCode)}</td>
                <td>{formatMoney(po.received_value, currencyCode)}</td>
                <td><button className="link-btn name-link" onClick={() => setView({ mode: 'detail', id: po.id })}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
