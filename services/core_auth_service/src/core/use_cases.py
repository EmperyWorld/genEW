"""Auth service use cases."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from uuid import UUID, uuid4

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event
from core.integration.ai_provider import (
    AIChatMessage,
    AIChatRequest,
    AIProfileRequest,
    AIProvider,
)
from core.logging import log_event
from services.core_auth_service.src.core.contracts import AuthRepositoryPort
from services.core_auth_service.src.core.models import AuthSession, AuthUser, ChatMessage, UserProfile
from services.core_auth_service.src.data.schemas import (
    ChatAssistRequest,
    ChatAssistResponse,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
)


class AuthUseCases:
    """Application services for authentication workflows."""

    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._repo: AuthRepositoryPort = container.resolve("auth_repository")
        self._ai: AIProvider = container.resolve("ai_provider")
        self._logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    async def register(self, request: RegisterRequest) -> RegisterResponse:
        user = await self._repo.create_user(
            email=request.email,
            password=request.password,
            display_name=request.display_name,
        )
        profile = await self._profile_user(user, trigger="register")
        log_event(
            self._logger,
            event="auth.register.success",
            message="User registered",
            user_id=str(user.id),
        )
        await self._event_bus.publish(
            Event(
                name="auth.register.succeeded",
                payload={"user_id": str(user.id), "email": user.email},
            )
        )
        return RegisterResponse(user=user, profile=profile)

    async def login(self, request: LoginRequest) -> LoginResponse:
        user = await self._repo.get_user_by_email(request.email)
        if user is None or not user.is_active:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="AUTH_INVALID_CREDENTIALS",
                    message="Invalid email or password",
                    details={"email": request.email},
                ),
                http_status=401,
            )

        if not await self._repo.verify_password(user.id, request.password):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="AUTH_INVALID_CREDENTIALS",
                    message="Invalid email or password",
                    details={"email": request.email},
                ),
                http_status=401,
            )

        now = datetime.now(timezone.utc)
        raw_token = uuid4().hex
        session = AuthSession(
            id=uuid4(),
            user_id=user.id,
            token_hash=sha256(raw_token.encode()).hexdigest(),
            expires_at=now + timedelta(hours=12),
            created_at=now,
        )
        await self._repo.save_session(session)
        profile = await self._profile_user(user, trigger="login")
        log_event(
            self._logger,
            event="auth.login.success",
            message="User logged in",
            user_id=str(user.id),
        )
        await self._event_bus.publish(
            Event(
                name="auth.login.succeeded",
                payload={"user_id": str(user.id), "email": user.email},
            )
        )
        return LoginResponse(access_token=raw_token, user=user, profile=profile)

    async def chat_assist(self, request: ChatAssistRequest) -> ChatAssistResponse:
        user = await self._repo.get_user_by_id(request.user_id)
        if user is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="AUTH_USER_NOT_FOUND",
                    message="User not found",
                    details={"user_id": str(request.user_id)},
                ),
                http_status=404,
            )

        reply, provider = await self._complete_chat(user, list(request.messages))
        return ChatAssistResponse(message=reply, provider=provider)

    async def get_profile(self, user_id: UUID) -> UserProfile:
        user = await self._repo.get_user_by_id(user_id)
        if user is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="AUTH_USER_NOT_FOUND",
                    message="User not found",
                    details={"user_id": str(user_id)},
                ),
                http_status=404,
            )
        profile = await self._repo.get_profile(user_id)
        if profile is None:
            profile = await self._profile_user(user, trigger="profile_lookup")
        return profile

    async def _profile_user(self, user: AuthUser, *, trigger: str) -> UserProfile:
        ai_profile = await self._ai.profile_user(
            AIProfileRequest(
                user_id=user.id,
                email=user.email,
                display_name=user.display_name,
                metadata={"trigger": trigger},
            )
        )
        now = datetime.now(timezone.utc)
        profile = UserProfile(
            user_id=user.id,
            summary=ai_profile.summary,
            traits=list(ai_profile.traits),
            interests=list(ai_profile.interests),
            confidence=ai_profile.confidence,
            provider=ai_profile.provider,
            updated_at=now,
            raw=dict(ai_profile.raw),
        )
        return await self._repo.save_profile(profile)

    async def _complete_chat(
        self,
        user: AuthUser,
        messages: list[ChatMessage],
    ) -> tuple[ChatMessage, str]:
        response = await self._ai.complete_chat(
            AIChatRequest(
                messages=[
                    AIChatMessage(role=m.role, content=m.content) for m in messages
                ],
                metadata={"user_id": str(user.id)},
            )
        )
        log_event(
            self._logger,
            event="auth.ai_chat.complete",
            message="AI chat completion finished",
            user_id=str(user.id),
            message_count=len(messages),
            provider=response.provider,
        )
        reply = ChatMessage(
            role=response.message.role,
            content=response.message.content,
        )
        return reply, response.provider
