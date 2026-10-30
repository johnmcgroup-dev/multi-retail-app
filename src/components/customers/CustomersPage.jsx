import { useEffect, useState } from 'react';
import { listCustomers, addCustomer, ensureWalkInCustomer } from '../../db/customers';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';
import CustomerLedger from './CustomerLedger';

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const currencyCode = getCompanySettings().currency_code;
  const [openCustomerId, setOpenCustomerId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    (async () => {
      await ensureWalkInCustomer();
      refresh();
    })();
  }, []);

  function refresh() {
    setCustomers(listCustomers());
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await addCustomer({ name: name.trim(), phone, address });
    setName(''); setPhone(''); setAddress('');
    refresh();
  }

  if (openCustomerId) {
    return (
      <CustomerLedger
        customerId={openCustomerId}
        onBack={() => { setOpenCustomerId(null); refresh(); }}
        onChanged={refresh}
      />
    );
  }

  return (
    <div>
      <header>
        <h1>Customers</h1>
        <p className="subtitle">
          Walk-in Customer is the default used at checkout when no specific customer is selected.
          Named customers can carry an outstanding balance if a sale isn't paid in full.
        </p>
      </header>

      <form onSubmit={handleAdd} className="product-form">
        <h3>Add Customer</h3>
        <div className="form-row">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <button type="submit">Add Customer</button>
        </div>
      </form>

      <table className="product-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Outstanding Balance</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>
                {c.name}
                {c.is_walkin && <span className="fixed-badge">default</span>}
              </td>
              <td>{c.phone || '—'}</td>
              <td className={c.balance > 0 ? 'balance-owing' : ''}>{formatMoney(c.balance, currencyCode)}</td>
              <td>
                <button className="link-btn name-link" onClick={() => setOpenCustomerId(c.id)}>
                  View Ledger
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
