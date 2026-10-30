// A set of common world currencies with their usual symbol and decimal
// places. Not exhaustive - picking any 3-letter code not listed here still
// works, falling back to showing the code itself as the symbol with 2
// decimal places, which is a safe default for currencies not explicitly
// covered.
export const CURRENCIES = [
  { code: 'USD', symbol: '$', decimals: 2, name: 'US Dollar' },
  { code: 'EUR', symbol: '€', decimals: 2, name: 'Euro' },
  { code: 'GBP', symbol: '£', decimals: 2, name: 'British Pound' },
  { code: 'NGN', symbol: '₦', decimals: 2, name: 'Nigerian Naira' },
  { code: 'GHS', symbol: 'GH₵', decimals: 2, name: 'Ghanaian Cedi' },
  { code: 'KES', symbol: 'KSh', decimals: 2, name: 'Kenyan Shilling' },
  { code: 'ZAR', symbol: 'R', decimals: 2, name: 'South African Rand' },
  { code: 'INR', symbol: '₹', decimals: 2, name: 'Indian Rupee' },
  { code: 'CAD', symbol: 'CA$', decimals: 2, name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', decimals: 2, name: 'Australian Dollar' },
  { code: 'JPY', symbol: '¥', decimals: 0, name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', decimals: 2, name: 'Chinese Yuan' },
  { code: 'AED', symbol: 'AED', decimals: 2, name: 'UAE Dirham' },
  { code: 'SAR', symbol: 'SAR', decimals: 2, name: 'Saudi Riyal' },
  { code: 'BRL', symbol: 'R$', decimals: 2, name: 'Brazilian Real' },
  { code: 'MXN', symbol: 'MX$', decimals: 2, name: 'Mexican Peso' },
  { code: 'EGP', symbol: 'E£', decimals: 2, name: 'Egyptian Pound' },
  { code: 'PKR', symbol: 'Rs', decimals: 2, name: 'Pakistani Rupee' },
  { code: 'PHP', symbol: '₱', decimals: 2, name: 'Philippine Peso' },
  { code: 'IDR', symbol: 'Rp', decimals: 0, name: 'Indonesian Rupiah' },
];

export function getCurrencyMeta(code) {
  return CURRENCIES.find((c) => c.code === code) || { code, symbol: code || '$', decimals: 2, name: code };
}

// The one function every screen should use to display a money value -
// keeps formatting (symbol, decimal places) consistent everywhere, and
// means a tenant switching currency in Company Settings updates the whole
// app immediately rather than only wherever a developer remembered to.
export function formatMoney(amount, currencyCode) {
  const meta = getCurrencyMeta(currencyCode || 'USD');
  const n = Number(amount) || 0;
  return `${meta.symbol}${n.toFixed(meta.decimals)}`;
}
