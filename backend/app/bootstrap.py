from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from apscheduler.schedulers.background import BackgroundScheduler
from pywebpush import WebPushException

from .config import Settings, load_settings
from .db import Base, create_db_engine, create_session_factory
from .logging_config import configure_logging
from . import models  # noqa: F401
from .middleware.options_passthrough import BareOptionsPassthroughMiddleware
from .repositories.profiles import FinancialProfileRepository
from .services.push_service import PushConfig, PushService
from .repositories.push_subscriptions import PushSubscriptionRepository
from .repositories.tasks import PlanTaskRepository


def bootstrap_settings() -> Settings:
    # Load .env from repo root (or current working dir) if present.
    load_dotenv(override=False)
    return load_settings()


def bootstrap_logging() -> None:
    configure_logging()


def bootstrap_database(settings: Settings):
    # Ensure backend/data exists for default sqlite path.
    try:
        backend_dir = Path(__file__).resolve().parents[1]  # backend/
        (backend_dir / "data").mkdir(parents=True, exist_ok=True)
    except Exception:
        # Non-fatal; DB init may still work if path is elsewhere.
        pass

    engine = create_db_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    return engine, session_factory


def _sqlite_add_column_if_missing(engine, *, table: str, column: str, ddl_type: str, default_sql: str):
    """Very small SQLite migration helper (no Alembic in this repo)."""
    if not str(engine.url).startswith("sqlite:"):
        return
    with engine.begin() as conn:
        cols = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        existing = {row[1] for row in cols}  # row[1] = name
        if column in existing:
            return
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type} DEFAULT {default_sql}"))


def bootstrap_app() -> FastAPI:
    bootstrap_logging()
    settings = bootstrap_settings()
    engine, session_factory = bootstrap_database(settings)

    app = FastAPI(title="AI Wealth Planner API")
    app.state.settings = settings
    app.state.db_engine = engine
    app.state.db_session_factory = session_factory
    app.state.scheduler = None

    # Handle manual/invalid OPTIONS requests gracefully (before CORS middleware).
    # Middleware execution is in reverse order of addition in Starlette,
    # so adding this AFTER CORS would run first. We want CORS to handle
    # real preflights, so we add this BEFORE CORS and only short-circuit
    # bare OPTIONS without preflight headers.
    app.add_middleware(BareOptionsPassthroughMiddleware)

    # CORS for Vite dev server
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins or ["http://localhost:5173"],
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Create tables (models will be added in later todo; safe if empty).
    Base.metadata.create_all(bind=engine)
    # Lightweight SQLite migration(s)
    _sqlite_add_column_if_missing(engine, table="users", column="preferred_currency", ddl_type="VARCHAR(3)", default_sql="'USD'")
    _sqlite_add_column_if_missing(
        engine, table="financial_profiles", column="currency_code", ddl_type="VARCHAR(3)", default_sql="'USD'"
    )
    _sqlite_add_column_if_missing(engine, table="generated_plans", column="plan_json", ddl_type="TEXT", default_sql="NULL")
    _sqlite_add_column_if_missing(engine, table="generated_plans", column="parent_plan_id", ddl_type="INTEGER", default_sql="NULL")

    def start_scheduler():
        cfg = PushConfig(
            vapid_public_key=settings.vapid_public_key,
            vapid_private_key=settings.vapid_private_key,
            vapid_subject=settings.vapid_subject,
        )
        if not cfg.enabled():
            return
        push = PushService(cfg)
        tasks_repo = PlanTaskRepository()
        subs_repo = PushSubscriptionRepository()
        profile_repo = FinancialProfileRepository()

        def tick():
            # Runs in a thread; create a session manually.
            session = session_factory()
            try:
                now = datetime.utcnow()
                # Find tasks that should be reminded.
                stmt_tasks = (
                    select(models.PlanTask)
                    .where(models.PlanTask.completed_at.is_(None))
                    .where(models.PlanTask.remind_at.is_not(None))
                    .where(models.PlanTask.remind_at <= now)
                    .where(models.PlanTask.reminder_state != "disabled")
                    .order_by(models.PlanTask.remind_at.asc(), models.PlanTask.id.asc())
                    .limit(20)
                )
                due = list(session.execute(stmt_tasks).scalars().all())
                for t in due:
                    profile = profile_repo.get_by_id(session, profile_id=t.profile_id)
                    user_id = getattr(profile, "user_id", None) if profile else None
                    if not user_id:
                        t.reminder_state = "disabled"
                        continue
                    subs = subs_repo.list_active_for_user(session, user_id=user_id)
                    if not subs:
                        continue
                    sent_any = False
                    for s in subs:
                        try:
                            push.send(
                                endpoint=s.endpoint,
                                p256dh=s.p256dh,
                                auth=s.auth,
                                title="Plan task reminder",
                                body=t.title,
                                data={"task_id": t.id, "plan_id": t.plan_id},
                            )
                            sent_any = True
                            s.last_seen_at = now
                        except WebPushException as e:
                            status = getattr(getattr(e, "response", None), "status_code", None)
                            if status in (404, 410):
                                s.disabled_at = now
                        except Exception:
                            # Keep subscription; transient error.
                            pass
                    if sent_any:
                        t.last_reminded_at = now
                        t.reminder_state = "sent"
                session.commit()
            except Exception:
                session.rollback()
            finally:
                session.close()

        sched = BackgroundScheduler(daemon=True)
        sched.add_job(tick, "interval", seconds=60, id="push_reminders", max_instances=1, coalesce=True)
        sched.start()
        app.state.scheduler = sched

    def stop_scheduler():
        sched = getattr(app.state, "scheduler", None)
        if sched:
            try:
                sched.shutdown(wait=False)
            except Exception:
                pass

    # Start/stop background reminders.
    app.add_event_handler("startup", start_scheduler)
    app.add_event_handler("shutdown", stop_scheduler)

    return app


