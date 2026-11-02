import { useState } from 'react';
import { verifyEmail, resendVerificationCode } from '../../db/users';

export default function VerifyEmailScreen({ email, devCode: initialDevCode, onVerified, onBack }) {
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(initialDevCode);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleVerify(e) {
    e.preventDefault();
    setError(''); setInfo('');
    setBusy(true);
    try {
      await verifyEmail({ email, code });
      onVerified();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError(''); setInfo('');
    setDevCode(await resendVerificationCode(email));
    setCode('');
    setInfo('A new code has been sent. Any earlier code no longer works.');
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Verify your email</h1>
        <p className="subtitle">
          We sent a 6-digit code to <strong>{email}</strong>. Enter it below to finish setting up your account.
          The code works for 15 minutes.
        </p>

        {devCode && (
          <p className="modal-hint legacy-data-notice dev-code-box">
            <strong>Development mode.</strong> This app cannot send real emails yet, so the code is shown here:{' '}
            <strong className="dev-code">{devCode}</strong>. Once email sending is connected, this box disappears and the
            code arrives in your inbox only.
          </p>
        )}

        <form onSubmit={handleVerify} className="auth-form">
          <label className="modal-label">Verification code</label>
          <input
            className="modal-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus
          />
          {error && <p className="modal-error">{error}</p>}
          {info && <p className="saved-msg">{info}</p>}
          <button type="submit" className="small-btn" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Verify and continue'}
          </button>
        </form>

        <p className="modal-hint">
          <button type="button" className="link-btn name-link" onClick={handleResend}>Send me a new code</button>
          {' · '}
          <button type="button" className="link-btn" onClick={onBack}>Use a different email</button>
        </p>
      </div>
    </div>
  );
}
