# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Local Service iframe proxy under ``/desktop/local-service-proxy`` — cookie session + httpx streaming.
# Invariants:
# - Mounted without extra prefix under parent ``/desktop`` router.
# - Proxy routes use HttpOnly cookie auth, not Bearer on iframe navigation.
# Related:
# - api/routers/desktop_shell.py (aggregator)
# - api/middleware/oauth2_protection.py
# ---
"""Desktop local-service proxy — iframe same-origin bridge to stack2 llama-chat."""

from urllib.parse import quote, urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

from api.core.auth import User as AuthUser
from api.core.oauth2_auth import require_oauth2_user
from api.services.auth_provider_service import AuthProviderService, get_auth_provider_service

router = APIRouter(tags=["desktop"])

LOCAL_SERVICE_PROXY_TARGET_BASE = "http://stack2-llama-chat:8080"
LOCAL_SERVICE_PROXY_TOKEN_COOKIE = "eliteew_local_service_proxy_token"
LOCAL_SERVICE_PROXY_TOKEN_TTL_SECONDS = 10 * 60
LOCAL_SERVICE_PROXY_TIMEOUT_SECONDS = 120.0
LOCAL_SERVICE_PROXY_HOP_BY_HOP_REQUEST_HEADERS = frozenset(
    {
        "authorization",
        "connection",
        "cookie",
        "host",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    }
)
LOCAL_SERVICE_PROXY_STRIPPED_RESPONSE_HEADERS = frozenset(
    {
        "access-control-allow-origin",
        "connection",
        "content-encoding",
        "content-length",
        "cross-origin-embedder-policy",
        "cross-origin-opener-policy",
        "cross-origin-resource-policy",
        "content-security-policy",
        "keep-alive",
        "proxy-authenticate",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "x-frame-options",
    }
)


async def _require_local_service_proxy_access(
    request: Request,
    auth_provider: AuthProviderService = Depends(get_auth_provider_service),
) -> None:
    """Validate the HttpOnly proxy cookie for iframe navigation and proxied asset requests."""
    token = request.cookies.get(LOCAL_SERVICE_PROXY_TOKEN_COOKIE)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Local Service proxy token required")
    try:
        payload = await auth_provider.validate_token(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Local Service proxy token"
        ) from exc
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Local Service proxy token")


def _local_service_proxy_target_url(proxied_path: str, request: Request) -> str:
    safe_path = "/".join(quote(part, safe="") for part in proxied_path.split("/") if part)
    target = f"{LOCAL_SERVICE_PROXY_TARGET_BASE}/{safe_path}" if safe_path else f"{LOCAL_SERVICE_PROXY_TARGET_BASE}/"
    forwarded_query = [(key, value) for key, value in request.query_params.multi_items() if key != "token"]
    if forwarded_query:
        target = f"{target}?{urlencode(forwarded_query, doseq=True)}"
    return target


def _local_service_proxy_request_headers(request: Request) -> dict[str, str]:
    return {
        name: value
        for name, value in request.headers.items()
        if name.lower() not in LOCAL_SERVICE_PROXY_HOP_BY_HOP_REQUEST_HEADERS
    }


def _local_service_proxy_response_headers(upstream: httpx.Response) -> dict[str, str]:
    headers: dict[str, str] = {}
    for name, value in upstream.headers.items():
        lower = name.lower()
        if lower in LOCAL_SERVICE_PROXY_STRIPPED_RESPONSE_HEADERS:
            continue
        if lower == "location" and value.startswith("/"):
            headers[name] = f"/api/v1/desktop/local-service-proxy{value}"
            continue
        headers[name] = value
    return headers


async def _close_local_service_proxy_response(upstream: httpx.Response, client: httpx.AsyncClient) -> None:
    await upstream.aclose()
    await client.aclose()


@router.post("/local-service-proxy-session", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
async def create_local_service_proxy_session(
    request: Request,
    current_user: AuthUser = Depends(require_oauth2_user),
) -> Response:
    """Set an HttpOnly proxy cookie via normal API auth before iframe navigation."""
    del current_user
    token = request.headers.get("X-Auth-Request-Access-Token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.set_cookie(
        LOCAL_SERVICE_PROXY_TOKEN_COOKIE,
        token,
        max_age=LOCAL_SERVICE_PROXY_TOKEN_TTL_SECONDS,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
        path="/api/v1/desktop/local-service-proxy",
    )
    return response


@router.api_route(
    "/local-service-proxy/",
    methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    include_in_schema=False,
)
@router.api_route(
    "/local-service-proxy/{proxied_path:path}",
    methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    include_in_schema=False,
)
async def proxy_local_service_app(
    request: Request,
    proxied_path: str = "",
    _: None = Depends(_require_local_service_proxy_access),
) -> Response:
    """Proxy the server-local llama.cpp UI so browsers can embed it as same-origin content."""
    normalized_path = proxied_path.strip("/")
    if request.method == "HEAD" and normalized_path == "cors-proxy":
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if request.method == "GET" and normalized_path == "tools":
        return JSONResponse(content=[])

    target_url = _local_service_proxy_target_url(proxied_path, request)
    client = httpx.AsyncClient(timeout=httpx.Timeout(LOCAL_SERVICE_PROXY_TIMEOUT_SECONDS), follow_redirects=False)
    upstream_request = client.build_request(
        request.method,
        target_url,
        headers=_local_service_proxy_request_headers(request),
        content=await request.body(),
    )
    try:
        upstream = await client.send(upstream_request, stream=True)
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Local Service is unavailable") from exc

    response = StreamingResponse(
        upstream.aiter_bytes(),
        status_code=upstream.status_code,
        headers=_local_service_proxy_response_headers(upstream),
        background=BackgroundTask(_close_local_service_proxy_response, upstream, client),
    )
    return response
