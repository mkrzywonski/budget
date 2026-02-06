# Personal Finance Ledger (Local-First) — Project Brief

## Summary

Build a **local-first, single-user/household** personal finance application that runs as a **GUI-less Python program** and exposes a **local web interface**. The user launches the program; it starts a web server on **localhost**, prints a **URL + QR code**, and the browser UI provides a ledger-centric workflow optimized for **monthly** planning and review.

Primary goals:

- **Fast data entry** by importing transactions from **CSV and QFX/QFX-like** exports (no direct bank integration).
- **Monthly workflow**: default to the current month, navigate previous/next months, view totals and forecasts.
- **Categorization** of payees/transactions and **rules** to automate categorization.
- **Forecasting** for current/future months: recurring estimated expenses appear as forecast rows; the user can “actualize” them when real transactions arrive.
- **Transfers** between accounts should be easy: one action creates matching entries in both accounts.
- **Reports** by month and category/payee.
- **Simple packaging**: Python + venv (no installer; no special security/encryption at this stage).
- **Backups**: export to **JSON**, possibly automatically on shutdown.

Non-goals (explicitly out of scope for v1):

- No direct bank aggregation (Plaid, etc.).
- No multi-user, permissions, roles.
- No multi-currency.
- No investment/commodity tracking (prices, unrealized gains, etc.).
- No full double-entry accounting system (but transfers across accounts must stay consistent).

---

## Environment & Platform Choices

- **Language**: Python
- **Runtime/Packaging**: Python + virtualenv (`venv`); run as a local process
- **UI**: Local web interface (mobile-friendly responsive design is desired)
- **Server**: local HTTP server on `127.0.0.1` (default)
- **Database**: SQLite
- **Book Model**: *One “book” per database file*; user can open/close different DB files

---

## Core UX Concepts

### Ledger

- Each account has a ledger.
- The UI presents a **monthly view** (not a monthly-column DB design): default month = current month.
- Month navigation controls: previous/next month, jump to month.
- Show **running balance** in the ledger view (similar to Quicken-style balance projection).

### Imports

- User can manually enter transactions.
- User can import transactions from CSV or QFX.
- Import flow includes a **preview screen**:
  - user can assign fields (date, amount, payee, memo, etc.)
  - user can save an **import profile** for that account so future imports require no remapping
  - preview should highlight duplicates and allow accept/reject decisions before committing

### Duplicates (Idempotency)

- Manual duplicate transactions are allowed (no blocking).
- Imported duplicates should be detected and the user must **accept or reject** them during import.
- For CSV imports without stable IDs, duplicate detection is based on **unique payee/date/value**.

### Categorization

- Payee normalization + categories.
- From the ledger: user can categorize a transaction and optionally create a **categorization rule** for that payee/pattern.
- Separate screen for managing categorization rules.

### Forecasting

- Forecast rows appear **only** for:
  - **current month** and **future months**
- **past months** show only actual (entered/imported) transactions.
- Each account has a **Recurring/Forecast screen** to manage recurring expenses used to generate forecasts.
- From a ledger transaction: user can select “Add to recurring payments” so it appears in forecasts going forward.
- Forecast rows are shown in a **different color** than actual transactions.
- User can click an estimated/forecast row and enter the actual data (“actualize” it).
- Show a total for the month: **sum of estimated transactions not yet entered** (remaining forecast) so the user can see required funds for the rest of the month.

### Transfers

- Easy transfer entry between accounts:
  - one action creates a corresponding transaction in both ledgers
  - they remain linked so edits can be coordinated

### Backups

- Export backups in **JSON** format.
- Possibly auto-export on app shutdown (and/or explicit “Export now” action).

---

## Data Model (Conceptual)

These are the entities implied by the requirements. Exact schema will be finalized after open questions are answered.

### Book / Database File
- One DB file represents one household “book”.
- User can open a DB file at startup (or from UI), and close/switch to another file.

### Accounts
- Multiple accounts (checking, savings, credit card, etc.).
- Each transaction belongs to exactly one account.

### Transactions
Two types of rows shown in the ledger UI:
- **Actual transactions**: manually entered or imported; have stable internal IDs
- **Forecast transactions**: generated from recurring templates for current/future months; visually distinct

Fields likely needed (conceptual):
- `posted_date`
- `amount` (store as integer cents)
- `payee_raw` and/or `payee_normalized`
- `memo/notes`
- `category`
- `source` (manual / import_csv / import_qfx / system)
- `status` (actual / forecast)
- `import_batch_id` (optional)
- `external_id` for QFX (e.g., FITID) when available
- linkage fields for transfers and forecast fulfillment

### Payees & Categories
- Payees: normalized canonical payee names
- Categories: spending categories (optionally hierarchical)

### Categorization Rules
- Rules that map transaction text/pattern → payee/category.
- Managed in a dedicated UI screen.
- Created from ledger actions when user categorizes transactions.

### Import Profiles
Per account (and per CSV format “signature” if needed):
- column mappings
- date format, delimiter
- sign conventions for amounts
- other parsing rules

### Recurring / Forecast Templates
Per account:
- include in forecast (checkbox / dropdown)
- amount method: copy last / avg N / fixed, etc.
- frequency: monthly / every N months / annual
- day-of-month semantics
- payee/category association

Forecast instances are generated from templates for current and future months, and then can be “fulfilled” by actual transactions.

---

## Key Workflows (MVP)

### 1) Open Book
- Choose existing DB file or create new.
- Load accounts and land on the default account ledger for current month.

### 2) Ledger Monthly View
- List transactions for selected account and month.
- Display actual + forecast rows (only current/future months).
- Color code forecast rows.
- Show totals: actual, forecast, remaining forecast.
- Show running balance.

### 3) Import Transactions
- Click Import → upload CSV/QFX → preview and mapping.
- Apply saved profile automatically if matched.
- Detect duplicates and allow accept/reject.
- Commit import batch.
- Apply categorization rules automatically to new actual transactions.

### 4) Categorize & Rule Creation
- Inline categorize a transaction in ledger.
- Prompt “Create rule?” with suggested pattern from payee/description.

### 5) Manage Recurring / Forecasts
- Manage recurring templates for an account.
- Add template from an existing transaction.
- Forecast rows generated for current/future months.
- Click forecast row → enter actual → forecast marked fulfilled.

### 6) Transfer Entry
- Create transfer with from-account, to-account, date, amount.
- App creates two linked transactions; shows in both ledgers.

### 7) Reports
- Monthly spending by category and payee.
- Ability to select month/range and exclude transfers by default.

### 8) Backup Export
- Export JSON manually.
- Optional auto-export on shutdown.

---

## Implementation Notes (Initial Defaults)

- Bind server to `127.0.0.1` only (no LAN access required for v1).
- No authentication/password for v1; no DB encryption.
- Amounts stored as integer cents to avoid floating point issues.
- Timezones: treat `posted_date` as a date-only field; no need for timezone-aware timestamps initially.

---

## Design Decisions

The following decisions have been finalized:

### A) Book/DB File Handling
- **Startup UX**: Web book picker page — app starts server, opens browser to select/create book
- **Recent books**: Yes — store in `~/.config/budget/recent.json`
- **Single instance**: Yes — one book open at a time
- **DB locking**: Block with error message if book already open by another process

### B) Ledger & Balances
- **Starting balance**: Balance adjustment transaction (special transaction type)
- **Tie-breaker ordering**: Creation time (when multiple transactions share same date)
- **Running balance**: Single projected balance that includes forecasts for current/future months
- **Daily projection**: Per-transaction running balance (no daily projection for v1)

### C) Import Profiles & Parsing
- **Profile matching**: Header signature auto-detect (match CSV headers to saved profiles)
- **Amount formats**: All common formats (split debit/credit columns, currency symbols, parentheses negatives, sign conventions)
- **Date parsing**: Auto-detect common formats + allow manual override in profile
- **QFX**: Support OFX 1.x/2.x via ofxparse library

### D) Duplicate Detection & Resolution
- **Duplicate key**: Date + amount + payee (memo not included)
- **Resolution UI**: Per-row accept/reject + bulk "accept all" / "reject all duplicates" actions
- **Accepted duplicates**: Store normally (no special marking)

### E) Categorization Rules
- **Match types**: Contains, exact, and regex
- **Priority**: First match wins (rules checked in order)
- **Scope**: Rules apply to actual transactions only (not forecasts)
- **Payee model**: Separate `payee_raw` + `payee_normalized` fields

### F) Forecast Templates & Instances
- **Amount methods**: Fixed, copy last, average of last N
- **Frequencies**: Monthly, every N months, annual
- **Day overflow**: Use last day of month if set day exceeds month length
- **Start date**: Templates begin forecasting from next month

### G) Forecast Fulfillment ("Actualize")
- **Actualize action**: Convert forecast row to actual transaction
- **Auto-fulfillment**: Yes — match by payee + month + amount exactly
- **Unmatched actuals**: Remain standalone (no forecast required)

### H) Transfers
- **Transfer UI**: Transaction type in ledger (prompts for other account)
- **Edit behavior**: Auto-update other side when one side is edited
- **Reports**: Transfers excluded from category spending reports by default

### I) Reports
- **Required reports**: By category per month, by payee per month
- **Forecast inclusion**: Actual transactions only (no forecasts in reports)
- **Refunds**: Net within category (refunds reduce category total)

### J) Backups
- **Approach**: Direct SQLite database file backup (no JSON export)

### K) UI/Frontend Technical Choice
- **Frontend**: React SPA
- **Keyboard navigation**: Spreadsheet-style (arrow keys, bulk edit, quick entry)

### L) Project Structure & Tooling
- **Database access**: SQLAlchemy ORM
- **Migrations**: Alembic
- **Backend**: FastAPI
- **Testing**: Unit tests for import parsing, dedupe, rule engine, forecast generator

---

## Acceptance Criteria (MVP)

The MVP is “done” when:

1. User can create/open a book (SQLite DB file) and create multiple accounts.
2. Ledger monthly view works with:
   - current month default
   - previous/next navigation
   - actual transactions display
   - running balance display
3. Import works for at least one CSV format with:
   - preview + field mapping
   - saved import profile and re-use
   - duplicate detection + accept/reject before commit
4. Categorization works with:
   - manual category assignment in ledger
   - create/manage rules
   - rules auto-apply on import
5. Forecasting works with:
   - per-account recurring templates
   - forecast rows displayed for current/future months only
   - user can “actualize” a forecast row
   - remaining forecast total visible for current month
6. Transfers create linked entries in both accounts.
7. JSON export backup works (manual) and optionally on shutdown.

---

## Next Steps

Completed:
- [x] Design decisions finalized (see above)
- [x] SQLAlchemy models created
- [x] FastAPI backend scaffolded with API routes
- [x] React frontend scaffolded with book picker, dashboard, ledger view
- [x] CSV importer with column mapping, duplicate detection, and profile saving

Remaining:
1. Implement QFX importer
2. Implement QFX importer
3. Implement categories + categorization rules engine
4. Implement recurring templates + forecast generation + fulfillment
5. Add transaction create/edit UI with keyboard navigation
6. Add reports (category/payee per month)
7. Add SQLite backup functionality

---

## Project Structure

```
budget/
├── backend/
│   ├── app/
│   │   ├── api/           # FastAPI route handlers
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── services/      # Business logic
│   │   ├── database.py    # DB connection management
│   │   ├── config.py      # App configuration
│   │   └── main.py        # FastAPI app entry
│   ├── alembic/           # Database migrations
│   ├── run.py             # Server entry point
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── api/           # API client
    │   ├── components/    # Reusable UI components
    │   ├── hooks/         # React Query hooks
    │   ├── pages/         # Page components
    │   └── utils/         # Helper functions
    ├── package.json
    └── vite.config.ts
```

## Running the Application

Backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py
```

Frontend (development):
```bash
cd frontend
npm install
npm run dev
```

