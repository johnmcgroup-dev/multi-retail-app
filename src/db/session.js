// session.js
//
// Until the cloud/auth server exists, "logging in" here means picking an
// existing local user record - there are no real passwords yet. This file
// is deliberately the ONLY place that touches localStorage, and the ONLY
// place every other data file should ask "which tenant / which branch am I
// scoped to right now?". When the real backend arrives, this file is what
// gets replaced with real authentication.

import { query } from './database';

const CURRENT_USER_KEY = 'stockapp_current_user_id';
const VIEWING_TENANT_KEY = 'stockapp_viewing_tenant_id'; // super_admin only
const VIEWING_BRANCH_KEY = 'stockapp_viewing_branch_id'; // owner/admin/super_admin only
const ALL_BRANCHES = 'ALL';

export function getCurrentUserId() {
  return localStorage.getItem(CURRENT_USER_KEY);
}

export function setCurrentUserId(userId) {
  if (userId) localStorage.setItem(CURRENT_USER_KEY, userId);
  else localStorage.removeItem(CURRENT_USER_KEY);
}

export function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(VIEWING_TENANT_KEY);
  localStorage.removeItem(VIEWING_BRANCH_KEY);
}

export function getCurrentUser() {
  const id = getCurrentUserId();
  if (!id) return null;
  const rows = query(`SELECT * FROM users WHERE id = ?`, [id]);
  const user = rows[0];
  if (!user || user.status === 'suspended') return null;
  return user;
}

export function isLoggedIn() {
  return !!getCurrentUser();
}

export function getViewingTenantId() {
  const user = getCurrentUser();
  if (!user) return null;
  if (user.role !== 'super_admin') return user.tenant_id;
  return localStorage.getItem(VIEWING_TENANT_KEY) || null;
}

// Changing tenant always resets the branch choice - a branch id from one
// tenant must never carry over into another.
export function setViewingTenantId(tenantId) {
  localStorage.setItem(VIEWING_TENANT_KEY, tenantId);
  localStorage.removeItem(VIEWING_BRANCH_KEY);
}

export function clearViewingTenant() {
  localStorage.removeItem(VIEWING_TENANT_KEY);
  localStorage.removeItem(VIEWING_BRANCH_KEY);
}

// Throws loudly rather than silently querying with a null tenant.
export function getCurrentTenantId() {
  const tenantId = getViewingTenantId();
  if (!tenantId) {
    throw new Error('No tenant selected. This should not happen once logged in with a tenant chosen.');
  }
  return tenantId;
}

// --- Branch scope ---

// The tenant's default branch: its oldest active one.
export function getDefaultBranchId(tenantId) {
  const rows = query(
    `SELECT id FROM branches WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at ASC, rowid ASC LIMIT 1`,
    [tenantId]
  );
  return rows[0]?.id || null;
}

function branchInTenant(branchId, tenantId, activeOnly) {
  const rows = query(
    `SELECT id FROM branches WHERE id = ? AND tenant_id = ? ${activeOnly ? 'AND is_active = 1' : ''}`,
    [branchId, tenantId]
  );
  return rows.length > 0;
}

// Which branch the app is acting on right now.
//  - manager / cashier: locked to their assigned branch (or the tenant's
//    default if none was assigned). They cannot choose another.
//  - owner / admin / super_admin: whichever branch they picked in the
//    switcher, or null meaning "all branches combined" (read-only views).
export function getCurrentBranchId() {
  const user = getCurrentUser();
  if (!user) return null;
  const tenantId = getViewingTenantId();
  if (!tenantId) return null;

  if (!isElevated(user.role)) {
    if (user.branch_id && branchInTenant(user.branch_id, tenantId, false)) return user.branch_id;
    return getDefaultBranchId(tenantId);
  }

  const stored = localStorage.getItem(VIEWING_BRANCH_KEY);
  if (stored === ALL_BRANCHES) return null;
  if (stored && branchInTenant(stored, tenantId, true)) return stored;
  return getDefaultBranchId(tenantId);
}

// null means "all branches". Only meaningful for elevated roles - everyone
// else is locked regardless of what is stored here.
export function setViewingBranchId(branchId) {
  localStorage.setItem(VIEWING_BRANCH_KEY, branchId || ALL_BRANCHES);
}

// For anything that WRITES branch data (a sale, a restock, a payment): there
// must be one specific branch, never "all".
export function requireBranchId() {
  const id = getCurrentBranchId();
  if (!id) throw new Error('Select a specific branch first - you are currently viewing all branches combined.');
  return id;
}

// SQL helper: restrict a query to the current branch when one is selected,
// or leave it unrestricted when viewing all branches.
export function branchFilter(column) {
  const b = getCurrentBranchId();
  return b ? { sql: ` AND ${column} = ?`, params: [b] } : { sql: '', params: [] };
}

// --- Role permission matrix ---
// super_admin: every page, every tenant, every branch.
// owner / admin: every page, within their own tenant (all branches).
// manager: POS, Products, Customers, Expenses, Transfers - own branch only.
// cashier: POS and Sales History - own branch only.
const PAGE_ACCESS = {
  products: ['super_admin', 'owner', 'admin', 'manager'],
  pos: ['super_admin', 'owner', 'admin', 'manager', 'cashier'],
  history: ['super_admin', 'owner', 'admin', 'manager', 'cashier'],
  customers: ['super_admin', 'owner', 'admin', 'manager'],
  expenses: ['super_admin', 'owner', 'admin', 'manager'],
  transfers: ['super_admin', 'owner', 'admin', 'manager'],
  branches: ['super_admin', 'owner', 'admin'],
  reports: ['super_admin', 'owner', 'admin'],
  users: ['super_admin', 'owner', 'admin'],
  settings: ['super_admin', 'owner', 'admin'],
};

export function canAccessPage(role, pageKey) {
  const allowed = PAGE_ACCESS[pageKey];
  return allowed ? allowed.includes(role) : false;
}

export function isElevated(role) {
  return role === 'super_admin' || role === 'owner' || role === 'admin';
}
