"""Repository-level tests for password reset tokens."""

from __future__ import annotations

import asyncio
import logging

import pytest
from core.data.database import DatabaseManager, register_sqlite_fk_pragma
from core.errors import ServiceError
from services.identity_service.src.data.orm import Base
from services.identity_service.src.data.repository import IdentityRepository


def _repo() -> IdentityRepository:
    db = DatabaseManager.from_url("sqlite+pysqlite:///:memory:")
    register_sqlite_fk_pragma(db.engine)
    db.create_all(Base.metadata)
    return IdentityRepository(db, logging.getLogger("test_password_reset_db"))


def test_create_and_confirm_password_reset() -> None:
    repo = _repo()

    async def _run() -> None:
        await repo.ensure_default_roles()
        user = await repo.create_user(
            email="reset@example.com",
            password="oldpassword",
            display_name="Reset User",
        )
        assert await repo.verify_password(user.id, "oldpassword") is True

        token = await repo.create_password_reset_token(user.id)
        assert isinstance(token, str)

        await repo.confirm_password_reset(token, "newpassword1")
        assert await repo.verify_password(user.id, "oldpassword") is False
        assert await repo.verify_password(user.id, "newpassword1") is True

        with pytest.raises(ServiceError) as exc:
            await repo.confirm_password_reset(token, "anotherpass1")
        assert exc.value.http_status == 400
        assert exc.value.response.error_code == "IDENTITY_RESET_TOKEN_USED"

    asyncio.run(_run())


def test_expired_reset_token_rejected() -> None:
    repo = _repo()

    async def _run() -> None:
        await repo.ensure_default_roles()
        user = await repo.create_user(
            email="expired@example.com",
            password="oldpassword",
            display_name="Expired User",
        )
        token = await repo.create_password_reset_token(user.id, ttl_hours=-0.01)

        with pytest.raises(ServiceError) as exc:
            await repo.confirm_password_reset(token, "newpassword1")
        assert exc.value.http_status == 400
        assert exc.value.response.error_code == "IDENTITY_RESET_TOKEN_EXPIRED"

    asyncio.run(_run())
