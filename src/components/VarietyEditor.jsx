import { useEffect, useState } from 'react';
import {
  listVarietiesForProduct,
  updateParentVariety,
  overrideHalfVariety,
  resetHalfToParent,
  HALF_TO_PARENT,
  isHalfVariety,
  PIECE_NAME,
} from '../db/varieties';

// Order to display rows in: each parent immediately followed by its Half-X (if any).
const DISPLAY_ORDER = [
  'Piece',
  'Roll', 'Half-Roll',
  'Bundle', 'Half-Bundle',
  'Dozen', 'Half-Dozen',
  'Packet', 'Half-Packet',
  'Carton', 'Half-Carton',
];

export default function VarietyEditor({ productId }) {
  const [varieties, setVarieties] = useState([]);
  // draft holds unsaved edits per variety id: { [id]: { qty, price } }
  const [draft, setDraft] = useState({});
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    refresh();
  }, [productId]);

  function refresh() {
    const rows = listVarietiesForProduct(productId);
    setVarieties(rows);
    setDraft({});
  }

  function handleChange(variety, field, value) {
    setDraft((prev) => ({
      ...prev,
      [variety.id]: { ...prev[variety.id], [field]: value },
    }));
  }

  function hasUnsavedChanges(variety) {
    return !!draft[variety.id];
  }

  function anyUnsaved() {
    return Object.keys(draft).length > 0;
  }

  async function handleSaveRow(variety) {
    const edits = draft[variety.id];
    if (!edits) return;
    const qty = edits.qty !== undefined ? edits.qty : variety.qty;
    const price = edits.price !== undefined ? edits.price : variety.price;

    if (isHalfVariety(variety.name)) {
      await overrideHalfVariety(variety.id, { qty, price });
    } else {
      await updateParentVariety(variety.id, { qty, price });
    }
    refresh();
    setSavedMessage(`${variety.name} saved.`);
    setTimeout(() => setSavedMessage(''), 2000);
  }

  async function handleReset(variety) {
    await resetHalfToParent(variety.id);
    refresh();
  }

  const byName = Object.fromEntries(varieties.map((v) => [v.name, v]));

  return (
    <div className="variety-editor">
      <div className="variety-header-row">
        <h3>Product Varieties</h3>
        {savedMessage && <span className="saved-msg">{savedMessage}</span>}
      </div>
      <p className="variety-hint">
        <strong>This is where you set up each variety for sale on the POS page.</strong> A
        variety with Qty = 0 cannot be sold yet — set its Qty and Price below, then click
        Save on that row. Half-X values auto-fill as half of their parent; edit one
        manually to override it — it will then stop auto-updating until you press Reset.
      </p>

      <table className="variety-table">
        <thead>
          <tr>
            <th>Variety</th>
            <th>Qty</th>
            <th>Price</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {DISPLAY_ORDER.map((name) => {
            const variety = byName[name];
            if (!variety) return null;
            const half = isHalfVariety(name);
            const unsaved = hasUnsavedChanges(variety);
            const isPiece = name === PIECE_NAME;
            const notSetUp = !half && !isPiece && (!variety.qty || variety.qty <= 0);

            return (
              <tr key={variety.id} className={`${half ? 'half-row' : 'parent-row'} ${notSetUp ? 'needs-setup-row' : ''}`}>
                <td>
                  {half ? `↳ ${name}` : name}
                  {half && variety.is_manual_override ? (
                    <span className="override-badge" title="Manually overridden">custom</span>
                  ) : null}
                  {isPiece && <span className="fixed-badge" title="Always equals 1 base stock unit">fixed</span>}
                  {notSetUp && <span className="setup-badge">not set up</span>}
                </td>
                <td>
                  {isPiece ? (
                    <input type="number" value="1" disabled title="Piece always equals 1 base stock unit" />
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      value={draft[variety.id]?.qty ?? variety.qty}
                      onChange={(e) => handleChange(variety, 'qty', e.target.value)}
                    />
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={draft[variety.id]?.price ?? variety.price}
                    onChange={(e) => handleChange(variety, 'price', e.target.value)}
                  />
                </td>
                <td className="variety-actions">
                  <button
                    className="small-btn"
                    disabled={!unsaved}
                    onClick={() => handleSaveRow(variety)}
                  >
                    Save
                  </button>
                  {half && (
                    <button className="small-btn secondary" onClick={() => handleReset(variety)}>
                      Reset to half
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {anyUnsaved() && <p className="unsaved-notice">You have unsaved changes on one or more rows.</p>}
    </div>
  );
}
