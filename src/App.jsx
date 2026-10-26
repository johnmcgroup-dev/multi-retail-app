import { useEffect, useState } from 'react';
import { initDatabase, isReady } from './db/database';
import { listProducts, addProduct, deleteProduct, ensureSeedData } from './db/products';
import { listCategories, ensureSeedCategories } from './db/categories';
import ProductForm from './components/ProductForm';
import ProductList from './components/ProductList';
import ProductDetail from './components/ProductDetail';
import './App.css';

export default function App() {
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [openProductId, setOpenProductId] = useState(null);

  useEffect(() => {
    (async () => {
      await initDatabase();
      await ensureSeedData();
      await ensureSeedCategories();
      refresh();
      setReady(true);
    })();
  }, []);

  function refresh() {
    setProducts(listProducts());
    setCategories(listCategories());
  }

  async function handleAdd(data) {
    await addProduct(data);
    refresh();
  }

  async function handleDelete(id) {
    await deleteProduct(id);
    if (openProductId === id) setOpenProductId(null);
    refresh();
  }

  if (!ready || !isReady()) {
    return <div className="loading">Starting offline database…</div>;
  }

  return (
    <div className="app">
      <header>
        <h1>StockApp — Module 2: Products &amp; Varieties</h1>
        <p className="subtitle">
          Click a product's name to open it and manage its varieties
          (Piece/Roll/Bundle/Dozen/Packet/Carton + Half-X).
        </p>
      </header>

      {openProductId ? (
        <ProductDetail productId={openProductId} onBack={() => { setOpenProductId(null); refresh(); }} />
      ) : (
        <>
          <ProductForm categories={categories} onAdd={handleAdd} />
          <ProductList products={products} onDelete={handleDelete} onOpen={setOpenProductId} />
        </>
      )}
    </div>
  );
}
