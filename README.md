# Personal Finance Ledger (Local-First)

A local-first, single-user personal finance app. The backend is a Python/FastAPI server that serves a local web UI. The frontend is a React SPA that can be built and served by the backend.

## Features (MVP scope)
- CSV/QFX import with preview, mapping, and duplicate detection
- Monthly ledger view with running balance
- Categorization and rules
- Forecasting via recurring templates
- Linked transfers between accounts
- Reports by month/category/payee

## Repo Layout
- `backend/` Python FastAPI backend
- `frontend/` React frontend (Vite)
- `PROJECT.md` Product brief and design decisions

## Requirements
- Python 3.11+ (recommended)
- Node.js 18+ and npm
- SQLite (bundled with Python)

## Quick Start (Local)

### 1) Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py
```

This starts the server on `http://127.0.0.1:8000` and prints a URL + QR code.

### 2) Frontend (one-time build for backend-served UI)
```bash
cd frontend
npm install
npm run build
```

After building, restart the backend so it can serve the built UI from `frontend/dist`:
```bash
cd ../backend
python run.py
```

Then open:
```
http://127.0.0.1:8000/
```

### Frontend Dev Mode (optional)
Use this when actively developing the UI. It runs a dev server on `5173`.
```bash
cd frontend
npm run dev
```
Open:
```
http://127.0.0.1:5173/
```

## Notes
- The backend serves the frontend only if `frontend/dist` exists.
- For remote use via SSH port forwarding, forwarding only `8000` is sufficient when using the built frontend.

## Troubleshooting
- `{"detail":"Not Found"}` at `/` means the frontend build is missing. Run `npm run build` in `frontend/` and restart the backend.

## Roadmap
See `PROJECT.md` for the full brief, decisions, and remaining tasks.
