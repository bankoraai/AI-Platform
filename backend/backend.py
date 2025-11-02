import os
from pathlib import Path
import asyncio
import webbrowser
from threading import Timer

from flask import Flask, jsonify, request, redirect
from dotenv import load_dotenv
import httpx
import yaml
from flask_cors import CORS

# Load .env from project root and backend folder (do this BEFORE importing settings)
load_dotenv()
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=False)

from app.config import settings
from app.bank.poalim_client import PoalimPSD2Client
from app.session import create_session, get_session


app = Flask(__name__)
CORS(
	app,
	resources={r"/api/*": {"origins": [settings.frontend_url]}},
	supports_credentials=True,
)


_BOI_DEFAULTS: dict[str, str] = {}


def _init_boi_defaults() -> None:
	"""Load defaults from BOI_NextGenPSD2_v1.7.yaml (server url -> base/v1)."""
	global _BOI_DEFAULTS
	try:
		from pathlib import Path
		yaml_path = Path(__file__).resolve().parent / "BOI_NextGenPSD2_v1.7.yaml"
		if not yaml_path.exists():
			_BOI_DEFAULTS = {}
			return
		with open(yaml_path, "r", encoding="utf-8") as f:
			spec = yaml.safe_load(f)
		servers = spec.get("servers") or []
		server_url = ""
		if isinstance(servers, list) and servers:
			first = servers[0] or {}
			server_url = (first.get("url") or "").rstrip("/")
		api_base_url = server_url
		accounts_endpoint = f"{api_base_url}/v1/accounts" if api_base_url else ""
		_BOI_DEFAULTS = {
			"api_base_url": api_base_url,
			"accounts_endpoint": accounts_endpoint,
		}
	except Exception:
		# Best-effort; keep defaults empty on any failure
		_BOI_DEFAULTS = {}


_init_boi_defaults()

STATE_COOKIE = "oauth_state"
SESSION_COOKIE = "session_id"


@app.get("/health")
def health():
	return jsonify({"status": "ok"})


@app.get("/api/settings/poalim")
def get_poalim_settings():
	"""Return current Poalim OAuth settings (masking secret)."""
	api_base_url = (settings.poalim_api_base_url or _BOI_DEFAULTS.get("api_base_url") or "")
	accounts_endpoint = (
		settings.poalim_accounts_endpoint
		or (f"{api_base_url.rstrip('/')}/v1/accounts" if api_base_url else "")
		or _BOI_DEFAULTS.get("accounts_endpoint")
		or ""
	)
	return jsonify({
		"client_id": settings.poalim_client_id or "",
		"has_client_secret": bool(settings.poalim_client_secret),
		"redirect_uri": settings.poalim_redirect_uri,
		"authorization_url": settings.poalim_authorization_url or "",
		"token_url": settings.poalim_token_url or "",
		"api_base_url": api_base_url,
		"accounts_endpoint": accounts_endpoint,
		"demo_mode": settings.demo_mode,
	})


def _upsert_env_vars(vars_to_set: dict[str, str], env_path: str = ".env") -> None:
	"""Simple .env upsert to persist settings if requested."""
	try:
		lines: list[str] = []
		existing: dict[str, int] = {}
		try:
			with open(env_path, "r", encoding="utf-8") as f:
				lines = f.read().splitlines()
			for idx, line in enumerate(lines):
				if not line or line.strip().startswith("#") or "=" not in line:
					continue
				key = line.split("=", 1)[0].strip()
				existing[key] = idx
		except FileNotFoundError:
			lines = []

		for k, v in vars_to_set.items():
			entry = f"{k}={v}"
			if k in existing:
				lines[existing[k]] = entry
			else:
				lines.append(entry)

		with open(env_path, "w", encoding="utf-8") as f:
			f.write("\n".join(lines) + ("\n" if lines else ""))
	except Exception:
		# Best-effort persistence; ignore errors to not break runtime update
		pass


@app.post("/api/settings/poalim")
def update_poalim_settings():
	"""Update Poalim client id/secret (optionally persist to .env)."""
	data = request.get_json(silent=True) or {}
	client_id = (data.get("client_id") or "").strip()
	client_secret = (data.get("client_secret") or "").strip()
	persist = bool(data.get("persist"))

	# Allow updating any subset of fields, not only credentials
	provided_fields = {
		k: v for k, v in data.items()
		if k in {
			"client_id",
			"client_secret",
			"poalim_redirect_uri",
			"poalim_authorization_url",
			"poalim_token_url",
			"poalim_api_base_url",
			"poalim_accounts_endpoint",
			"demo_mode",
		}
	}
	if not provided_fields:
		return jsonify({"detail": "No settings provided"}), 400

	if client_id:
		settings.poalim_client_id = client_id
	if client_secret:
		settings.poalim_client_secret = client_secret

	# Optional other fields if provided
	for field in [
		"poalim_redirect_uri",
		"poalim_authorization_url",
		"poalim_token_url",
		"poalim_api_base_url",
		"poalim_accounts_endpoint",
	]:
		if field in data and isinstance(data.get(field), str):
			setattr(settings, field, data[field].strip())

	# If credentials are provided, disable demo_mode automatically unless explicitly set
	if (client_id or client_secret) and "demo_mode" not in data:
		settings.demo_mode = False

	if isinstance(data.get("demo_mode"), bool):
		settings.demo_mode = bool(data.get("demo_mode"))

	if persist:
		to_persist: dict[str, str] = {}
		if client_id:
			to_persist["POALIM_CLIENT_ID"] = client_id
		if client_secret:
			to_persist["POALIM_CLIENT_SECRET"] = client_secret
		if "poalim_redirect_uri" in data:
			to_persist["POALIM_REDIRECT_URI"] = settings.poalim_redirect_uri
		if "poalim_authorization_url" in data:
			to_persist["POALIM_AUTHORIZATION_URL"] = settings.poalim_authorization_url or ""
		if "poalim_token_url" in data:
			to_persist["POALIM_TOKEN_URL"] = settings.poalim_token_url or ""
		if "poalim_api_base_url" in data:
			to_persist["POALIM_API_BASE_URL"] = settings.poalim_api_base_url or ""
		if "poalim_accounts_endpoint" in data:
			to_persist["POALIM_ACCOUNTS_ENDPOINT"] = settings.poalim_accounts_endpoint or ""
		to_persist["DEMO_MODE"] = "false" if not settings.demo_mode else "true"
		_upsert_env_vars(to_persist)

	return jsonify({
		"client_id": settings.poalim_client_id or "",
		"has_client_secret": bool(settings.poalim_client_secret),
		"demo_mode": settings.demo_mode,
	})

@app.get("/api/auth/login")
def login():
	import secrets
	# In demo mode, skip real OAuth and create a demo session
	if settings.demo_mode:
		session_id = create_session({"token": {"access_token": "demo", "token_type": "bearer"}})
		resp = redirect(f"{settings.frontend_url}/", code=302)
		resp.set_cookie(
			key=SESSION_COOKIE,
			value=session_id,
			httponly=True,
			samesite="Lax",
			secure=False,
			path="/",
		)
		return resp

	client = PoalimPSD2Client()
	state = secrets.token_urlsafe(16)
	auth_url = client.get_authorization_url(state)
	resp = redirect(auth_url, code=302)
	resp.set_cookie(
		key=STATE_COOKIE,
		value=state,
		httponly=True,
		samesite="Lax",
		secure=False,
		path="/",
	)
	return resp


@app.get("/api/auth/callback")
def callback():
	code = request.args.get("code")
	state = request.args.get("state")
	if not code or not state:
		return jsonify({"detail": "Missing code or state"}), 400
	state_cookie = request.cookies.get(STATE_COOKIE)
	if not state_cookie or state_cookie != state:
		return jsonify({"detail": "Invalid state"}), 400

	client = PoalimPSD2Client()
	try:
		token = asyncio.run(client.exchange_code_for_token(code))
	except Exception as exc:  # noqa: BLE001
		return jsonify({"detail": str(exc)}), 500

	session_id = create_session({"token": token})
	resp = redirect(f"{settings.frontend_url}/", code=302)
	resp.delete_cookie(STATE_COOKIE, path="/")
	resp.set_cookie(
		key=SESSION_COOKIE,
		value=session_id,
		httponly=True,
		samesite="Lax",
		secure=False,
		path="/",
	)
	return resp


@app.get("/api/accounts")
def list_accounts():
	if settings.demo_mode:
		return jsonify({
			"accounts": [
				{"id": "ACC-001", "name": "Checking", "iban": "IL12 1234 5678 9012", "balance": 12453.75, "currency": "ILS"},
				{"id": "ACC-002", "name": "Savings", "iban": "IL98 7654 3210 9876", "balance": 50234.10, "currency": "ILS"},
			]
		})

	session_id = request.cookies.get(SESSION_COOKIE)
	if not session_id:
		return jsonify({"detail": "Not authenticated"}), 401

	session = get_session(session_id)
	if not session:
		return jsonify({"detail": "Session expired"}), 401

	token = session.get("token") or {}
	access_token = token.get("access_token")
	if not access_token:
		return jsonify({"detail": "Missing access token"}), 401

	client = PoalimPSD2Client()
	try:
		data = asyncio.run(client.get_accounts(access_token))
	except Exception as exc:  # noqa: BLE001
		return jsonify({"detail": str(exc)}), 500

	accounts = data.get("accounts") if isinstance(data, dict) else data
	return jsonify({"accounts": accounts})


@app.post("/api/insights/ai")
def generate_ai_insights():
	"""Generate futuristic insights via NVIDIA NGC LLM from provided mock data."""
	api_key = settings.ngc_api_key or os.getenv("NGC_API_KEY")
	if not api_key:
		return jsonify({"detail": "NGC_API_KEY not configured"}), 400

	body = request.get_json(silent=True) or {}
	balances = body.get("balances") or []
	savings = body.get("savings") or []
	loans = body.get("loans") or []
	monthly_expenses = float(body.get("monthly_expenses") or 0)
	completed_actions = body.get("completed_actions") or []
	step_index = body.get("step")
	notes = (body.get("notes") or "").strip()

	# Compose a concise prompt with structure but creative, visionary tone
	context = {
		"monthly_expenses": monthly_expenses,
		"balances": balances,
		"savings": savings,
		"loans": loans,
		"completed_actions": completed_actions,
		"step_index": step_index,
		"notes": notes,
	}

	system_msg = (
		"You are a visionary personal finance strategist in 2030."
		" Be crisp, numeric, and actionable. Format strictly with markdown sections so a UI can parse."
	)
	user_msg = (
		"Using the snapshot below, output EXACTLY these sections in markdown (no preface, no epilogue):\n\n"
		"# Financial Posture\n"
		"- 2-4 bullets summarizing current state (cash, savings, debt, runway).\n\n"
		"## Top Action Plan\n"
		"A markdown table with columns: | Action | Amount | Date Horizon | Expected Impact | and 3-6 rows.\n\n"
		"## Risk Early Warnings\n"
		"- 2-5 bullets of risks to watch.\n\n"
		"## Optional Automations\n"
		"A markdown table with columns: | Automation | Frequency | Setup | and 2-4 rows.\n\n"
		"Rules: Use currency symbols or 'ILS', show months/years in horizons, and quantify impacts (e.g., interest saved/year)."
		" Do NOT use inline bold (** **), italics (* *), or backticks. Keep pure text in cells and bullets."
		" Focus on emergency fund sizing, high-APR debt payoff, and yield optimization.\n\n"
		"When generating the plan, consider any completed actions and the current step index if provided."
		" If notes are present, incorporate them.\n\n"
		f"DATA:\n{context}"
	)

	payload = {
		"model": "nvidia/llama-3.3-nemotron-super-49b-v1",
		"messages": [
			{"role": "system", "content": system_msg},
			{"role": "user", "content": user_msg},
		],
		"temperature": 0.65,
		"top_p": 0.95,
		"max_tokens": 1200,
	}

	headers = {
		"Authorization": f"Bearer {api_key}",
		"Content-Type": "application/json",
	}

	try:
		with httpx.Client(timeout=60.0) as client:
			resp = client.post("https://integrate.api.nvidia.com/v1/chat/completions", headers=headers, json=payload)
			resp.raise_for_status()
			data = resp.json()
			content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
			return jsonify({"analysis": content})
	except httpx.HTTPError as exc:  # noqa: BLE001
		return jsonify({"detail": f"NGC request failed: {exc}"}), 502


@app.post("/api/insights/simulate")
def simulate_insight_action():
    """Simulate the impact of an AI-suggested action over a time horizon.

    Request body:
    - balances, savings, loans: current snapshot (demo-mode shapes)
    - suggestion: { action, amount?, horizon?, impact? }
    - months: int (default 24)
    - notes: optional string

    Response:
    {
      "series": { "months": [...], "cash": [...], "savings": [...], "debt": [...], "net": [...] },
      "narrative": str
    }
    """
    body = request.get_json(silent=True) or {}
    balances = body.get("balances") or []
    savings = body.get("savings") or []
    loans = body.get("loans") or []
    suggestion = body.get("suggestion") or {}
    months = int(body.get("months") or 24)
    notes = (body.get("notes") or "").strip()

    # Aggregate snapshot
    total_cash = float(sum([(b.get("available") or b.get("current") or 0) for b in balances]))
    total_savings = float(sum([s.get("balance") or 0 for s in savings]))
    total_debt = float(sum([l.get("outstanding") or 0 for l in loans]))

    # Heuristics from suggestion
    action_text = (suggestion.get("action") or "").lower()
    amount_text = (suggestion.get("amount") or "").lower()
    horizon_text = (suggestion.get("horizon") or "").lower()

    def _parse_amount(text: str) -> float:
        import re
        m = re.search(r"([\d,]+(?:\.\d+)?)", text or "")
        if not m:
            return 0.0
        try:
            return float(m.group(1).replace(",", ""))
        except Exception:
            return 0.0

    nominal = _parse_amount(amount_text)
    # Decide action type
    is_debt_pay = any(k in action_text for k in ["pay", "debt", "loan", "credit"])
    is_move_to_savings = any(k in action_text for k in ["save", "savings", "move", "deposit"]) and not is_debt_pay
    is_invest = any(k in action_text for k in ["invest", "fund", "etf", "portfolio"]) and not is_debt_pay

    # Monthly effect
    monthly_extra = nominal
    if "per month" not in amount_text and "monthly" not in amount_text and nominal > 0:
        # If not explicitly monthly, spread over horizon if specified
        import re
        hm = re.search(r"(\d+)\s*(?:mo|month|months|yr|year|years)", horizon_text)
        if hm:
            span = max(1, int(hm.group(1)))
            monthly_extra = nominal / span
        else:
            monthly_extra = nominal / max(1, min(12, months))

    # Basic simulation
    m = max(1, months)
    series_months = list(range(m + 1))
    cash = [total_cash]
    sv = [total_savings]
    debt = [total_debt]
    net = [total_cash + total_savings - total_debt]

    # Simple APR assumptions
    avg_savings_apr = 0.012  # 1.2%/yr
    avg_debt_apr = 0.06      # 6%/yr
    monthly_sav_r = avg_savings_apr / 12.0
    monthly_debt_r = avg_debt_apr / 12.0

    for i in range(1, m + 1):
        prev_cash = cash[-1]
        prev_sv = sv[-1]
        prev_debt = debt[-1]

        c = prev_cash
        s = prev_sv
        d = max(0.0, prev_debt * (1 + monthly_debt_r))

        if is_debt_pay and monthly_extra > 0:
            pay = min(monthly_extra, c + s, d)
            # Use cash first, then savings
            use_cash = min(c, pay)
            c -= use_cash
            rem = pay - use_cash
            if rem > 0:
                take_sv = min(s, rem)
                s -= take_sv
            d = max(0.0, d - pay)
        elif is_move_to_savings and monthly_extra > 0:
            move = min(monthly_extra, c)
            c -= move
            s += move
        elif is_invest and monthly_extra > 0:
            # Treat as higher-yield savings proxy
            move = min(monthly_extra, c)
            c -= move
            s += move * 1.0

        # Accrue interest
        s *= (1 + monthly_sav_r)

        cash.append(c)
        sv.append(s)
        debt.append(d)
        net.append(c + s - d)

    # Build narrative (AI if available)
    narrative = ""
    api_key = settings.ngc_api_key or os.getenv("NGC_API_KEY")
    if api_key:
        try:
            sys_msg = (
                "You are a concise finance simulator. Summarize the simulated outcome in 5-8 bullets. "
                "Quantify key metrics (interest saved, runway change, net improvement)."
            )
            user_msg = (
                f"ACTION: {suggestion}\nMONTHS: {months}\n"
                f"START: cash={int(total_cash)}, savings={int(total_savings)}, debt={int(total_debt)}\n"
                f"END: cash={int(cash[-1])}, savings={int(sv[-1])}, debt={int(debt[-1])}, net={int(net[-1])}\n"
                f"NOTES: {notes}"
            )
            payload = {
                "model": "nvidia/llama-3.3-nemotron-super-49b-v1",
                "messages": [
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.5,
                "max_tokens": 600,
            }
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            with httpx.Client(timeout=45.0) as client:
                resp = client.post("https://integrate.api.nvidia.com/v1/chat/completions", headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                narrative = (data.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
        except Exception:
            narrative = "Applying the action improves your net position over time."
    else:
        narrative = (
            "Simulation summary:\n"
            f"- Net changes from {int(net[0])} to {int(net[-1])} over {months} months.\n"
            f"- Cash: {int(cash[0])} → {int(cash[-1])}, Savings: {int(sv[0])} → {int(sv[-1])}.\n"
            f"- Debt: {int(debt[0])} → {int(debt[-1])}.\n"
            "- This is a simplified projection using average rates."
        )

    return jsonify({
        "series": {
            "months": series_months,
            "cash": cash,
            "savings": sv,
            "debt": debt,
            "net": net,
        },
        "narrative": narrative,
    })


def main() -> None:
	# Run from current working directory to keep Flask reloader paths correct

	host = os.getenv("HOST", "0.0.0.0")
	port = int(os.getenv("PORT", "8000"))
	reload = os.getenv("RELOAD", "true").lower() in {"1", "true", "yes"}

	print(f"Starting OpenBank AI backend (Flask) on {host}:{port} (reload={reload})...")

	# Open the frontend in the default browser once the server is ready.
	# Avoid double-opening when the Flask reloader spawns a child process.
	should_open = True
	if reload:
		should_open = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
	if should_open and settings.frontend_url:
		Timer(1.0, lambda: webbrowser.open(settings.frontend_url)).start()

	app.run(host=host, port=port, debug=reload)


if __name__ == "__main__":
	main()
