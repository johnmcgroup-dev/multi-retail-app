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
    }
  );
}

export async function saveCompanySettings({
  company_name,
  address,
  phone,
  email,
  points_per_amount,
  points_redeem_value,
  currency_code,
}) {
  const existing = query(`SELECT tenant_id FROM company_settings WHERE tenant_id = ?`, [getCurrentTenantId()]);
  if (existing.length > 0) {
    await run(
      `UPDATE company_settings
         SET company_name = ?, address = ?, phone = ?, email = ?,
             points_per_amount = ?, points_redeem_value = ?, currency_code = ?
       WHERE tenant_id = ?`,
      [
        company_name, address, phone, email,
        Number(points_per_amount) || 0, Number(points_redeem_value) || 1,
        currency_code || 'USD', getCurrentTenantId(),
      ]
    );
  } else {
    await run(
      `INSERT INTO company_settings
         (tenant_id, company_name, address, phone, email, points_per_amount, points_redeem_value, currency_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        getCurrentTenantId(), company_name, address, phone, email,
        Number(points_per_amount) || 0, Number(points_redeem_value) || 1,
        currency_code || 'USD',
      ]
    );
  }
}
