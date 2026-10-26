# StockApp

Your app, rebuilt as real, self-owned code — starting offline-first, with cloud
hosting (AWS) added in a later module.

This is **Module 1: Foundation**. It proves the core idea works: a product list
that saves data in your browser and keeps it even when you're offline or you
refresh the page. Every future module (POS, invoices, varieties, roles,
branches, cloud sync) builds on top of this same base.

## What's in this module

- A product list: add a product (name, barcode, SKU, quantity, price), see it
  in a table, remove it.
- Data is stored **in your browser**, offline, using a real SQLite database
  (the same kind of database real apps and servers use) — not a temporary
  memory that disappears on refresh.
- The database structure (`src/db/schema.sql`) already includes the tables
  we'll need later (tenants, branches, users, varieties) so we don't have to
  redesign anything as we add features — we just build on it.

## How to run this on your computer

You said you have VS Code and GitHub — here's the full path from zero to running:

1. **Install Node.js** (one-time, if you don't have it): go to
   https://nodejs.org and install the "LTS" version. This is what lets your
   computer run the app's code.

2. **Open this folder in VS Code**: File -> Open Folder -> select the
   `stockapp` folder.

3. **Open a terminal inside VS Code**: Terminal menu -> New Terminal.

4. **Install the project's dependencies** (one-time, or after I add new ones):
   ```
   npm install
   ```

5. **Run the app**:
   ```
   npm run dev
   ```
   VS Code will show a link like `http://localhost:5173` — hold Ctrl (or Cmd
   on Mac) and click it, or paste it into your browser.

6. **Try it**: add a product, then refresh the page. It's still there. Then
   turn off your WiFi and refresh again — still there. That offline behavior
   is the whole point of this module.

To stop the app, click into the terminal and press `Ctrl + C`.

## Putting this on GitHub

1. Create a new, empty repository on GitHub (don't add a README there — we
   already have one).
2. In the VS Code terminal, inside this folder, run:
   ```
   git init
   git add .
   git commit -m "Module 1: offline foundation"
   git branch -M main
   git remote add origin <your-repo-url-here>
   git push -u origin main
   ```
   Replace `<your-repo-url-here>` with the URL GitHub gives you when you
   create the repository.

From then on, after any change, you (or I, guiding you) just run:
```
git add .
git commit -m "describe what changed"
git push
```

## Project structure (what each part does)

```
stockapp/
  src/
    db/
      schema.sql      -- the database's table structure (the "blueprint")
      database.js      -- loads the offline database, saves it after changes
      products.js       -- functions for reading/writing products
      id.js              -- generates unique IDs for new records
    components/
      ProductForm.jsx     -- the "add product" form
      ProductList.jsx     -- the table showing products
    App.jsx               -- the main screen, wires everything together
    App.css                -- styling
  public/
    sql-wasm.wasm            -- the SQLite engine that runs in the browser
```

## What's next (future modules)

Once you confirm this runs correctly on your machine, we move to Module 2:
Core data models — categories, product varieties (Piece/Roll/Bundle/Dozen/
Packet/Carton + Half-X), matching exactly what your current app has. Then
POS/Cart, invoicing, roles, branches, and finally AWS cloud hosting so
multiple devices sync.

If anything in this README doesn't work exactly as described on your
machine, tell me the exact error message shown and I'll fix it before we
move forward.
