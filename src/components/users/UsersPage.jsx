import { useState } from 'react';
import {
  listUsersForTenant, listInviteCodes, createInviteCode, revokeInviteCode,
  updateUserRole, setUserStatus, updateUserBranch,
} from '../../db/users';
import { listBranches } from '../../db/branches';
import { getCurrentUser, getViewingTenantId } from '../../db/session';

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', manager: 'Manager', cashier: 'Cashier', super_admin: 'Super Admin' };
const ASSIGNABLE_ROLES = ['admin', 'manager', 'cashier'];

export default function UsersPage() {
  const tenantId = getViewingTenantId();
  const currentUser = getCurrentUser();
  const branches = listBranches();
  const [users, setUsers] = useState(listUsersForTenant(tenantId));
  const [invites, setInvites] = useState(listInviteCodes(tenantId));
  const [inviteRole, setInviteRole] = useState('cashier');
  const [inviteBranchId, setInviteBranchId] = useState(branches[0]?.id || '');
  const [justCreatedCode, setJustCreatedCode] = useState('');
  const [error, setError] = useState('');

  function refresh() {
    setUsers(listUsersForTenant(tenantId));
    setInvites(listInviteCodes(tenantId));
  }

  async function attempt(fn) {
    setError('');
    try { await fn(); refresh(); } catch (err) { setError(err.message); }
  }

  async function handleCreateInvite(e) {
    e.preventDefault();
    setError('');
    try {
      const code = await createInviteCode({
        tenantId, role: inviteRole,
        branchId: inviteRole === 'admin' ? null : inviteBranchId,
        createdByUserId: currentUser.id,
      });
      setJustCreatedCode(code);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleStatus(user) {
    const next = user.status === 'suspended' ? 'active' : 'suspended';
    const confirmed = window.confirm(
      next === 'suspended' ? `Suspend ${user.name}? They won't be able to log in.` : `Reactivate ${user.name}?`
    );
    if (!confirmed) return;
    await attempt(() => setUserStatus(user.id, next));
  }

  return (
    <div>
      <header>
        <h1>Users</h1>
        <p className="subtitle">Invite staff, assign roles and branches, and manage access for this business.</p>
      </header>

      <form onSubmit={handleCreateInvite} className="product-form">
        <h3>Invite a Staff Member</h3>
        <p className="modal-hint">
          Generates a one-time code. Whoever uses it on the Join screen is automatically added to this
          business with the role (and branch) you choose here. Managers and cashiers only ever see their own branch.
        </p>
        <div className="form-row">
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          {inviteRole !== 'admin' && (
            <select value={inviteBranchId} onChange={(e) => setInviteBranchId(e.target.value)} required>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <button type="submit">Generate Invite Code</button>
        </div>
        {justCreatedCode && (
          <p className="saved-msg">
            Code created: <strong>{justCreatedCode}</strong> — share this with the new staff member.
          </p>
        )}
      </form>
      {error && <p className="modal-error">{error}</p>}

      <h3>Pending / Past Invite Codes</h3>
      {invites.length === 0 ? (
        <p className="empty-state">No invite codes generated yet.</p>
      ) : (
        <table className="product-table">
          <thead><tr><th>Code</th><th>Role</th><th>Branch</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {invites.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.code}</td>
                <td>{ROLE_LABELS[inv.role]}</td>
                <td>{inv.role === 'admin' ? 'All branches' : inv.branch_name || 'Default branch'}</td>
                <td>{inv.revoked ? 'Revoked' : inv.used_by ? 'Used' : 'Pending'}</td>
                <td>
                  {!inv.revoked && !inv.used_by && (
                    <button className="link-btn danger" onClick={() => attempt(() => revokeInviteCode(inv.id))}>Revoke</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Team</h3>
      <table className="product-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                {u.role === 'owner' ? 'Owner' : (
                  <select value={u.role} onChange={(e) => attempt(() => updateUserRole(u.id, e.target.value))}>
                    {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                )}
              </td>
              <td>
                {['manager', 'cashier'].includes(u.role) ? (
                  <select value={u.branch_id || ''} onChange={(e) => attempt(() => updateUserBranch(u.id, e.target.value))}>
                    {!u.branch_id && <option value="">Default branch</option>}
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                ) : 'All branches'}
              </td>
              <td className={u.status === 'suspended' ? 'balance-owing' : 'balance-clear'}>{u.status}</td>
              <td>
                {u.role !== 'owner' && (
                  <button className="link-btn" onClick={() => handleToggleStatus(u)}>
                    {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
