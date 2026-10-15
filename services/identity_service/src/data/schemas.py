"""API request/response schemas (Pydantic V2)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from services.identity_service.src.core.models import IdentityUser, Role


class RegisterRequest(BaseModel):
    """New user registration payload."""

    model_config = ConfigDict(frozen=True)

    email: str = Field(min_length=3)
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=200)


class RegisterResponse(BaseModel):
    """Successful registration payload."""

    model_config = ConfigDict(frozen=True)

    user: IdentityUser


class LoginRequest(BaseModel):
    """Credentials presented at the login boundary."""

    model_config = ConfigDict(frozen=True)

    email: str = Field(min_length=3)
    password: str = Field(min_length=8)


class LoginResponse(BaseModel):
    """Successful login payload with JWT access token."""

    model_config = ConfigDict(frozen=True)

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: IdentityUser


class IntrospectRequest(BaseModel):
    """Optional body token for introspect (Bearer header also accepted)."""

    model_config = ConfigDict(frozen=True)

    token: str | None = None


class IntrospectResponse(BaseModel):
    """HTTP introspect response with flat claims when active."""

    model_config = ConfigDict(frozen=True)

    active: bool
    sub: UUID | None = None
    email: str | None = None
    roles: list[str] | None = None
    permissions: list[str] | None = None
    exp: datetime | None = None
    iat: datetime | None = None
    iss: str | None = None


class VerifyResponse(BaseModel):
    """Verify-shaped response with flat claims when valid."""

    model_config = ConfigDict(frozen=True)

    valid: bool
    sub: UUID | None = None
    email: str | None = None
    roles: list[str] | None = None
    permissions: list[str] | None = None
    exp: datetime | None = None
    iat: datetime | None = None
    iss: str | None = None


class UserResponse(BaseModel):
    """Single-user response envelope."""

    model_config = ConfigDict(frozen=True)

    user: IdentityUser


class RoleListResponse(BaseModel):
    """List of roles and their permissions."""

    model_config = ConfigDict(frozen=True)

    roles: list[Role]


class AssignRoleRequest(BaseModel):
    """Assign (replace) a user's primary role set."""

    model_config = ConfigDict(frozen=True)

    role: str = Field(pattern="^(admin|member|viewer)$")


class AssignRoleResponse(BaseModel):
    """Role assignment result."""

    model_config = ConfigDict(frozen=True)

    user: IdentityUser


class HealthResponse(BaseModel):
    """Service health contract."""

    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    features: list[str]
    database_ready: bool = False


class PasswordResetRequest(BaseModel):
    """Request a password reset link/token for the given email."""

    model_config = ConfigDict(frozen=True)

    email: str = Field(min_length=3)


class PasswordResetRequestResponse(BaseModel):
    """Generic password reset request acknowledgement (no email enumeration)."""

    model_config = ConfigDict(frozen=True)

    message: str
    reset_token: str | None = None


class PasswordResetConfirmRequest(BaseModel):
    """Confirm password reset with token and new password."""

    model_config = ConfigDict(frozen=True)

    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class PasswordResetConfirmResponse(BaseModel):
    """Successful password reset confirmation."""

    model_config = ConfigDict(frozen=True)

    message: str
