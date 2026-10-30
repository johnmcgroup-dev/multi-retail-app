import { listBranches } from '../../db/branches';
import { getCurrentBranchId, setViewingBranchId, isElevated } from '../../db/session';

// Owner / Admin / Super Admin can look at one branch or all branches
// combined. Managers and cashiers are locked to their own branch and just
// see its name.
export default function BranchSwitcher({ user, onChange }) {
  const current = getCurrentBranchId();

  if (!isElevated(user.role)) {
    const mine = listBranches({ includeInactive: true }).find((b) => b.id === current);
    return <span className="branch-badge">Branch: {mine?.name || '—'}</span>;
  }

  const branches = listBranches();
  return (
    <label className="branch-switcher">
      <span>Viewing:</span>
      <select
        value={current || 'ALL'}
        onChange={(e) => { setViewingBranchId(e.target.value === 'ALL' ? null : e.target.value); onChange(); }}
      >
        <option value="ALL">All branches (combined, read-only)</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  );
}
