// Small helper to generate unique IDs for new records.
// Using random IDs (not auto-increment numbers) matters for offline apps:
// two devices adding products while both offline must never end up with
// the same ID when they later sync to the same server.
export function newId(prefix = '') {
  const random = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return prefix ? `${prefix}_${random}` : random;
}
