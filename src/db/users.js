import { query, run, runBatch } from './database';
import { newId } from './id';
import { setCurrentUserId, setViewingTenantId, getCurrentUser } from './session';
import { ensureDefaultBranch } from './branches';
import { sendVerificationEmail } from './emailService';

// --- Email addresses ---

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// A basic format check: something@domain.tld. It stops typos and obvious junk
// ("jargon", "a@b", "x y@z.com"). It cannot tell whether the address is REAL
// or belongs to the person - that is what the verification code is for.
export function isValidEmail(email) {
  const e = String(email || '').trim();
  return e.length <= 254 && EMAIL_PATTERN.test(e);
}

function assertValidEmail(email) {
  if (!isValidEmail(email)) throw new Error('Enter a valid email address, like name@example.com.');
}

// --- Email verification ---
// A new account cannot log in until its email address has been confirmed with
// a one-time code. Codes last 15 minutes and allow 5 wrong attempts; asking
// for a new code cancels the old one.
const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;

function generateVerificationCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
}

async function issueVerificationCode(user) {
  const code = generateVerificationCode();
  await runBatch([
    { sql: `UPDATE email_verifications SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL`, params: [user.id] },
    {
      sql: `INSERT INTO email_verifications (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)`,
      params: [newId('ver'), user.id, code, new Date(Date.now() + CODE_TTL_MINUTES * 60000).toISOString()],
    },
  ]);
  const sent = await sendVerificationEmail({ email: user.email, code });
  return sent.devCode || null; // only ever set while no real email can be sent
}

function logIn(user) {
  setCurrentUserId(user.id);
  // super_admin picks which tenant to look at next; everyone else is locked to theirs
  if (user.role !== 'super_admin') setViewingTenantId(user.tenant_id);
}

// Confirms the code, marks the account verified and logs the person in.
// Deliberately refuses an already-verified account: otherwise this function
// would be a way to log in as anyone without any credential at all.
export async function verifyEmail({ email, code }) {
  const user = query(`SELECT * FROM users WHERE email = ?`, [normalizeEmail(email)])[0];
  if (!user) throw new Error('No account found with that email.');
  if (user.status === 'suspended') throw new Error('This account has been suspended.');
  if (user.email_verified) throw new Error('This email is already verified. Please log in.');

  const v = query(
    `SELECT * FROM email_verifications WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    [user.id]
  )[0];
  if (!v) throw new Error('No verification code is pending. Please request a new one.');
  if (new Date(v.expires_at).getTime() < Date.now()) throw new Error('This code has expired. Please request a new one.');
  if (v.attempts >= MAX_ATTEMPTS) throw new Error('Too many incorrect attempts. Please request a new code.');

  if (String(code || '').trim() !== v.code) {
    await run(`UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?`, [v.id]);
    const left = MAX_ATTEMPTS - (v.attempts + 1);
    throw new Error(left > 0 ? `Incorrect code. ${left} attempt(s) left.` : 'Too many incorrect attempts. Please request a new code.');
  }

  await runBatch([
    { sql: `UPDATE users SET email_verified = 1 WHERE id = ?`, params: [user.id] },
    { sql: `UPDATE email_verifications SET used_at = datetime('now') WHERE id = ?`, params: [v.id] },
  ]);
  logIn(user);
  return { ...user, email_verified: 1 };
}

// Sends a fresh code. Says nothing about whether the account exists or is
// already verified (returns null either way), so it can't be used to probe
// which emails are registered.
export async function resendVerificationCode(email) {
  const user = query(`SELECT * FROM users WHERE email = ?`, [normalizeEmail(email)])[0];
  if (!user || user.email_verified || user.status === 'suspended') return null;
  return issueVerificationCode(user);
}

// --- Super Admin bootstrap ---
// The very first time this app runs anywhere with no users at all, it asks
// for ONE Super Admin (the developer/operator) to be created. Regular sign-up
// never creates a super_admin - that would let anyone claim cross-tenant
// access, which defeats the whole point of the role.
export function superAdminExists() {
  const rows = query(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`);
  return rows.length > 0;
}

export async function createSuperAdmin({ name, email }) {
  if (superAdminExists()) throw new Error('A Super Admin account already exists.');
  assertValidEmail(email);
  const id = newId('user');
  // The very first account is created by whoever is setting the system up, with
  // nobody before them to verify against, so it starts verified.
  await run(
    `INSERT INTO users (id, tenant_id, name, email, role, status, email_verified) VALUES (?, NULL, ?, ?, 'super_admin', 'active', 1)`,
    [id, name, normalizeEmail(email)]
  );
  setCurrentUserId(id);
  return id;
}

function generateInviteCode() {
  // Short, human-typeable code - not a security secret by itself (it's
  // single-use and tied to one tenant), just easy to read over the phone
  // or paste into a message.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code.slice(0, 4) + '-' + code.slice(4);
}

const LEGACY_TENANT_ID = 'tenant_demo'; // used by every module before this one, with no login system

// Before this module, the app ran as a single hardcoded tenant with no
// login - so anyone who has already been using it has real products, sales,
// customers and expenses sitting under that one tenant id, with no user
// ever attached to it. The FIRST sign-up after this update should adopt
// that existing data rather than silently orphaning it under an id nothing
// points to anymore. Every sign-up after that creates a genuinely new,
// empty tenant as normal, since the legacy one will already have an owner.
function findUnclaimedLegacyTenant() {
  const rows = query(`SELECT * FROM tenants WHERE id = ?`, [LEGACY_TENANT_ID]);
  if (rows.length === 0) return null;
  const hasOwner = query(`SELECT id FROM users WHERE tenant_id = ? LIMIT 1`, [LEGACY_TENANT_ID]);
  return hasOwner.length === 0 ? rows[0] : null;
}

export function hasUnclaimedLegacyData() {
  return !!findUnclaimedLegacyTenant();
}

// --- Sign up: creates a brand NEW tenant with this person as its Owner
// (or adopts pre-existing legacy data the very first time, see above).
// This is what happens when someone signs up WITHOUT an invite code.
export async function signUpAsNewTenantOwner({ tenantName, name, email }) {
  assertValidEmail(email);
  const existing = query(`SELECT id FROM users WHERE email = ?`, [normalizeEmail(email)]);
  if (existing.length > 0) throw new Error('An account with this email already exists. Try logging in instead.');

  const legacyTenant = findUnclaimedLegacyTenant();
  let tenantId;
  if (legacyTenant) {
    tenantId = legacyTenant.id;
    await run(`UPDATE tenants SET name = ? WHERE id = ?`, [tenantName, tenantId]);
  } else {
    tenantId = newId('tenant');
    await run(`INSERT INTO tenants (id, name) VALUES (?, ?)`, [tenantId, tenantName]);
  }
  await ensureDefaultBranch(tenantId); // every tenant always has at least one branch

  const userId = newId('user');
  await run(
    `INSERT INTO users (id, tenant_id, name, email, role, status, email_verified) VALUES (?, ?, ?, ?, 'owner', 'active', 0)`,
    [userId, tenantId, name, normalizeEmail(email)]
  );

  // Not logged in yet: the email must be verified first.
  const devCode = await issueVerificationCode({ id: userId, email: normalizeEmail(email) });
  return { tenantId, userId, adoptedExistingData: !!legacyTenant, verificationRequired: true, devCode };
}

// --- Invite codes: generated by an Owner/Admin, used by a new staff sign-up ---

export function listInviteCodes(tenantId) {
  return query(
    `SELECT i.*, b.name AS branch_name FROM invite_codes i LEFT JOIN branches b ON b.id = i.branch_id
     WHERE i.tenant_id = ? ORDER BY i.created_at DESC, i.rowid DESC`,
    [tenantId]
  );
}

export async function createInviteCode({ tenantId, role, branchId = null, createdByUserId }) {
  if (!['admin', 'manager', 'cashier'].includes(role)) {
    throw new Error('Invalid role for an invite.');
  }
  // Only staff roles are tied to one branch; an Admin sees every branch.
  let finalBranchId = null;
  if (role !== 'admin' && branchId) {
    const ok = query(`SELECT id FROM branches WHERE id = ? AND tenant_id = ? AND is_active = 1`, [branchId, tenantId]);
    if (ok.length === 0) throw new Error('That branch is not available for this business.');
    finalBranchId = branchId;
  }
  const id = newId('inv');
  const code = generateInviteCode();
  await run(
    `INSERT INTO invite_codes (id, tenant_id, code, role, branch_id, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, tenantId, code, role, finalBranchId, createdByUserId]
  );
  return code;
}

export async function revokeInviteCode(id) {
  await run(`UPDATE invite_codes SET revoked = 1 WHERE id = ?`, [id]);
}

// --- Join with an invite code: assigns the new user to the SAME tenant the
// code belongs to, with the role the code specifies. The tenant id is never
// typed or chosen by the joining person - it comes entirely from the code,
// per the requirement that tenant assignment is automatic, not self-selected.
export async function joinWithInviteCode({ code, name, email }) {
  const normalizedCode = code.trim().toUpperCase();
  const rows = query(`SELECT * FROM invite_codes WHERE code = ?`, [normalizedCode]);
  const invite = rows[0];

  if (!invite) throw new Error('Invite code not found.');
  if (invite.revoked) throw new Error('This invite code has been revoked.');
  if (invite.used_by) throw new Error('This invite code has already been used.');

  assertValidEmail(email);
  const existing = query(`SELECT id FROM users WHERE email = ?`, [normalizeEmail(email)]);
  if (existing.length > 0) throw new Error('An account with this email already exists. Try logging in instead.');

  const userId = newId('user');
  await run(
    `INSERT INTO users (id, tenant_id, branch_id, name, email, role, status, email_verified)
     VALUES (?, ?, ?, ?, ?, ?, 'active', 0)`,
    [userId, invite.tenant_id, invite.branch_id, name, normalizeEmail(email), invite.role]
  );
  await run(`UPDATE invite_codes SET used_by = ?, used_at = datetime('now') WHERE id = ?`, [userId, invite.id]);

  // Not logged in yet: the email must be verified first.
  const devCode = await issueVerificationCode({ id: userId, email: normalizeEmail(email) });
  return { userId, verificationRequired: true, devCode };
}

// --- Login: no real password system yet, so this matches purely by email -
// a clearly-labeled placeholder on the Login screen explains this plainly,
// so it's never mistaken for real security.
export async function loginByEmail(email) {
  const rows = query(`SELECT * FROM users WHERE email = ?`, [normalizeEmail(email)]);
  const user = rows[0];
  if (!user) throw new Error('No account found with that email.');
  if (user.status === 'suspended') throw new Error('This account has been suspended.');
  if (!user.email_verified) {
    const err = new Error('Please verify your email address before logging in.');
    err.code = 'EMAIL_NOT_VERIFIED';
    throw err;
  }

  logIn(user);
  return user;
}

// --- Tenant-scoped user management (for the Users page) ---

export function listUsersForTenant(tenantId) {
  return query(
    `SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.tenant_id = ? ORDER BY (u.role = 'owner') DESC, u.name ASC`,
    [tenantId]
  );
}

export function listAllTenants() {
  return query(`SELECT * FROM tenants ORDER BY name ASC`);
}

export async function updateUserRole(userId, role) {
  if (!['admin', 'manager', 'cashier'].includes(role)) {
    throw new Error('Cannot set this role here.'); // owner/super_admin are not reassignable from this screen
  }
  await run(`UPDATE users SET role = ? WHERE id = ?`, [role, userId]);
}

export async function setUserStatus(userId, status) {
  if (!['active', 'suspended'].includes(status)) throw new Error('Invalid status.');
  await run(`UPDATE users SET status = ? WHERE id = ?`, [status, userId]);
}

// Moves a staff member (manager/cashier) to another branch of the same tenant.
export async function updateUserBranch(userId, branchId) {
  const tenantId = getCurrentUser()?.role === 'super_admin' ? null : getCurrentUser()?.tenant_id;
  const target = query(`SELECT * FROM users WHERE id = ?`, [userId])[0];
  if (!target) throw new Error('User not found.');
  if (tenantId && target.tenant_id !== tenantId) throw new Error('User not found in this business.');
  if (!['manager', 'cashier'].includes(target.role)) throw new Error('Only managers and cashiers are tied to a branch.');
  const ok = query(`SELECT id FROM branches WHERE id = ? AND tenant_id = ? AND is_active = 1`, [branchId, target.tenant_id]);
  if (ok.length === 0) throw new Error('That branch is not available for this business.');
  await run(`UPDATE users SET branch_id = ? WHERE id = ?`, [branchId, userId]);
}
