# AI Wealth Planner (FastAPI + React/Vite)

MVP app that collects a user’s financial snapshot (cash, stocks, loans) and uses NVIDIA NGC LLM (`backend/ngc_llm.py`) to generate a step-by-step wealth plan.

## Prereqs
- Python 3.10+ (tested with Python 3.13)
- Node.js 18+

## Backend (FastAPI)

### 1) Configure env
Dotfiles are blocked in this environment, so we use `env.example` files. Create your real `.env` manually from it:
- Copy `backend/env.example` → `backend/.env`
- Set `NGC_API_KEY` and optionally `NGC_DEFAULT_MODEL`

### 2) Install deps
From repo root:

```bash
python -m pip install -r backend/requirements.txt
```

### 3) Run
From repo root:

```bash
python -m uvicorn backend.app.main:app --reload --port 8000
```

Health check: `GET /api/health`

## Frontend (React + Vite)

### 1) Configure env (optional)
- Copy `frontend/env.example` → `frontend/.env`
- Set `VITE_API_BASE_URL` (defaults to `http://localhost:8000`)

### 2) Install deps

```bash
cd frontend
npm install
```

### 3) Run

```bash
npm run dev
```

Open `http://localhost:5173`.

## App flow
1. Go to **Mock Sign In** and enter optional name/email.
2. Go to **Planner**, enter cash/stocks and your loans.
3. Click **Generate Plan**.

The backend persists profiles/plans to SQLite under `backend/data/app.db` by default.


