import { useEffect, useState } from 'react';
import { getCompanySettings, saveCompanySettings } from '../db/companySettings';
import { CURRENCIES } from '../db/currency';

export default function CompanySettingsPage() {
  const [form, setForm] = useState({
    company_name: '', address: '', phone: '', email: '',
    points_per_amount: 0.1, points_redeem_value: 1.0, currency_code: 'USD',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(getCompanySettings());
  }, []);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    await saveCompanySettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <header>
        <h1>Company Settings</h1>
        <p className="subtitle">This information appears at the top of every invoice.</p>
      </header>

      <form onSubmit={handleSave} className="product-form settings-form">
        <label className="modal-label">Company Name</label>
        <input className="modal-input" value={form.company_name} onChange={(e) => handleChange('company_name', e.target.value)} />

        <label className="modal-label">Address</label>
        <input className="modal-input" value={form.address} onChange={(e) => handleChange('address', e.target.value)} />

        <label className="modal-label">Phone</label>
        <input className="modal-input" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} />

        <label className="modal-label">Email</label>
        <input className="modal-input" value={form.email} onChange={(e) => handleChange('email', e.target.value)} />

        <label className="modal-label">Currency</label>
        <select className="modal-select" value={form.currency_code} onChange={(e) => handleChange('currency_code', e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
          ))}
        </select>
        <p className="modal-hint">
          Every price, total, and invoice across the app displays in this currency.
          This changes the display format only — it does not convert existing amounts.
        </p>

        <h3 style={{ marginTop: '1.2rem' }}>Loyalty Program</h3>
        <label className="modal-label">Points earned per 1 unit of currency paid</label>
        <input
          className="modal-input"
          type="number"
          step="0.01"
          value={form.points_per_amount}
          onChange={(e) => handleChange('points_per_amount', e.target.value)}
        />
        <p className="modal-hint">
          E.g. 0.1 means a customer earns 1 point for every 10 paid. Points are earned on what's
          actually paid (not on an unpaid/credit portion), and only when payment isn't itself made
          with loyalty points.
        </p>

        <label className="modal-label">Currency value of 1 point when redeemed</label>
        <input
          className="modal-input"
          type="number"
          step="0.01"
          value={form.points_redeem_value}
          onChange={(e) => handleChange('points_redeem_value', e.target.value)}
        />
        <p className="modal-hint">E.g. 1 means 1 point covers 1 unit of currency when a customer pays with Loyalty Credits.</p>

        <button type="submit" className="small-btn" style={{ marginTop: '1rem' }}>Save</button>
        {saved && <span className="saved-msg" style={{ marginLeft: '0.6rem' }}>Saved.</span>}
      </form>
    </div>
  );
}
