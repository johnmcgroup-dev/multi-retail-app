import { useState } from 'react';
import { listSuppliers, addSupplier } from '../../db/purchases';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';
import SupplierLedger from './SupplierLedger';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState(listSuppliers());
  const [openId, setOpenId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const currencyCode = getCompanySettings().currency_code;

  function refresh() {
    setSuppliers(listSuppliers());
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await addSupplier({ name, phone, address });
      setName(''); setPhone(''); setAddress('');
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  if (openId) {
    return <SupplierLedger supplierId={openId} onBack={() => { setOpenId(null); refresh(); }} />;
  }

  const totalOwed = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance), 0);

  return (
    <div>
      <header>
        <h1>Suppliers</h1>
        <p className="subtitle">
          Who you buy from, and what you currently owe each of them. Suppliers are shared by all branches.
        </p>
      </header>

      <form onSubmit={handleAdd} className="product-form">
        <h3>Add Supplier</h3>
        <div className="form-row">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <button type="submit">Add Supplier</button>
        </div>
        {error && <p className="modal-error">{error}</p>}
      </form>

      <p className="expense-total-line">
        Total owed to suppliers: <strong>{formatMoney(totalOwed, currencyCode)}</strong>
      </p>

      {suppliers.length === 0 ? (
        <p className="empty-state">No suppliers yet.</p>
      ) : (
        <table className="product-table">
          <thead><tr><th>Name</th><th>Phone</th><th>We owe</th><th></th></tr></thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.phone || '—'}</td>
                <td className={s.balance > 0 ? 'balance-owing' : ''}>{formatMoney(s.balance, currencyCode)}</td>
                <td><button className="link-btn name-link" onClick={() => setOpenId(s.id)}>View Account</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
