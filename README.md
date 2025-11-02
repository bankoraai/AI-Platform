# OpenBank AI

OpenBank AI is a next‑generation AI financial intelligence system that securely connects to your bank accounts via open-banking APIs (PSD2) and provides actionable insights on your financial health.

It works for individuals and businesses, helping optimize cash flow, reduce fees, manage debts, and invest surplus funds intelligently.

This repository contains both the backend (Python/FastAPI) and frontend (React + Vite) applications:

- `backend/` FastAPI service, PSD2 (Poalim) OAuth2 integration scaffolding, insights engine, and mock data mode
- `frontend/` React app for connecting accounts, viewing accounts/transactions, and insights dashboard

## Quick start

Prerequisites:
- Node.js 18+ and npm
- Python 3.10+

1) Backend

```
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows PowerShell
pip install -r requirements.txt
python backend.py
```

2) Frontend (in a separate terminal)

```
cd frontend
npm install
npm run dev -- --port 5173
```

Open the app at http://localhost:5173

By default, the backend allows CORS from `http://localhost:5173`. Change via `FRONTEND_URL` env.

## PSD2 (Poalim) integration

This project includes a ready OAuth2 Authorization Code flow scaffold for Bank Hapoalim PSD2 (via `poalimdev`). You will need to register a client and obtain credentials in the Poalim developer portal.

Configure these in environment variables (see names below). The backend also supports a `.env` file placed under `backend/`.
- `POALIM_CLIENT_ID`
- `POALIM_CLIENT_SECRET`
- `POALIM_REDIRECT_URI` (e.g., `http://localhost:8000/api/auth/callback`)
- `POALIM_AUTHORIZATION_URL`
- `POALIM_TOKEN_URL`
- `POALIM_API_BASE_URL` or `POALIM_ACCOUNTS_ENDPOINT`

Notes:
- Some PSD2 environments require mTLS and/or signed requests. The client in `app/bank/poalim_client.py` supports optional client certificates if provided via environment variables.
- A `DEMO_MODE` is available to run without real bank credentials. When enabled, endpoints return deterministic mock data so you can explore the UI and insights.

## Structure

```
backend/
  app/
    bank/poalim_client.py
    routers/{auth,accounts}.py
    session.py
    config.py
    main.py
  backend.py
  requirements.txt

frontend/
  src/
    lib/api.ts
    main.tsx
    App.tsx
  package.json
  vite.config.ts
  tsconfig.json
  index.html
```

## Common scripts

Backend:
- Run dev: `cd backend && python backend.py` (env: `HOST`, `PORT`, `RELOAD`)

Frontend:
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## Security

- Never commit real credentials. Use `.env` files locally and secret managers in production.
- For real PSD2 usage, ensure HTTPS, mTLS if required, and secure token storage.

## License

MIT
