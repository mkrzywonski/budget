# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend
```bash
cd backend
source .venv/bin/activate  # uses existing venv (not venv/, it's .venv/)
python run.py --no-browser  # starts uvicorn on :8000 with auto-reload
```

### Frontend
```bash
cd frontend
npm run dev          # Vite dev server on :5173, proxies /api to :8000
npm run build        # TypeScript check + production build to dist/
npx tsc --noEmit     # Type-check only (no emit)
```

The backend serves the built frontend from `frontend/dist` if it exists. During development, run both servers — Vite handles HMR and proxies API calls.

**Important:** Tailwind config changes require a Vite dev server restart to take effect.

## Architecture

### Backend: FastAPI + SQLAlchemy + SQLite
- **Dynamic "book" files**: Each budget is a separate SQLite file. `database.py` manages a global engine/session that switches when the user opens a book.
- **No Alembic migrations**: Tables are created via `Base.metadata.create_all()`. This only creates NEW tables — it does NOT add columns to existing ones. When adding columns to existing models, you must also add an `ALTER TABLE` entry in `database.py:_migrate_schema()`.
- **API prefix**: All routes are under `/api` (e.g., `/api/accounts/`, `/api/transactions/`).
- **Session lifecycle**: `get_db()` yields a session that auto-commits on success and rolls back on exception.

### Frontend: React + TypeScript + TanStack Query + Tailwind
- **API client**: `api/client.ts` — thin fetch wrapper + all TypeScript interfaces matching backend schemas.
- **Hooks**: One hook file per resource (`useAccounts.ts`, `useTransactions.ts`, etc.) wrapping TanStack Query mutations/queries.
- **Pages**: `BookPicker` (no layout) → `Layout` wraps `Dashboard`, `Ledger`, `Reports`, `Payees`, `Categories`.
- **Routing**: Defined in `App.tsx`, sidebar nav in `components/Layout.tsx`.

### Dark Mode (CSS Custom Properties)
Theme uses CSS variables defined in `index.css` (`:root` for light, `.dark` for dark) with semantic Tailwind tokens in `tailwind.config.js`. The `useTheme` hook toggles the `.dark` class on `<html>` with localStorage persistence.

Key semantic classes: `bg-surface`, `text-content`, `border-border`, `bg-input`, `bg-hover`, `bg-overlay`. The sidebar uses hardcoded Tailwind grays with `dark:` prefixes (always dark-themed). All input fields must include `bg-input` for dark mode.

### Transfers
Transfers are linked transaction pairs connected via `transfer_link_id` (circular self-referential FK on transactions table). Deleting either side requires nullifying both `transfer_link_id` values and flushing before deletion to avoid `CircularDependencyError`.

### Import Pipeline
CSV and QFX/OFX imports flow through: file parse → preview (with duplicate detection) → commit. QFX files use FITID stored in `external_id` for dedup. The `import_service.py` handles both formats.

### Category Dropdowns
Categories support parent/child nesting. All category `<select>` elements should use `<optgroup>` with parent categories as group labels and children nested inside, matching the Ledger pattern.
