import { useEffect, useState } from 'react';
import { cartTotal, updateCartItemQuantity, removeCartItem, clearCart, completeSale } from '../../db/cart';
import { listCustomers, ensureWalkInCustomer } from '../../db/customers';
import { getCompanySettings } from '../../db/companySettings';
import { formatMoney } from '../../db/currency';
import CustomerSelect from './CustomerSelect';
import CartLineEditModal from './CartLineEditModal';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card Payment' },
  { value: 'loyalty', label: 'Loyalty Credits' },
];

export default function CartPanel({ items, onChanged, onSaleCompleted }) {
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [includeOutstanding, setIncludeOutstanding] = useState(true);
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const total = cartTotal(items);
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const isWalkin = !selectedCustomer || selectedCustomer.is_walkin;
  const oldBalance = !isWalkin ? selectedCustomer.balance : 0;
  const applyOldBalance = !isWalkin && includeOutstanding && oldBalance > 0;
  const totalDue = total + (applyOldBalance ? oldBalance : 0);
  const company = getCompanySettings();

  useEffect(() => {
    (async () => {
      const walkinId = await ensureWalkInCustomer();
      setCustomers(listCustomers());
      setSelectedCustomerId(walkinId);
    })();
  }, []);

  // Auto-fill "amount paid" with the full amount due whenever the customer,
  // the include-outstanding toggle, or the cart total changes - the person
  // can still manually lower it for a partial payment.
  useEffect(() => {
    if (!isWalkin) setAmountPaid(String(totalDue));
  }, [totalDue, selectedCustomerId, includeOutstanding]);

  // Switching customers resets the toggle back to "include" by default, per
  // the requested behavior - it only matters if the newly selected customer
  // actually has a balance.
  useEffect(() => {
    setIncludeOutstanding(true);
  }, [selectedCustomerId]);

  async function refreshCustomers() {
    setCustomers(listCustomers());
  }

  async function handleCustomerAdded(newId) {
    await refreshCustomers();
    setSelectedCustomerId(newId);
  }

  async function handleQtyChange(item, newQty) {
    setError('');
    try {
      await updateCartItemQuantity(item.id, Number(newQty));
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemove(item) {
    await removeCartItem(item.id);
    onChanged();
  }

  async function handleClear() {
    if (items.length === 0) return;
    const confirmed = window.confirm('Clear all items from the cart?');
    if (!confirmed) return;
    await clearCart();
    onChanged();
  }

  async function handleCompleteSale() {
    setError('');
    setCompleting(true);
    try {
      const saleId = await completeSale({
        customerId: selectedCustomerId,
        amountPaid: isWalkin ? null : Number(amountPaid),
        includeOutstanding: applyOldBalance,
        paymentMethod: isWalkin ? (paymentMethod === 'loyalty' ? 'cash' : paymentMethod) : paymentMethod,
      });
      onChanged();
      await refreshCustomers();
      const walkinId = await ensureWalkInCustomer();
      setSelectedCustomerId(walkinId);
      setAmountPaid('');
      setPaymentMethod('cash');
      onSaleCompleted(saleId);
    } catch (err) {
      setError(err.message);
    } finally {
      setCompleting(false);
    }
  }

  const paidNum = amountPaid === '' ? 0 : Number(amountPaid);
  const remainingAfterPayment = totalDue - paidNum;
  // How this payment splits between old debt and the new sale, for the preview line.
  const towardOldBalance = applyOldBalance ? Math.min(paidNum, oldBalance) : 0;
  const towardSale = paidNum - towardOldBalance;
  const saleOutstandingPreview = total - towardSale;

  const pointsNeeded =
    paymentMethod === 'loyalty' && paidNum > 0
      ? Math.ceil(paidNum / (company.points_redeem_value || 1))
      : 0;
  const notEnoughPoints = paymentMethod === 'loyalty' && !isWalkin && pointsNeeded > (selectedCustomer?.loyalty_points || 0);

  return (
    <div className="cart-panel">
      <h3>Cart</h3>

      {items.length === 0 ? (
        <p className="empty-state">
          Cart is empty. Search and add a product to begin — or, if a customer just wants to
          pay down an existing balance, use "Record Payment" on their page in Customers.
        </p>
      ) : (
        <table className="cart-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Variety</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Line Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.product_name}</td>
                <td>{item.variety_name}</td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => handleQtyChange(item, e.target.value)}
                    className="cart-qty-input"
                  />
                </td>
                <td>{formatMoney(item.unit_price, company.currency_code)}</td>
                <td>{formatMoney(item.unit_price * item.quantity, company.currency_code)}</td>
                <td className="cart-row-actions">
                  <button className="link-btn name-link" onClick={() => setEditingItem(item)}>Edit</button>
                  <button className="link-btn danger" onClick={() => handleRemove(item)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <p className="modal-error">{error}</p>}

      <div className="customer-fields">
        <CustomerSelect
          customers={customers}
          selectedId={selectedCustomerId}
          onSelect={setSelectedCustomerId}
          onCustomerAdded={handleCustomerAdded}
        />

        {!isWalkin && (
          <div className="payment-method-field">
            <label className="modal-label">Payment Method</label>
            <select className="modal-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            {paymentMethod === 'loyalty' && (
              <p className="modal-hint">
                {selectedCustomer?.loyalty_points || 0} point(s) available
                {pointsNeeded > 0 && ` · needs ${pointsNeeded} point(s) for this amount`}
              </p>
            )}
          </div>
        )}
      </div>

      {!isWalkin && oldBalance > 0 && (
        <div className="outstanding-toggle">
          <label>
            <input
              type="checkbox"
              checked={includeOutstanding}
              onChange={(e) => setIncludeOutstanding(e.target.checked)}
            />
            {' '}Include {selectedCustomer.name}'s previous outstanding balance ({formatMoney(oldBalance, company.currency_code)}) in this payment
          </label>
        </div>
      )}

      {!isWalkin && (
        <div className="amount-paid-field">
          <label className="modal-label">
            Amount Paid {applyOldBalance ? `(Total Due: ${formatMoney(totalDue, company.currency_code)}, includes previous balance)` : ''}
          </label>
          <input
            type="number"
            step="0.01"
            className="modal-input"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
          />
          {saleOutstandingPreview > 0.004 && (
            <p className="modal-hint credit-hint">
              {formatMoney(saleOutstandingPreview, company.currency_code)} of this sale will be added to {selectedCustomer?.name}'s outstanding balance.
            </p>
          )}
          {applyOldBalance && towardOldBalance > 0.004 && (
            <p className="modal-hint">
              {formatMoney(towardOldBalance, company.currency_code)} of this payment goes toward the previous balance first.
            </p>
          )}
          {notEnoughPoints && (
            <p className="modal-error">Not enough loyalty points for this amount.</p>
          )}
        </div>
      )}

      <div className="cart-totals">
        <span>{applyOldBalance ? 'Sale Total' : 'Total'}</span>
        <strong>{formatMoney(total, company.currency_code)}</strong>
      </div>
      {applyOldBalance && (
        <div className="cart-totals cart-totals-sub">
          <span>Total Due (incl. previous balance)</span>
          <strong>{formatMoney(totalDue, company.currency_code)}</strong>
        </div>
      )}

      <div className="cart-actions">
        <button className="small-btn secondary" onClick={handleClear} disabled={items.length === 0}>
          Clear
        </button>
        <button
          className="small-btn complete-sale-btn"
          onClick={handleCompleteSale}
          disabled={items.length === 0 || completing || notEnoughPoints}
        >
          {completing ? 'Processing…' : 'Complete Sale'}
        </button>
      </div>
      {editingItem && (
        <CartLineEditModal
          item={editingItem}
          onSaved={onChanged}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
