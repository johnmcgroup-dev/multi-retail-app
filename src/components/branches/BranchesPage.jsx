import { useState } from 'react';
import { listBranchesWithCounts, addBranch, renameBranch, setBranchActive } from '../../db/branches';

export default function BranchesPage({ onChanged }) {
  const [branches, setBranches] = useState(listBranchesWithCounts());
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');

  function refresh() {
    setBranches(listBranchesWithCounts());
    onChanged?.();
  }

  async function attempt(fn) {
    setError('');
    try { await fn(); refresh(); } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <header>
        <h1>Branches</h1>
        <p className="subtitle">
          Outlets and warehouses of this business. Each branch keeps its own stock, sales, expenses and
          carts; the product catalog and customers are shared. Move stock between branches from Stock Transfers.
        </p>
      </header>

      <form
        className="product-form"
        onSubmit={(e) => { e.preventDefault(); attempt(async () => { await addBranch(newName); setNewName(''); }); }}
      >
        <h3>Add Branch</h3>
        <div className="form-row">
          <input placeholder="e.g. Lekki Outlet, Ikeja Warehouse" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <button type="submit">Add Branch</button>
        </div>
      </form>
      {error && <p className="modal-error">{error}</p>}

      <table className="product-table">
        <thead>
          <tr><th>Branch</th><th>Status</th><th>Staff</th><th>Products in stock</th><th>Total units</th><th></th></tr>
        </thead>
        <tbody>
          {branches.map((b) => (
            <tr key={b.id}>
              <td>
                {editingId === b.id ? (
                  <input className="modal-input" value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                ) : b.name}
              </td>
              <td className={b.is_active ? 'balance-clear' : 'balance-owing'}>{b.is_active ? 'Active' : 'Inactive'}</td>
              <td>{b.staff_count}</td>
              <td>{b.stocked_products}</td>
              <td>{b.total_units}</td>
              <td className="cart-row-actions">
                {editingId === b.id ? (
                  <>
                    <button className="link-btn name-link" onClick={() => attempt(async () => { await renameBranch(b.id, editingName); setEditingId(null); })}>Save</button>
                    <button className="link-btn" onClick={() => setEditingId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="link-btn name-link" onClick={() => { setEditingId(b.id); setEditingName(b.name); }}>Rename</button>
                    <button className="link-btn" onClick={() => attempt(() => setBranchActive(b.id, !b.is_active))}>
                      {b.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
