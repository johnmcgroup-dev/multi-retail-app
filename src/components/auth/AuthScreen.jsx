import { useState } from 'react';
import { loginByEmail, signUpAsNewTenantOwner, joinWithInviteCode, hasUnclaimedLegacyData } from '../../db/users';

const MODES = [
  { key: 'login', label: 'Log In' },
  { key: 'signup', label: 'Sign Up (New Business)' },
  { key: 'join', label: 'Join with Invite Code' },
];

export default function AuthScreen({ onDone }) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // shared fields
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  // sign up only
  const [tenantName, setTenantName] = useState('');
  // join only
  const [code, setCode] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (mode === 'login') {
        await loginByEmail(email);
      } else if (mode === 'signup') {
        await signUpAsNewTenantOwner({ tenantName, name, email });
      } else if (mode === 'join') {
        await joinWithInviteCode({ code, name, email });
      }
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
        <h1>Wholesale/Retail Inventory with POS</h1>

        <div className="auth-mode-tabs">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={mode === m.key ? 'nav-btn active' : 'nav-btn'}
              onClick={() => { setMode(m.key); setError(''); }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'login' && (
            <>
              <p className="modal-hint">
                No password system yet (local-only mode) - entering a known account email logs you
                straight in. Real authentication arrives with cloud sync.
              </p>
              <label className="modal-label">Email</label>
              <input type="email" className="modal-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </>
          )}

          {mode === 'signup' && (
            <>
              <p className="modal-hint">
                Signing up without an invite code creates a brand new business (tenant), with you as Owner.
              </p>
              {hasUnclaimedLegacyData() && (
                <p className="modal-hint legacy-data-notice">
                  Existing products, sales, customers, and expenses from earlier testing were found.
                  The first person to sign up will automatically become the Owner of that existing
                  data, instead of starting empty.
                </p>
              )}
              <label className="modal-label">Business Name</label>
              <input className="modal-input" value={tenantName} onChange={(e) => setTenantName(e.target.value)} required />
              <label className="modal-label">Your Name</label>
              <input className="modal-input" value={name} onChange={(e) => setName(e.target.value)} required />
              <label className="modal-label">Email</label>
              <input type="email" className="modal-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </>
          )}

          {mode === 'join' && (
            <>
              <p className="modal-hint">
                Using an invite code joins the business (tenant) and role that code was created for -
                you never choose or type a tenant yourself.
              </p>
              <label className="modal-label">Invite Code</label>
              <input className="modal-input" placeholder="XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} required />
              <label className="modal-label">Your Name</label>
              <input className="modal-input" value={name} onChange={(e) => setName(e.target.value)} required />
              <label className="modal-label">Email</label>
              <input type="email" className="modal-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </>
          )}

          {error && <p className="modal-error">{error}</p>}

          <button type="submit" className="small-btn" disabled={saving}>
            {saving ? 'Please wait…' : MODES.find((m) => m.key === mode).label}
          </button>
        </form>
      </div>
    </div>
  );
}
