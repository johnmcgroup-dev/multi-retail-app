import { listAllTenants } from '../../db/users';
import { setViewingTenantId } from '../../db/session';

export default function TenantPicker({ onPicked }) {
  const tenants = listAllTenants();

  function pick(tenantId) {
    setViewingTenantId(tenantId);
    onPicked();
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Choose a Tenant</h1>
        <p className="subtitle">
          You're signed in as Super Admin. Pick a business to view - you can switch to another
          at any time from the menu bar.
        </p>
        {tenants.length === 0 ? (
          <p className="empty-state">No businesses have signed up yet.</p>
        ) : (
          <div className="tenant-picker-list">
            {tenants.map((t) => (
              <button key={t.id} className="tenant-picker-item" onClick={() => pick(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
