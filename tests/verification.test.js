import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase, query, run } from '../src/db/database';
import {
  createSuperAdmin, signUpAsNewTenantOwner, loginByEmail, verifyEmail, resendVerificationCode,
  createInviteCode, joinWithInviteCode, isValidEmail,
} from '../src/db/users';
import { getCurrentUser, logout } from '../src/db/session';

let owner;

beforeAll(async () => {
  await initDatabase();
  await createSuperAdmin({ name: 'Dev', email: 'Dev@X.com' });
  logout();
});

const verifiedFlag = (email) => query(`SELECT email_verified FROM users WHERE email = ?`, [email])[0].email_verified;

describe('what counts as an email address', () => {
  it('rejects junk and accepts normal addresses', () => {
    for (const bad of ['jargon', 'a@b', 'a@b.c', 'x y@z.com', 'a@@b.com', 'a@b..com', '@b.com', 'a@.com', 'a@b.', '', null, 'x'.repeat(250) + '@b.com']) {
      expect(isValidEmail(bad), String(bad).slice(0, 20)).toBe(false);
    }
    for (const good of ['name@example.com', 'first.last+tag@sub.example.co.uk', 'A@B.ng']) {
      expect(isValidEmail(good), good).toBe(true);
    }
  });

  it('sign-up, join and super-admin setup all refuse an invalid address', async () => {
    await expect(signUpAsNewTenantOwner({ tenantName: 'X', name: 'X', email: 'jargon' })).rejects.toThrow(/valid email/);
    await expect(joinWithInviteCode({ code: 'AAAA-BBBB', name: 'X', email: 'a@b' })).rejects.toThrow(/Invite code not found|valid email/);
    expect(query(`SELECT id FROM tenants`)).toHaveLength(0); // nothing was created by the refused sign-up
  });
});

describe('signing up requires verifying the email first', () => {
  it('creates the account but does NOT log the person in, and login is refused', async () => {
    const r = await signUpAsNewTenantOwner({ tenantName: 'Acme', name: 'Alice', email: ' Alice@Acme.com ' });
    owner = r;
    expect(r.verificationRequired).toBe(true);
    expect(r.devCode).toMatch(/^\d{6}$/);
    expect(getCurrentUser()).toBeNull();
    expect(verifiedFlag('alice@acme.com')).toBe(0);
    await expect(loginByEmail('alice@acme.com')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(getCurrentUser()).toBeNull();
  });

  it('a duplicate address is refused whatever its capitalisation', async () => {
    await expect(signUpAsNewTenantOwner({ tenantName: 'B', name: 'B', email: 'ALICE@acme.com' })).rejects.toThrow(/already exists/);
  });

  it('wrong codes are counted, and after 5 the code is dead even if you then get it right', async () => {
    const real = query(`SELECT code FROM email_verifications WHERE user_id = ? AND used_at IS NULL`, [owner.userId])[0].code;
    const wrong = real === '000000' ? '111111' : '000000';
    await expect(verifyEmail({ email: 'alice@acme.com', code: wrong })).rejects.toThrow(/4 attempt\(s\) left/);
    for (let i = 0; i < 3; i++) await expect(verifyEmail({ email: 'alice@acme.com', code: wrong })).rejects.toThrow(/Incorrect/);
    await expect(verifyEmail({ email: 'alice@acme.com', code: wrong })).rejects.toThrow(/Too many/);
    await expect(verifyEmail({ email: 'alice@acme.com', code: real })).rejects.toThrow(/Too many/);
    expect(getCurrentUser()).toBeNull();
    expect(verifiedFlag('alice@acme.com')).toBe(0);
  });

  it('asking for a new code cancels the old one', async () => {
    const oldCode = query(`SELECT code FROM email_verifications WHERE user_id = ? ORDER BY rowid DESC LIMIT 1`, [owner.userId])[0].code;
    let fresh = await resendVerificationCode('alice@acme.com');
    while (fresh === oldCode) fresh = await resendVerificationCode('alice@acme.com'); // astronomically unlikely clash
    await expect(verifyEmail({ email: 'alice@acme.com', code: oldCode })).rejects.toThrow(/Incorrect/);
    owner.devCode = fresh;
  });

  it('an expired code is refused until a new one is requested', async () => {
    await run(`UPDATE email_verifications SET expires_at = ? WHERE user_id = ? AND used_at IS NULL`, [new Date(Date.now() - 1000).toISOString(), owner.userId]);
    await expect(verifyEmail({ email: 'alice@acme.com', code: owner.devCode })).rejects.toThrow(/expired/);
    owner.devCode = await resendVerificationCode('alice@acme.com');
  });

  it('the right code verifies the account AND logs in; login works from then on', async () => {
    const user = await verifyEmail({ email: 'alice@acme.com', code: owner.devCode });
    expect(user.email_verified).toBe(1);
    expect(getCurrentUser()).toMatchObject({ email: 'alice@acme.com', role: 'owner' });
    logout();
    await expect(loginByEmail('alice@acme.com')).resolves.toMatchObject({ role: 'owner' });
  });

  it('verification cannot be used as a password-free login for an account that is already verified', async () => {
    logout();
    await expect(verifyEmail({ email: 'alice@acme.com', code: '123456' })).rejects.toThrow(/already verified/);
    expect(getCurrentUser()).toBeNull();
    expect(await resendVerificationCode('alice@acme.com')).toBeNull(); // and says nothing about it
    expect(await resendVerificationCode('nobody@nowhere.com')).toBeNull();
  });
});

describe('staff joining with an invite code verify too', () => {
  it('the invite is used up, but the staff member cannot log in until verified', async () => {
    await loginByEmail('alice@acme.com');
    const code = await createInviteCode({ tenantId: owner.tenantId, role: 'cashier', createdByUserId: owner.userId });
    logout();
    const r = await joinWithInviteCode({ code, name: 'Chidi', email: 'chidi@acme.com' });
    expect(r.verificationRequired).toBe(true);
    expect(getCurrentUser()).toBeNull();
    expect(query(`SELECT used_by FROM invite_codes WHERE code = ?`, [code])[0].used_by).toBe(r.userId);
    await expect(loginByEmail('chidi@acme.com')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    await expect(joinWithInviteCode({ code, name: 'Eve', email: 'eve@acme.com' })).rejects.toThrow(/already been used/);

    await verifyEmail({ email: 'chidi@acme.com', code: r.devCode });
    expect(getCurrentUser()).toMatchObject({ email: 'chidi@acme.com', role: 'cashier', tenant_id: owner.tenantId });
  });
});

describe('the super admin and existing accounts', () => {
  it('the first (super admin) account is verified from the start and can log in', async () => {
    logout();
    expect(verifiedFlag('dev@x.com')).toBe(1);
    await expect(loginByEmail('DEV@x.com')).resolves.toMatchObject({ role: 'super_admin' });
  });
});
