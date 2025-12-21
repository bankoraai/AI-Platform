from __future__ import annotations

import logging
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.user import User

logger = logging.getLogger(__name__)

class UserRepository:
    def get_by_mock_user_id(self, session: Session, mock_user_id: str) -> User | None:
        logger.debug("users_repo.get_by_mock_user_id mock_user_id=%s", mock_user_id)
        stmt = select(User).where(User.mock_user_id == mock_user_id)
        return session.execute(stmt).scalar_one_or_none()

    def get_or_create(self, session: Session, mock_user_id: str, name: str | None, email: str | None) -> User:
        existing = self.get_by_mock_user_id(session, mock_user_id)
        if existing:
            # Update optional fields if provided
            if name:
                existing.name = name
            if email:
                existing.email = email
            logger.debug("users_repo.get_or_create hit user_id=%s", existing.id)
            return existing

        user = User(mock_user_id=mock_user_id, name=name, email=email)
        session.add(user)
        session.flush()  # allocate PK
        logger.info("users_repo.created user_id=%s", user.id)
        return user


