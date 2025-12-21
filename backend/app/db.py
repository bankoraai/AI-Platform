from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def create_db_engine(database_url: str):
    connect_args = {}
    if database_url.startswith("sqlite:"):
        # Needed for SQLite with threads (FastAPI default).
        connect_args = {"check_same_thread": False}
    return create_engine(database_url, echo=False, future=True, connect_args=connect_args)


def create_session_factory(engine):
    return sessionmaker(bind=engine, class_=Session, expire_on_commit=False, autoflush=False)


@contextmanager
def session_scope(session_factory) -> Iterator[Session]:
    session: Session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


