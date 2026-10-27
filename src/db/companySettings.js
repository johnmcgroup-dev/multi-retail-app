import { query, run } from './database';
import { DEMO_TENANT_ID } from './products';

export function getCompanySettings() {
  const rows = query(`SELECT * FROM company_settings WHERE tenant_id = ?`, [DEMO_TENANT_ID]);
  return rows[0] || { company_name: '', address: '', phone: '', email: '' };
}

export async function saveCompanySettings({ company_name, address, phone, email }) {
  const existing = query(`SELECT tenant_id FROM company_settings WHERE tenant_id = ?`, [DEMO_TENANT_ID]);
  if (existing.length > 0) {
    await run(
      `UPDATE company_settings SET company_name = ?, address = ?, phone = ?, email = ? WHERE tenant_id = ?`,
      [company_name, address, phone, email, DEMO_TENANT_ID]
    );
  } else {
    await run(
      `INSERT INTO company_settings (tenant_id, company_name, address, phone, email) VALUES (?, ?, ?, ?, ?)`,
      [DEMO_TENANT_ID, company_name, address, phone, email]
    );
  }
}
