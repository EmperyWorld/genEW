"""API and persistence schemas (Pydantic V2)."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from services.core_auth_service.src.core.models import AuthUser, ChatMessage, UserProfile


class RegisterRequest(BaseModel):
    """New user registration payload."""

    model_config = ConfigDict(frozen=True)

    email: str = Field(min_length=3)
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=200)


class RegisterResponse(BaseModel):
    """Successful registration payload."""

    model_config = ConfigDict(frozen=True)

    user: AuthUser
    profile: UserProfile | None = None


class LoginRequest(BaseModel):
    """Credentials presented at the login boundary."""

    model_config = ConfigDict(frozen=True)

    email: str = Field(min_length=3)
    password: str = Field(min_length=8)


class LoginResponse(BaseModel):
    """Successful login payload."""

    model_config = ConfigDict(frozen=True)

    access_token: str
    token_type: str = "bearer"
    user: AuthUser
    profile: UserProfile | None = None


class HealthResponse(BaseModel):
    """Service health contract."""

    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    features: list[str]
    database_ready: bool = False


class ChatAssistRequest(BaseModel):
    """AI chat assist request body."""

    model_config = ConfigDict(frozen=True)

    user_id: UUID
    messages: list[ChatMessage] = Field(min_length=1)


class ChatAssistResponse(BaseModel):
    """AI chat assist response body."""

    model_config = ConfigDict(frozen=True)

    message: ChatMessage
    provider: str | None = None


class ProfileResponse(BaseModel):
    """User profile lookup response."""

    model_config = ConfigDict(frozen=True)

    profile: UserProfile
