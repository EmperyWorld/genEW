"""Password hashing helpers (stdlib PBKDF2)."""

from __future__ import annotations

import hashlib
import hmac
import secrets


_ITERATIONS = 120_000
_ALGORITHM = "sha256"


def hash_password(password: str) -> str:
    """Return a salted PBKDF2 hash encoded as ``algo$iters$salt$digest``."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        _ALGORITHM,
        password.encode("utf-8"),
        salt.encode("utf-8"),
        _ITERATIONS,
    ).hex()
    return f"pbkdf2_{_ALGORITHM}${_ITERATIONS}${salt}${digest}"


def hash_reset_token(token: str) -> str:
    """Return a SHA-256 hex digest for a single-use password reset token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time verification of a password against a stored hash."""
    try:
        algo, iters_s, salt, expected = password_hash.split("$", 3)
        if not algo.startswith("pbkdf2_"):
            return False
        digest_name = algo.removeprefix("pbkdf2_")
        iterations = int(iters_s)
    except (ValueError, AttributeError):
        return False

    actual = hashlib.pbkdf2_hmac(
        digest_name,
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return hmac.compare_digest(actual, expected)
