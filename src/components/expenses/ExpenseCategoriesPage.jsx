import { useEffect, useState } from 'react';
import { listExpenseCategories, addExpenseCategory, updateExpenseCategory, deleteExpenseCategory } from '../../db/expenses';

export default function ExpenseCategoriesPage({ onBack }) {
  const [categories, setCategories] = useState([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => { refresh(); }, []);

  function refresh() {
    setCategories(listExpenseCategories());
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    await addExpenseCategory(newName.trim());
    setNewName('');
    refresh();
  }

  function startEdit(cat) {
    setEditingId(cat.id);
    setEditingName(cat.name);
  }

  async function saveEdit(id) {
    if (!editingName.trim()) return;
    await updateExpenseCategory(id, editingName.trim());
    setEditingId(null);
    refresh();
  }

  async function handleDelete(id) {
    const confirmed = window.confirm(
      'Delete this expense category? Expenses using it will become "Uncategorized" - they will not be deleted.'
    );
    if (!confirmed) return;
    await deleteExpenseCategory(id);
    refresh();
  }

  return (
    <div>
      <button className="link-btn" onClick={onBack}>← Back to expenses</button>
      <header><h1>Expense Categories</h1></header>

      <form onSubmit={handleAdd} className="product-form">
        <div className="form-row">
          <input placeholder="New category name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit">Add Category</button>
        </div>
      </form>

      <table className="product-table">
        <thead><tr><th>Name</th><th></th></tr></thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id}>
              <td>
                {editingId === c.id ? (
                  <input className="modal-input" value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                ) : (
                  c.name
                )}
              </td>
              <td className="cart-row-actions">
                {editingId === c.id ? (
                  <>
                    <button className="link-btn name-link" onClick={() => saveEdit(c.id)}>Save</button>
                    <button className="link-btn" onClick={() => setEditingId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="link-btn name-link" onClick={() => startEdit(c)}>Rename</button>
                    <button className="link-btn danger" onClick={() => handleDelete(c.id)}>Delete</button>
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
