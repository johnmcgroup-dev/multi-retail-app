import { query, run } from './database';
import { newId } from './id';
import { getCurrentTenantId, getCurrentUser, isElevated } from './session';

function assertCanManage() {
  const user = getCurrentUser();
  if (!user || !isElevated(user.role)) {
    throw new Error('Only an Owner or Admin can manage branches.');
  }
}

export function listBranches({ includeInactive = false } = {}) {
  return query(
    `SELECT * FROM branches WHERE tenant_id = ? ${includeInactive ? '' : 'AND is_active = 1'}
     ORDER BY created_at ASC, rowid ASC`,
    [getCurrentTenantId()]
  );
}

// Branches plus the numbers the Branches page shows next to each one.
export function listBranchesWithCounts() {
  return query(
    `SELECT b.*,
       (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.role IN ('manager', 'cashier')) AS staff_count,
       (SELECT COUNT(*) FROM branch_stock bs WHERE bs.branch_id = b.id AND bs.quantity > 0) AS stocked_products,
       (SELECT COALESCE(SUM(bs.quantity), 0) FROM branch_stock bs WHERE bs.branch_id = b.id) AS total_units
     FROM branches b WHERE b.tenant_id = ? ORDER BY b.created_at ASC, b.rowid ASC`,
    [getCurrentTenantId()]
  );
}

function getOwnBranch(id) {
  const rows = query(`SELECT * FROM branches WHERE id = ? AND tenant_id = ?`, [id, getCurrentTenantId()]);
  if (!rows[0]) throw new Error('Branch not found in this business.');
  return rows[0];
}

function nameTaken(name, exceptId = null) {
  const rows = query(
    `SELECT id FROM branches WHERE tenant_id = ? AND LOWER(name) = LOWER(?) AND id != ?`,
    [getCurrentTenantId(), name, exceptId || '']
  );
  return rows.length > 0;
}

export async function addBranch(name) {
  assertCanManage();
  const clean = (name || '').trim();
  if (!clean) throw new Error('Branch name is required.');
  if (nameTaken(clean)) throw new Error(`A branch named "${clean}" already exists.`);
  const id = newId('branch');
  await run(`INSERT INTO branches (id, tenant_id, name) VALUES (?, ?, ?)`, [id, getCurrentTenantId(), clean]);
  return id;
}

export async function renameBranch(id, name) {
  assertCanManage();
  getOwnBranch(id);
  const clean = (name || '').trim();
  if (!clean) throw new Error('Branch name is required.');
  if (nameTaken(clean, id)) throw new Error(`A branch named "${clean}" already exists.`);
  await run(`UPDATE branches SET name = ? WHERE id = ? AND tenant_id = ?`, [clean, id, getCurrentTenantId()]);
}

export async function setBranchActive(id, active) {
  assertCanManage();
  const branch = getOwnBranch(id);
  if (!active && branch.is_active) {
    const activeCount = query(
      `SELECT COUNT(*) AS c FROM branches WHERE tenant_id = ? AND is_active = 1`,
      [getCurrentTenantId()]
    )[0].c;
    if (activeCount <= 1) throw new Error('You cannot deactivate the last active branch.');

    const staff = query(
      `SELECT COUNT(*) AS c FROM users WHERE branch_id = ? AND role IN ('manager', 'cashier') AND status = 'active'`,
      [id]
    )[0].c;
    if (staff > 0) {
      throw new Error(`${staff} active staff member(s) are assigned to this branch. Reassign them first.`);
    }
  }
  await run(`UPDATE branches SET is_active = ? WHERE id = ? AND tenant_id = ?`, [active ? 1 : 0, id, getCurrentTenantId()]);
}

// Every tenant must always have at least one branch. Called when a tenant is
// created; safe to call again.
export async function ensureDefaultBranch(tenantId) {
  const rows = query(
    `SELECT id FROM branches WHERE tenant_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 1`,
    [tenantId]
  );
  if (rows[0]) return rows[0].id;
  const id = newId('branch');
  await run(`INSERT INTO branches (id, tenant_id, name) VALUES (?, ?, 'Main Branch')`, [id, tenantId]);
  return id;
}
