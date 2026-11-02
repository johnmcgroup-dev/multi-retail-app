import { query, run } from './database';
import { getCurrentTenantId } from './session';

export function getCompanySettings() {
  const rows = query(`SELECT * FROM company_settings WHERE tenant_id = ?`, [getCurrentTenantId()]);
  return (
    rows[0] || {
      company_name: '',
      address: '',
      phone: '',
      email: '',
      points_per_amount: 0.1,
      points_redeem_value: 1.0,
      currency_code: 'USD',
      default_credit_limit: null,
    }
  );
}

// blank / null = "no limit"
function toLimit(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!(n >= 0)) throw new Error('Credit limit cannot be negative.');
  return n;
}

export async function saveCompanySettings({
  company_name,
  address,
  phone,
  email,
  points_per_amount,
  points_redeem_value,
  currency_code,
  default_credit_limit,
}) {
  const tenantId = getCurrentTenantId();
  const limit = toLimit(default_credit_limit);
  const existing = query(`SELECT tenant_id FROM company_settings WHERE tenant_id = ?`, [tenantId]);
  if (existing.length > 0) {
    await run(
      `UPDATE company_settings
         SET company_name = ?, address = ?, phone = ?, email = ?,
             points_per_amount = ?, points_redeem_value = ?, currency_code = ?, default_credit_limit = ?
       WHERE tenant_id = ?`,
      [
        company_name, address, phone, email,
        Number(points_per_amount) || 0, Number(points_redeem_value) || 1,
        currency_code || 'USD', limit, tenantId,
      ]
    );
  } else {
    await run(
      `INSERT INTO company_settings
         (tenant_id, company_name, address, phone, email, points_per_amount, points_redeem_value, currency_code, default_credit_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId, company_name, address, phone, email,
        Number(points_per_amount) || 0, Number(points_redeem_value) || 1,
        currency_code || 'USD', limit,
      ]
    );
  }
}
