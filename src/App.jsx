import { useEffect, useState } from 'react';
import { initDatabase, isReady } from './db/database';
import { listProducts, addProduct, deleteProduct } from './db/products';
import { listCategories, ensureSeedCategories } from './db/categories';
import {
  isLoggedIn, getCurrentUser, getViewingTenantId, logout, canAccessPage, clearViewingTenant, getCurrentBranchId,
} from './db/session';
import { superAdminExists, listAllTenants } from './db/users';
import SuperAdminBootstrap from './components/auth/SuperAdminBootstrap';
import AuthScreen from './components/auth/AuthScreen';
import TenantPicker from './components/auth/TenantPicker';
import ProductForm from './components/ProductForm';
import ProductList from './components/ProductList';
import ProductDetail from './components/ProductDetail';
import POSPage from './components/pos/POSPage';
import SalesHistoryPage from './components/invoice/SalesHistoryPage';
import CompanySettingsPage from './components/CompanySettingsPage';
import CustomersPage from './components/customers/CustomersPage';
import CategoriesPage from './components/CategoriesPage';
import ExpensesPage from './components/expenses/ExpensesPage';
import ReportsPage from './components/expenses/ReportsPage';
import UsersPage from './components/users/UsersPage';
import BranchSwitcher from './components/branches/BranchSwitcher';
import BranchesPage from './components/branches/BranchesPage';
import TransfersPage from './components/branches/TransfersPage';
import './App.css';

const NAV_ITEMS = [
  { key: 'products', label: 'Products / Stocking' },
  { key: 'pos', label: 'POS / Sales' },
  { key: 'history', label: 'Sales History' },
  { key: 'customers', label: 'Customers' },
  { key: 'transfers', label: 'Stock Transfers' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'reports', label: 'Reports' },
  { key: 'branches', label: 'Branches' },
  { key: 'users', label: 'Users' },
  { key: 'settings', label: 'Company Settings' },
];

function SelectBranchNotice({ action }) {
  return (
    <div className="scope-notice">
      <h2>Select a branch</h2>
      <p>
        You are viewing all branches combined, which is read-only. Choose a specific branch in the
        "Viewing" menu above to {action}.
      </p>
    </div>
  );
}

export default function App() {
  // authStep: 'bootstrap' | 'auth' | 'tenant-pick' | 'app'
  const [authStep, setAuthStep] = useState(null);
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [openProductId, setOpenProductId] = useState(null);
  const [showCategories, setShowCategories] = useState(false);
  const [tab, setTab] = useState('products');
  // Bumped whenever the branch changes, so every page remounts and re-reads
  // its data for the newly selected branch.
  const [branchVersion, setBranchVersion] = useState(0);

  useEffect(() => {
    (async () => {
      await initDatabase();
      evaluateAuthStep();
    })();
  }, []);

  function evaluateAuthStep() {
    if (!superAdminExists()) {
      setAuthStep('bootstrap');
      return;
    }
    if (!isLoggedIn()) {
      setAuthStep('auth');
      return;
    }
    const user = getCurrentUser();
    if (user.role === 'super_admin' && !getViewingTenantId()) {
      setAuthStep('tenant-pick');
      return;
    }
    enterApp();
  }

  async function enterApp() {
    await ensureSeedCategories();
    refresh();
    setAuthStep('app');
    setReady(true);
  }

  function refresh() {
    setProducts(listProducts());
    setCategories(listCategories());
  }

  function handleBranchChange() {
    setOpenProductId(null);
    setShowCategories(false);
    refresh();
    setBranchVersion((v) => v + 1);
  }

  function handleTabChange(nextTab) {
    setTab(nextTab);
    if (nextTab === 'products') refresh();
  }

  async function handleAdd(data) {
    const newProductId = await addProduct(data);
    refresh();
    setOpenProductId(newProductId);
  }

  async function handleDelete(id) {
    await deleteProduct(id);
    if (openProductId === id) setOpenProductId(null);
    refresh();
  }

  function handleLogout() {
    logout();
    setReady(false);
    setTab('products');
    evaluateAuthStep();
  }

  function handleSwitchTenant() {
    clearViewingTenant();
    setReady(false);
    setAuthStep('tenant-pick');
  }

  if (authStep === null) {
    return <div className="loading">Starting offline database…</div>;
  }
  if (authStep === 'bootstrap') {
    return <SuperAdminBootstrap onDone={evaluateAuthStep} />;
  }
  if (authStep === 'auth') {
    return <AuthScreen onDone={evaluateAuthStep} />;
  }
  if (authStep === 'tenant-pick') {
    return <TenantPicker onPicked={enterApp} />;
  }
  if (!ready || !isReady()) {
    return <div className="loading">Starting offline database…</div>;
  }

  const user = getCurrentUser();
  const tenantId = getViewingTenantId();
  const tenant = listAllTenants().find((t) => t.id === tenantId);
  const visibleNav = NAV_ITEMS.filter((item) => canAccessPage(user.role, item.key));
  // Never render a page this role may not open, even if `tab` points at one
  // (e.g. the default 'products' for a cashier).
  const activeTab = visibleNav.some((i) => i.key === tab) ? tab : visibleNav[0]?.key;
  const branchId = getCurrentBranchId();

  let page;
  if (activeTab === 'pos') {
    page = branchId ? <POSPage /> : <SelectBranchNotice action="make a sale" />;
  } else if (activeTab === 'history') {
    page = <SalesHistoryPage />;
  } else if (activeTab === 'customers') {
    page = <CustomersPage />;
  } else if (activeTab === 'transfers') {
    page = <TransfersPage onChanged={refresh} />;
  } else if (activeTab === 'expenses') {
    page = <ExpensesPage />;
  } else if (activeTab === 'reports') {
    page = <ReportsPage />;
  } else if (activeTab === 'branches') {
    page = <BranchesPage onChanged={() => setBranchVersion((v) => v + 1)} />;
  } else if (activeTab === 'users') {
    page = <UsersPage />;
  } else if (activeTab === 'settings') {
    page = <CompanySettingsPage />;
  } else if (openProductId) {
    page = <ProductDetail productId={openProductId} onBack={() => { setOpenProductId(null); refresh(); }} />;
  } else if (showCategories) {
    page = <CategoriesPage onBack={() => { setShowCategories(false); refresh(); }} />;
  } else {
    page = (
      <>
        <header>
          <div className="header-row">
            <div>
              <h1>Products &amp; Stocking</h1>
              <p className="subtitle">
                Click a product's name to open it and manage its varieties
                (Piece/Roll/Bundle/Dozen/Packet/Carton + Half-X). Stock shown is for the branch you are viewing.
              </p>
            </div>
            <button className="small-btn secondary" onClick={() => setShowCategories(true)}>
              Manage Categories
            </button>
          </div>
        </header>
        <ProductForm categories={categories} onAdd={handleAdd} stockEnabled={!!branchId} />
        <ProductList products={products} onDelete={handleDelete} onOpen={setOpenProductId} />
      </>
    );
  }

  return (
    <div className="app">
      <div className="app-header-bar no-print">
        <div className="app-brand">Wholesale/Retail Inventory with POS</div>
        <div className="app-identity">
          <span>{tenant?.name || 'Super Admin'} · {user.name} ({user.role.replace('_', ' ')})</span>
          <BranchSwitcher user={user} onChange={handleBranchChange} />
          {user.role === 'super_admin' && (
            <button className="link-btn name-link" onClick={handleSwitchTenant}>Switch Tenant</button>
          )}
          <button className="link-btn" onClick={handleLogout}>Log Out</button>
        </div>
      </div>

      <nav className="top-nav no-print">
        {visibleNav.map((item) => (
          <button
            key={item.key}
            className={activeTab === item.key ? 'nav-btn active' : 'nav-btn'}
            onClick={() => handleTabChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div key={branchVersion}>{page}</div>
    </div>
  );
}
