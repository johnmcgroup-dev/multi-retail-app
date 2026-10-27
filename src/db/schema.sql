-- StockApp offline-first database schema
-- This same schema will run both in the browser (offline, via sql.js/WASM)
-- and later on the real server (SQLite or Postgres), so data moves cleanly
-- from offline-first local storage to cloud sync without being redesigned.

-- TENANTS: each company/business using the app
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- BRANCHES: outlets/warehouses belonging to a tenant (built now, used fully in a later module)
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- USERS: logins, scoped to a tenant, with a role
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id), -- NULL only for super_admin
  branch_id TEXT REFERENCES branches(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('super_admin','owner','admin','manager','cashier')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL
);

-- PRODUCTS: the core item record
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  branch_id TEXT REFERENCES branches(id),
  name TEXT NOT NULL,
  barcode TEXT,
  sku TEXT,
  category_id TEXT REFERENCES categories(id),
  quantity REAL NOT NULL DEFAULT 0,  -- base stock quantity (in "Piece" units)
  base_price REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT  -- soft delete, needed later for sync conflict handling
);

-- PRODUCT VARIETIES: Piece, Roll, Bundle, Dozen, Packet, Carton, Half-X, etc.
CREATE TABLE IF NOT EXISTS product_varieties (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,         -- e.g. "Carton", "Half-Carton"
  qty REAL NOT NULL,          -- how many base units this variety represents
  price REAL NOT NULL,
  is_half_variant INTEGER NOT NULL DEFAULT 0,
  parent_variety_id TEXT REFERENCES product_varieties(id), -- for Half-X auto-calc link
  is_manual_override INTEGER NOT NULL DEFAULT 0
);

-- CART ITEMS: the live, in-progress sale. Rows here persist in the offline
-- database (not just memory), so the cart survives a page refresh, closing
-- the browser, or navigating away - it only empties on a completed sale or
-- the Clear button (see cart.js for that logic).
CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  variety_id TEXT NOT NULL REFERENCES product_varieties(id),
  product_name TEXT NOT NULL,   -- snapshot, so cart still reads fine even if product is renamed later
  variety_name TEXT NOT NULL,
  unit_price REAL NOT NULL,
  base_units_per_item REAL NOT NULL, -- how many base (Piece) units one of this variety consumes
  quantity REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SALES: a completed, finalized transaction
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  total REAL NOT NULL,
  customer_name TEXT,   -- optional, captured at checkout for the invoice
  customer_phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- COMPANY SETTINGS: shown at the top of every invoice. One row per tenant.
CREATE TABLE IF NOT EXISTS company_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  company_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT ''
);

-- SALE ITEMS: a frozen snapshot of each cart line at the moment of sale
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  product_id TEXT NOT NULL,
  variety_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  variety_name TEXT NOT NULL,
  unit_price REAL NOT NULL,
  quantity REAL NOT NULL,
  line_total REAL NOT NULL
);

-- SYNC METADATA: every table that needs offline<->cloud sync gets a row here
-- so we always know what changed locally and hasn't been pushed to the server yet.
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert','update','delete')),
  payload TEXT NOT NULL, -- JSON snapshot of the row
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced INTEGER NOT NULL DEFAULT 0
);
