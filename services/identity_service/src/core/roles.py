"""Default role and permission seed constants."""

from __future__ import annotations

ROLE_ADMIN = "admin"
ROLE_OPERATOR = "operator"
ROLE_MEMBER = "member"
ROLE_VIEWER = "viewer"

KNOWN_ROLES: frozenset[str] = frozenset(
    {ROLE_ADMIN, ROLE_OPERATOR, ROLE_MEMBER, ROLE_VIEWER}
)

PERM_USERS_READ = "identity:users:read"
PERM_USERS_WRITE = "identity:users:write"
PERM_ROLES_MANAGE = "identity:roles:manage"
PERM_INTROSPECT = "identity:introspect"

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    ROLE_ADMIN: [
        PERM_USERS_READ,
        PERM_USERS_WRITE,
        PERM_ROLES_MANAGE,
        PERM_INTROSPECT,
    ],
    ROLE_OPERATOR: [
        PERM_USERS_READ,
        PERM_INTROSPECT,
    ],
    ROLE_MEMBER: [
        PERM_USERS_READ,
        PERM_INTROSPECT,
    ],
    ROLE_VIEWER: [
        PERM_USERS_READ,
    ],
}

DEFAULT_REGISTER_ROLE = ROLE_MEMBER
