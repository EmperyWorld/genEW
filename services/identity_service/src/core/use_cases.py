"""Identity service use cases."""

from __future__ import annotations

from uuid import UUID

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event
from core.integration.identity_verifier import IdentityPrincipal
from core.logging import log_event
from services.identity_service.config import ServiceConfig
from services.identity_service.src.core.contracts import (
    IdentityRepositoryPort,
    IdentityTokenServicePort,
)
from services.identity_service.src.core.models import Role
from services.identity_service.src.core.roles import (
    DEFAULT_REGISTER_ROLE,
    PERM_ROLES_MANAGE,
    PERM_USERS_READ,
)
from services.identity_service.src.data.schemas import (
    AssignRoleRequest,
    AssignRoleResponse,
    IntrospectRequest,
    IntrospectResponse,
    LoginRequest,
    LoginResponse,
    PasswordResetConfirmRequest,
    PasswordResetConfirmResponse,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    RegisterRequest,
    RegisterResponse,
    RoleListResponse,
    UserResponse,
)

_PASSWORD_RESET_MESSAGE = (
    "If an account with that email exists, an administrator can issue a reset "
    "token. Email delivery is not configured on this stand."
)
_PASSWORD_RESET_CONFIRMED_MESSAGE = "Password has been reset successfully."
_DEV_ENVS = frozenset({"development", "dev", "test", "testing"})


class IdentityUseCases:
    """Application services for identity workflows."""

    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._repo: IdentityRepositoryPort = container.resolve("identity_repository")
        self._tokens: IdentityTokenServicePort = container.resolve(
            "identity_token_service"
        )
        self._logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    def _require_permission(
        self,
        principal: IdentityPrincipal,
        permission: str,
    ) -> None:
        if permission not in principal.permissions:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_FORBIDDEN",
                    message="Missing required permission",
                    details={
                        "required": permission,
                        "user_id": str(principal.user_id),
                    },
                ),
                http_status=403,
            )

    async def register(self, request: RegisterRequest) -> RegisterResponse:
        user = await self._repo.create_user(
            email=request.email,
            password=request.password,
            display_name=request.display_name,
            role_name=DEFAULT_REGISTER_ROLE,
        )
        log_event(
            self._logger,
            event="identity.register.success",
            message="User registered",
            user_id=str(user.id),
        )
        await self._event_bus.publish(
            Event(
                name="identity.user.registered",
                payload={
                    "user_id": str(user.id),
                    "email": user.email,
                    "roles": list(user.roles),
                },
            )
        )
        return RegisterResponse(user=user)

    async def login(self, request: LoginRequest) -> LoginResponse:
        user = await self._repo.get_user_by_email(request.email)
        if user is None or not user.is_active:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_INVALID_CREDENTIALS",
                    message="Invalid email or password",
                    details={"email": request.email},
                ),
                http_status=401,
            )

        if not await self._repo.verify_password(user.id, request.password):
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_INVALID_CREDENTIALS",
                    message="Invalid email or password",
                    details={"email": request.email},
                ),
                http_status=401,
            )

        token, expires_in = self._tokens.issue_token(
            user_id=user.id,
            email=user.email,
            roles=list(user.roles),
            permissions=list(user.permissions),
        )
        log_event(
            self._logger,
            event="identity.login.success",
            message="User logged in",
            user_id=str(user.id),
        )
        await self._event_bus.publish(
            Event(
                name="identity.user.logged_in",
                payload={"user_id": str(user.id), "email": user.email},
            )
        )
        return LoginResponse(
            access_token=token,
            token_type="bearer",
            expires_in=expires_in,
            user=user,
        )

    async def introspect(
        self,
        request: IntrospectRequest,
        bearer_token: str | None,
    ) -> IntrospectResponse:
        token = request.token or bearer_token
        if not token:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_UNAUTHORIZED",
                    message="Missing access token",
                ),
                http_status=401,
            )

        result = self._tokens.introspect(token)
        log_event(
            self._logger,
            event="identity.introspect",
            message="Token introspected",
            active=result.active,
        )
        if not result.active or result.principal is None:
            return IntrospectResponse(active=False)

        claims = self._tokens.decode_token(token)
        return IntrospectResponse(
            active=True,
            sub=claims.sub,
            email=claims.email,
            roles=list(claims.roles),
            permissions=list(claims.permissions),
            exp=claims.exp,
            iat=claims.iat,
            iss=claims.iss,
        )

    async def me(self, principal: IdentityPrincipal) -> UserResponse:
        user = await self._repo.get_user_by_id(principal.user_id)
        if user is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_USER_NOT_FOUND",
                    message="User not found",
                    details={"user_id": str(principal.user_id)},
                ),
                http_status=404,
            )
        return UserResponse(user=user)

    async def get_user(
        self,
        user_id: UUID,
        principal: IdentityPrincipal,
    ) -> UserResponse:
        self._require_permission(principal, PERM_USERS_READ)
        user = await self._repo.get_user_by_id(user_id)
        if user is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_USER_NOT_FOUND",
                    message="User not found",
                    details={"user_id": str(user_id)},
                ),
                http_status=404,
            )
        return UserResponse(user=user)

    async def get_user_by_email(
        self,
        email: str,
        principal: IdentityPrincipal,
    ) -> UserResponse:
        self._require_permission(principal, PERM_USERS_READ)
        normalized = email.strip().lower()
        user = await self._repo.get_user_by_email(normalized)
        if user is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_USER_NOT_FOUND",
                    message="User not found",
                    details={"email": normalized},
                ),
                http_status=404,
            )
        return UserResponse(user=user)

    async def assign_role(
        self,
        user_id: UUID,
        request: AssignRoleRequest,
        principal: IdentityPrincipal,
    ) -> AssignRoleResponse:
        self._require_permission(principal, PERM_ROLES_MANAGE)
        user = await self._repo.set_user_roles(user_id, [request.role])
        log_event(
            self._logger,
            event="identity.role.assigned",
            message="Role assigned",
            user_id=str(user.id),
            roles=list(user.roles),
        )
        await self._event_bus.publish(
            Event(
                name="identity.role.assigned",
                payload={"user_id": str(user.id), "roles": list(user.roles)},
            )
        )
        return AssignRoleResponse(user=user)

    async def list_roles(self, principal: IdentityPrincipal) -> RoleListResponse:
        self._require_permission(principal, PERM_USERS_READ)
        roles: list[Role] = await self._repo.list_roles()
        return RoleListResponse(roles=roles)

    def principal_from_token(self, token: str) -> IdentityPrincipal:
        return self._tokens.verify_token(token)

    def _should_reveal_reset_token(self) -> bool:
        config: ServiceConfig = self._container.resolve("config")
        if config.password_reset_reveal:
            return True
        return config.empery_env.strip().lower() in _DEV_ENVS

    async def request_password_reset(
        self,
        request: PasswordResetRequest,
    ) -> PasswordResetRequestResponse:
        user = await self._repo.get_user_by_email(request.email)
        reset_token: str | None = None
        if user is not None and user.is_active:
            raw_token = await self._repo.create_password_reset_token(user.id)
            if self._should_reveal_reset_token():
                reset_token = raw_token
            log_event(
                self._logger,
                event="identity.password_reset.requested",
                message="Password reset requested",
                user_id=str(user.id),
            )
            await self._event_bus.publish(
                Event(
                    name="identity.password_reset.requested",
                    payload={"user_id": str(user.id), "email": user.email},
                )
            )
        return PasswordResetRequestResponse(
            message=_PASSWORD_RESET_MESSAGE,
            reset_token=reset_token,
        )

    async def confirm_password_reset(
        self,
        request: PasswordResetConfirmRequest,
    ) -> PasswordResetConfirmResponse:
        await self._repo.confirm_password_reset(request.token, request.new_password)
        log_event(
            self._logger,
            event="identity.password_reset.confirmed",
            message="Password reset confirmed via API",
        )
        await self._event_bus.publish(
            Event(
                name="identity.password_reset.confirmed",
                payload={},
            )
        )
        return PasswordResetConfirmResponse(message=_PASSWORD_RESET_CONFIRMED_MESSAGE)
