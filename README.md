# Personal Finance Ledger

A local-first, single-user personal finance app built with FastAPI and React. All data stays on your machine in SQLite files — no cloud, no subscriptions.

## Features

- **Account management** — checking, savings, credit cards, etc.
- **CSV/QFX import** — preview, column mapping, and duplicate detection
- **Monthly ledger** — sortable transaction list with running balances
- **Categories** — parent/child hierarchy with auto-matching rules
- **Payee rules** — rename rules, category defaults, and recurring templates
- **Linked transfers** — move money between accounts
- **Budgeting** — set monthly budgets per category and track spending
- **Forecasting** — recurring transaction templates projected forward
- **Reports** — spending breakdowns by month, category, and payee
- **Search** — search across all transactions with filters
- **Backup/restore** — download and upload SQLite snapshots
- **Dark mode**

---

## Quick Start with Docker (recommended)

The fastest way to get running. Requires only [Docker](https://docs.docker.com/get-docker/).

```bash
git clone https://github.com/mkrzywonski/budget.git
cd budget
docker compose up -d
```

Open **http://localhost:8000** in your browser.

Your data is stored in a Docker volume and persists across restarts. To stop:

```bash
docker compose down
```

To update to the latest version:

```bash
git pull
docker compose up -d --build
```

## Running Locally (without Docker)

### Prerequisites

- Python 3.11+
- Node.js 18+ and npm

### 1. Build the frontend

```bash
cd frontend
npm install
npm run build
cd ..
```

This creates `frontend/dist/` which the backend will serve automatically.

### 2. Set up and start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Open **http://127.0.0.1:8000** in your browser. A QR code is also printed in the terminal for mobile access on your local network.

### Frontend dev mode (optional)

If you're making changes to the UI, run the Vite dev server for hot-reload:

```bash
cd frontend
npm run dev
```

This starts on **http://localhost:5173** and proxies API calls to the backend on port 8000. You need both servers running in this mode.

---

## User Guide

### Getting Started

On first launch you'll see the **Book Picker**. A "book" is a single SQLite database file that holds all your accounts, transactions, categories, and settings.

- **Create New Book** — Enter a file path and optional display name. The app creates a new `.db` file and opens it.
- **Open Existing Book** — Browse your filesystem or type a path to open a previously created book.
- **Recent Books** — Books you've opened before appear in a list for quick access.

Once a book is open, you'll see the **Dashboard** with a sidebar for navigation.

### Dashboard

The dashboard shows all your accounts as cards displaying each account's name, type (checking, savings, credit card, cash, other), and institution. Click any account to go to its ledger.

- **Add Account** — Click "Add Account" and fill in the name, type, and optionally the institution.
- **Edit/Delete** — Hover over an account card to reveal edit and delete options.

A **backup reminder** banner appears if the book hasn't been backed up in over 90 days (or ever).

### Ledger

The ledger is where you view and manage transactions for a single account. It shows one month at a time with prev/next navigation and a "today" shortcut.

**Viewing transactions:**
- Transactions are displayed in a table with columns for date, type, payee, category, memo, and amount.
- A running balance column is available (configurable per account).
- The bottom of the table shows the month's net activity.

**Adding transactions:**
- Use the entry row at the bottom of the table. Set the date, choose debit (expense), credit (income), or transfer, enter the payee, pick a category, add an optional memo, and enter the amount.
- For **transfers**, you select a target account. The app creates a linked pair of transactions — one in each account — so the transfer isn't double-counted.

**Editing and deleting:**
- Hover over any transaction to reveal edit and delete icons.
- Clicking edit opens an inline form where you can change any field.

**Payee autocomplete:**
- As you type a payee name, previously used payees are suggested. When a payee rule matches (see below), the display name and category are filled in automatically.

**Forecast transactions:**
- Recurring forecasts (configured via payee rules) appear inline alongside actual transactions, slightly dimmed.
- You can **Confirm** a forecast to convert it to a real transaction (prefilled with the forecast data), or **Dismiss** it to hide it.

**Right-click menu:**
- Right-click on a payee name to quickly create or edit a payee rule for that payee.

### Importing Transactions

From any account's ledger, click **Import** to load transactions from a bank file.

**Supported formats:**
- **CSV / TXT** — Requires column mapping (the app auto-detects when possible).
- **QFX / OFX** — Parsed automatically; uses the bank's FITID for reliable duplicate detection.

**Import flow:**

1. **Upload** — Select your file. For CSV, you can load previously saved import settings for the account.

2. **Map columns (CSV only)** — Tell the app which columns contain the date, payee, memo, and amount. You can also configure the delimiter (comma, semicolon, tab), how many header rows to skip, and whether amounts are in a single column or split into separate debit/credit columns. A live preview shows how the file will be parsed.

3. **Preview** — The app shows a summary of what will be imported:
   - **New transactions** — Transactions not yet in the account, each with a checkbox so you can exclude any you don't want.
   - **Duplicates** — Transactions that match existing ones (by fingerprint for CSV, by FITID for QFX). You can accept individual duplicates to update the existing transaction, or reject them to skip.
   - **Errors** — Any rows that couldn't be parsed.

   For CSV imports, you can save the column mapping settings so future imports from the same bank auto-configure.

4. **Complete** — Shows a count of how many transactions were imported.

After import, payee rules are automatically applied to set display names and categories on the new transactions.

### Categories

Categories organize your transactions for budgeting and reporting. They support a **parent/child hierarchy** — for example, a "Housing" parent with "Rent", "Utilities", and "Insurance" children.

**Managing categories:**
- Navigate to **Categories** in the sidebar under "Manage".
- Categories are displayed as a tree: parent cards with children indented below.
- Click **Add Category** to create a new one. Give it a name, optionally assign a parent, and set a display order (controls sort position in lists).
- Click any category to edit its name, parent, or display order.

**How categories are used:**
- Assign a category to any transaction in the ledger.
- Set a default category on a payee rule so matching transactions are auto-categorized.
- Category dropdowns throughout the app show parents as group labels with children nested inside.
- Categories appear in reports and budgets for spending breakdowns.

### Payee Rules

Payee rules control how transaction payee names from your bank are cleaned up, categorized, and optionally used for forecasting. Navigate to **Payee Rules** in the sidebar under "Manage".

Each payee rule has:

**Display name** — The clean name shown in your ledger instead of the raw bank text (e.g., "AMZN*1234XYZ" becomes "Amazon").

**Default category** — When a transaction matches this rule, this category is automatically assigned.

**Match patterns** — One or more conditions that determine which transactions belong to this payee. Pattern types:
- **Starts with** — The raw payee begins with this string.
- **Contains** — The raw payee includes this substring anywhere.
- **Exact** — The raw payee matches exactly.
- **Regex** — Advanced matching with regular expressions.

A **live preview** shows which of your existing transaction payee names would match the current patterns as you edit them.

**Recurring template (optional)** — Turns this payee into a forecast source. Configure:
- Which **account** the recurring transaction appears in.
- **Frequency**: monthly, every N months, or annual.
- **Day of month** the transaction typically posts.
- **Amount method**: use a fixed amount, copy the last transaction's amount, or average the last N transactions.
- Optional **start/end dates** to bound the forecast range.

Forecasted transactions appear in the ledger where you can confirm or dismiss them (see Ledger section above).

**Re-match all** — The "Re-match All Transactions" button re-applies all payee rules to every existing transaction, updating display names and categories based on current rules. Useful after creating or editing rules.

### Budgets

Budgets let you set monthly spending targets per category and track actual spending against them. Navigate to **Budget** in the sidebar.

**Creating a budget:**
- Click **New Budget**, give it a name (e.g., "2025 Monthly Budget"), and select which accounts to track actuals from.

**Setting targets:**
- The budget page shows **Income** and **Expense** sections.
- Click **Add** in either section to add a category with a monthly target amount.
- Each row shows: budgeted amount, actual spending (from transactions), the difference, and a progress bar.
- Progress bars turn red when you exceed the budget.

**Month navigation:**
- Use prev/next buttons to view any month. Budgeted targets carry across months; actuals update based on that month's transactions.

**Auto-populate from history:**
- In budget settings, choose a date range and the app calculates your average monthly spending per category, then fills in budget amounts automatically.

**Unbudgeted spending:**
- Categories with actual transactions that aren't in your budget appear in a semi-transparent section at the bottom. Hover to add them to the budget with one click.

**Summary row:**
- The bottom of the page shows total budgeted net, actual net, and the difference.

### Forecasts

Forecasts are predicted future transactions generated from payee rules with recurring templates. They appear directly in the ledger alongside your real transactions.

- Forecasts show up slightly dimmed so you can tell them apart from actual transactions.
- **Confirm** converts a forecast into a real transaction (the form is prefilled with the forecast's data).
- **Dismiss** hides the forecast for that period without creating a transaction.
- Forecasts for a given month are automatically hidden once a real transaction from that payee is recorded.

Configure recurring templates on individual payee rules (see Payee Rules section).

### Reports

The Reports page provides spending analysis with drill-down. Navigate to **Reports** in the sidebar.

**Date range:**
- Navigate by month with prev/next buttons, or select a custom range.
- Quick presets: This Month, Last 3 Months, Year-to-Date, Last 12 Months.

**Filters:**
- Select which accounts to include (multi-select).
- Toggle whether to include transfer transactions.

**Summary cards** at the top always show total income, total expenses, and net.

**Report tabs:**

- **Category** — Bar chart of spending by category. Parent categories expand to show children. Click any category to see the individual transactions that make it up.

- **Payee** — Top payees ranked by total spending or income. Click any payee to drill down to its transactions.

- **Trends** — A 12-month stacked bar chart of income vs. expenses per month, with a table of exact amounts below. Click any month to see that month's transactions.

- **Budget vs. Actual** — Select a budget and see budgeted amount, actual amount, and difference for each category. Click to drill down to transactions.

**Drill-down panel:**
Clicking any item in a report opens a panel listing the matching transactions with date, account, payee, category, and amount. Click the account name to jump to that month in the ledger.

### Search

The Search page lets you find transactions across all accounts. Navigate to **Search** in the sidebar.

**Filters:**
- **Payee** — Substring match on payee name.
- **Account** — Filter to a specific account, or search all.
- **Category** — Filter to a specific category, or search all.
- **Date range** — Optional start and end dates.
- **Include transfers** — Toggle whether transfer transactions appear in results.

Results show date, account, payee, category, and amount. Click an account name to jump directly to that month's ledger. Filters persist across page navigation.

### Backup and Restore

**Download backup:**
- In the sidebar, click **Backup / Restore** and then **Download Backup**. This downloads a snapshot of the current book as a `.db` file using SQLite's online backup API (safe even while the app is running). The last backup date is recorded.

**Restore from backup:**
- Click **Restore from Backup** and select a previously downloaded `.db` file. The app validates the file, replaces the current book, and reloads. This overwrites all current data with the backup.

**Rename book:**
- Click the book name in the sidebar to edit it. This changes the display name only, not the file path.

### Dark Mode

Toggle dark mode using the theme switch at the bottom of the sidebar. Your preference is saved in the browser and persists across sessions.

---

## Project Structure

```
backend/
  app/
    api/          # FastAPI route handlers
    models/       # SQLAlchemy models
    schemas/      # Pydantic request/response schemas
    services/     # Business logic
    main.py       # App entry point
    database.py   # DB engine management
    config.py     # Config file handling
  requirements.txt
  run.py          # Dev server launcher

frontend/
  src/
    api/          # API client and TypeScript interfaces
    components/   # Shared React components
    hooks/        # TanStack Query hooks (one per resource)
    pages/        # Page components
    App.tsx       # Router
  index.html
  vite.config.ts
  tailwind.config.js

Dockerfile          # Multi-stage build
docker-compose.yml  # Single-service deployment
```

## Troubleshooting

- **`{"detail":"Not Found"}` at `/`** — The frontend hasn't been built. Run `npm run build` in `frontend/` and restart the backend. (This doesn't apply when using Docker.)
- **Port 8000 already in use** — Another service is using the port. Stop it, or change the port mapping in `docker-compose.yml` (e.g., `"9000:8000"`).

## License

This is a personal project. No license has been chosen yet.
