import { useState } from 'react';
import { addCustomer } from '../../db/customers';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';

export default function CustomerSelect({ customers, selectedId, onSelect, onCustomerAdded }) {
  const currencyCode = getCompanySettings().currency_code;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const id = await addCustomer({ name: name.trim(), phone, address });
    setName(''); setPhone(''); setAddress('');
    setAdding(false);
    await onCustomerAdded(id);
  }

  return (
    <div className="customer-select">
      <label className="modal-label">Customer</label>
      <div className="customer-select-row">
        <select className="modal-select" value={selectedId || ''} onChange={(e) => onSelect(e.target.value)}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.is_walkin ? c.name : `${c.name}${c.balance > 0 ? ` (owes ${formatMoney(c.balance, currencyCode)})` : ''}`}
            </option>
          ))}
        </select>
        <button type="button" className="small-btn secondary" onClick={() => setAdding((v) => !v)}>
          + New
        </button>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="new-customer-form">
          <input className="modal-input" placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="modal-input" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="modal-input" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <button type="submit" className="small-btn">Save Customer</button>
        </form>
      )}
    </div>
  );
}
