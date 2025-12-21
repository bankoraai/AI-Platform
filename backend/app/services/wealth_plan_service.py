from __future__ import annotations

import json
import hashlib
from dataclasses import dataclass
import logging

from ..models.financial_profile import FinancialProfile
from ..repositories.plans import PlanRepository
from .ngc_provider import NGCProvider
from ..logging_config import Timer, should_log_payloads, redact

logger = logging.getLogger(__name__)


def _sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def _extract_json_object(text: str) -> str | None:
    """Best-effort extraction of the first JSON object from model output."""
    if not text:
        return None
    s = text.strip()
    # Remove common ```json fences
    if s.startswith("```"):
        s = s.strip("`").strip()
        if s.lower().startswith("json"):
            s = s[4:].strip()
    # Fast path: already JSON
    if s.startswith("{") and s.endswith("}"):
        return s
    # Best-effort: find first '{' and last '}' and try that slice.
    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end != -1 and end > start:
        return s[start : end + 1]
    return None

def _json_compact(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


@dataclass
class WealthPlanService:
    ngc: NGCProvider
    plan_repo: PlanRepository

    def _build_prompt(self, profile: FinancialProfile, *, currency_code: str) -> str:
        loans_text = "\n".join(
            [
                f"- {ln.name}: balance={ln.balance:.2f}, apr_percent={ln.apr_percent:.2f}, min_payment={ln.minimum_payment:.2f}"
                + (f", term_months={ln.term_months}" if ln.term_months is not None else "")
                for ln in (profile.loans or [])
            ]
        )
        if not loans_text:
            loans_text = "- (none)"

        return (
            f"Currency: {currency_code}. All amounts are in {currency_code}. Present outputs in {currency_code}.\n\n"
            "User financial snapshot:\n"
            f"- Cash available: {profile.cash_available:.2f}\n"
            f"- Total stock investments: {profile.stocks_total:.2f}\n"
            "Loans:\n"
            f"{loans_text}\n\n"
            "Task:\n"
            "Create a detailed, step-by-step plan to increase net worth and reach financial independence.\n"
            "Be pragmatic and conservative; state assumptions. Do NOT claim guaranteed returns.\n\n"
            "Return STRICT JSON ONLY (no markdown, no commentary, no code fences). Schema:\n"
            "{\n"
            '  "meta": {\n'
            f'    "currency": "{currency_code}",\n'
            '    "title": "Financial Independence Plan",\n'
            '    "assumptions": ["..."],\n'
            '    "notes": ["..."]\n'
            "  },\n"
            '  "summary": {\n'
            '    "bullets": ["..."],\n'
            '    "next_action": "...",\n'
            '    "biggest_risk": "..." \n'
            "  },\n"
            '  "immediate_next_7_days": {"steps": ["..."]},\n'
            '  "timeline_0_3_months": {"milestones": ["..."]},\n'
            '  "timeline_3_12_months": {"milestones": ["..."]},\n'
            '  "debt_strategy": {"prioritization": ["..."], "payoff_notes": ["..."]},\n'
            '  "investing_strategy": {"bullets": ["..."]},\n'
            '  "risks": {"bullets": ["..."]},\n'
            '  "disclaimer": "..." \n'
            "}\n"
        )

    def _build_regen_prompt(
        self,
        profile: FinancialProfile,
        *,
        currency_code: str,
        previous_plan_json: dict | None,
        completed_tasks: list[str],
        pending_tasks: list[str],
        deltas: dict,
    ) -> str:
        base = self._build_prompt(profile, currency_code=currency_code)
        prev_json_str = json.dumps(previous_plan_json or {}, ensure_ascii=False, separators=(",", ":"))
        completed_text = "\n".join([f"- {t}" for t in (completed_tasks or [])]) or "- (none)"
        pending_text = "\n".join([f"- {t}" for t in (pending_tasks or [])]) or "- (none)"
        deltas_str = json.dumps(deltas or {}, ensure_ascii=False, separators=(",", ":"))
        return (
            base
            + "\nProgress context (monthly check-in):\n"
            + f"- deltas: {deltas_str}\n"
            + "Completed tasks:\n"
            + f"{completed_text}\n"
            + "Pending tasks:\n"
            + f"{pending_text}\n\n"
            + "Previous plan (structured JSON):\n"
            + f"{prev_json_str}\n\n"
            + "Update the plan for the next month based on the progress and deltas. "
            + "Keep it realistic and aligned to the user's new balances. "
            + "Return STRICT JSON only using the same schema.\n"
        )

    def generate_and_persist(self, *, session, profile: FinancialProfile, currency_code: str):
        system = (
            "You are a careful personal finance planner. Provide clear steps and timelines. "
            "Ask for missing data only if critical; otherwise proceed with stated assumptions."
        )
        currency = (currency_code or "USD").strip().upper()
        logger.info("plan.generate start profile_id=%s currency=%s loans=%s", profile.id, currency, len(profile.loans or []))
        user_prompt = self._build_prompt(profile, currency_code=currency)
        prompt_hash = _sha256_hex(system + "\n\n" + user_prompt)

        if should_log_payloads():
            logger.debug("plan.prompt system=%s", system)
            logger.debug("plan.prompt user=%s", user_prompt)
        else:
            logger.debug("plan.prompt system=%s", redact(system, keep=0))
            logger.debug("plan.prompt user=%s", redact(user_prompt, keep=0))

        t = Timer()
        resp = self.ngc.chat(system=system, user=user_prompt, max_tokens=2200, temperature=0.2)
        try:
            plan_text = resp["choices"][0]["message"]["content"]
        except Exception:
            plan_text = str(resp)
        logger.info("plan.generate llm_done dur_ms=%.1f chars=%s", t.ms(), len(plan_text or ""))

        plan_json_str: str | None = None
        extracted = _extract_json_object(plan_text)
        if extracted:
            try:
                parsed = json.loads(extracted)
                if isinstance(parsed, dict):
                    plan_json_str = _json_compact(parsed)
                    logger.info("plan.json parsed ok")
            except Exception:
                plan_json_str = None
                logger.warning("plan.json parse_failed initial_extraction")

        # Repair pass: if model returned almost-JSON, ask it to fix to strict JSON.
        if plan_json_str is None:
            repair_system = "You are a JSON formatter. Output STRICT JSON only. No markdown. No commentary."
            repair_user = (
                "Fix the following content into a single valid JSON object that matches the previously requested schema. "
                "Output only JSON.\n\n"
                f"{plan_text}"
            )
            try:
                repair_t = Timer()
                repair_resp = self.ngc.chat(system=repair_system, user=repair_user, max_tokens=2200, temperature=0.0)
                repaired_text = repair_resp["choices"][0]["message"]["content"]
                extracted2 = _extract_json_object(repaired_text) or repaired_text
                parsed2 = json.loads(extracted2)
                if isinstance(parsed2, dict):
                    plan_json_str = _json_compact(parsed2)
                    logger.info("plan.json repair_ok dur_ms=%.1f", repair_t.ms())
            except Exception:
                plan_json_str = None
                logger.warning("plan.json repair_failed")

        plan = self.plan_repo.create(
            session,
            profile_id=profile.id,
            model_used=self.ngc.default_model,
            prompt_hash=prompt_hash,
            plan_text=plan_text,
            plan_json=plan_json_str,
        )
        logger.info("plan.persisted plan_id=%s has_json=%s", plan.id, bool(plan_json_str))
        return plan

    def regenerate_from_progress(
        self,
        *,
        session,
        profile: FinancialProfile,
        currency_code: str,
        parent_plan_id: int | None,
        previous_plan_json: dict | None,
        completed_tasks: list[str],
        pending_tasks: list[str],
        deltas: dict,
    ):
        system = (
            "You are a careful personal finance planner. Provide clear steps and timelines. "
            "Ask for missing data only if critical; otherwise proceed with stated assumptions."
        )
        currency = (currency_code or "USD").strip().upper()
        logger.info("plan.regen start profile_id=%s currency=%s parent_plan_id=%s", profile.id, currency, parent_plan_id)
        user_prompt = self._build_regen_prompt(
            profile,
            currency_code=currency,
            previous_plan_json=previous_plan_json,
            completed_tasks=completed_tasks,
            pending_tasks=pending_tasks,
            deltas=deltas,
        )
        prompt_hash = _sha256_hex(system + "\n\n" + user_prompt)

        if should_log_payloads():
            logger.debug("plan.regen.prompt system=%s", system)
            logger.debug("plan.regen.prompt user=%s", user_prompt)
        else:
            logger.debug("plan.regen.prompt system=%s", redact(system, keep=0))
            logger.debug("plan.regen.prompt user=%s", redact(user_prompt, keep=0))

        t = Timer()
        resp = self.ngc.chat(system=system, user=user_prompt, max_tokens=2200, temperature=0.2)
        try:
            plan_text = resp["choices"][0]["message"]["content"]
        except Exception:
            plan_text = str(resp)
        logger.info("plan.regen llm_done dur_ms=%.1f chars=%s", t.ms(), len(plan_text or ""))

        plan_json_str: str | None = None
        extracted = _extract_json_object(plan_text)
        if extracted:
            try:
                parsed = json.loads(extracted)
                if isinstance(parsed, dict):
                    plan_json_str = _json_compact(parsed)
                    logger.info("plan.regen.json parsed ok")
            except Exception:
                plan_json_str = None
                logger.warning("plan.regen.json parse_failed initial_extraction")

        if plan_json_str is None:
            repair_system = "You are a JSON formatter. Output STRICT JSON only. No markdown. No commentary."
            repair_user = (
                "Fix the following content into a single valid JSON object that matches the previously requested schema. "
                "Output only JSON.\n\n"
                f"{plan_text}"
            )
            try:
                repair_t = Timer()
                repair_resp = self.ngc.chat(system=repair_system, user=repair_user, max_tokens=2200, temperature=0.0)
                repaired_text = repair_resp["choices"][0]["message"]["content"]
                extracted2 = _extract_json_object(repaired_text) or repaired_text
                parsed2 = json.loads(extracted2)
                if isinstance(parsed2, dict):
                    plan_json_str = _json_compact(parsed2)
                    logger.info("plan.regen.json repair_ok dur_ms=%.1f", repair_t.ms())
            except Exception:
                plan_json_str = None
                logger.warning("plan.regen.json repair_failed")

        plan = self.plan_repo.create(
            session,
            profile_id=profile.id,
            parent_plan_id=parent_plan_id,
            model_used=self.ngc.default_model,
            prompt_hash=prompt_hash,
            plan_text=plan_text,
            plan_json=plan_json_str,
        )
        logger.info("plan.regen.persisted plan_id=%s parent_plan_id=%s has_json=%s", plan.id, parent_plan_id, bool(plan_json_str))
        return plan


