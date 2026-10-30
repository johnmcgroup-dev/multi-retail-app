import { useState } from 'react';
import { createSuperAdmin } from '../../db/users';

export default function SuperAdminBootstrap({ onDone }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createSuperAdmin({ name, email });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Welcome</h1>
        <p className="subtitle">
          This is a one-time setup step. Create the Super Admin account - this is the
          developer/operator identity with access across every tenant and branch.
          Every other account created afterward is a regular business (tenant) or
          staff member, scoped to their own tenant only.
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="modal-label">Your Name</label>
          <input className="modal-input" value={name} onChange={(e) => setName(e.target.value)} required />
          <label className="modal-label">Email</label>
          <input type="email" className="modal-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {error && <p className="modal-error">{error}</p>}
          <button type="submit" className="small-btn" disabled={saving}>
            {saving ? 'Creating…' : 'Create Super Admin Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
