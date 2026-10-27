import { useEffect, useState } from 'react';
import { getCompanySettings, saveCompanySettings } from '../db/companySettings';

export default function CompanySettingsPage() {
  const [form, setForm] = useState({ company_name: '', address: '', phone: '', email: '' });
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

        <button type="submit" className="small-btn" style={{ marginTop: '1rem' }}>Save</button>
        {saved && <span className="saved-msg" style={{ marginLeft: '0.6rem' }}>Saved.</span>}
      </form>
    </div>
  );
}
