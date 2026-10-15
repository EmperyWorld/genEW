"""Repository-level tests against sqlite DatabaseManager."""

from __future__ import annotations

import asyncio
import logging

from core.data.database import DatabaseManager, register_sqlite_fk_pragma
from services.identity_service.src.core.roles import DEFAULT_ROLE_PERMISSIONS
from services.identity_service.src.data.orm import Base
from services.identity_service.src.data.repository import IdentityRepository


def _repo() -> IdentityRepository:
    db = DatabaseManager.from_url("sqlite+pysqlite:///:memory:")
    register_sqlite_fk_pragma(db.engine)
    db.create_all(Base.metadata)
    return IdentityRepository(db, logging.getLogger("test_identity_db"))


def test_ensure_default_roles_and_create_user() -> None:
    repo = _repo()

    async def _run() -> None:
        await repo.ensure_default_roles()
        roles = await repo.list_roles()
        names = {r.name for r in roles}
        assert names == {"admin", "operator", "member", "viewer"}
        admin = next(r for r in roles if r.name == "admin")
        assert set(admin.permissions) == set(DEFAULT_ROLE_PERMISSIONS["admin"])

        user = await repo.create_user(
            email="carol@example.com",
            password="secretpass",
            display_name="Carol",
            role_name="member",
        )
        assert user.roles == ["member"]
        assert set(user.permissions) == set(DEFAULT_ROLE_PERMISSIONS["member"])
        assert await repo.count_users() == 1
        assert await repo.verify_password(user.id, "secretpass") is True
        assert await repo.verify_password(user.id, "wrong") is False

        updated = await repo.set_user_roles(user.id, ["viewer"])
        assert updated.roles == ["viewer"]
        assert updated.permissions == ["identity:users:read"]

        by_email = await repo.get_user_by_email("carol@example.com")
        assert by_email is not None
        assert by_email.id == user.id

    asyncio.run(_run())
