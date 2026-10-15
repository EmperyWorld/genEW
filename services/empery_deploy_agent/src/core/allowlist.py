"""Strict argv construction for rootless compose — no arbitrary shell."""

from __future__ import annotations

import re
from pathlib import Path

from services.empery_deploy_agent.src.core.contracts import DeployAction

_SERVICE_RE = re.compile(r"^[a-z][a-z0-9_]{1,62}$")
# Note: `stop` is allowlisted only via DeployAction.STOP (not free-form).
_FORBIDDEN = re.compile(
    r"(?:^|\s)(?:down|kill|rm|rmi|system|pod|volume|network|exec|run|cp|unshare)(?:\s|$)",
    re.IGNORECASE,
)

# Never stop/delete these via deploy-agent lifecycle actions.
SPINE_SERVICES = frozenset(
    {
        "postgres",
        "redis",
        "empery_intelligence_core",
        "empery_control_center",
        "empery_control_center_api",
        "empery_deploy_agent",
        "identity_service",
        "core_auth_service",
        "desktop_shell",
    }
)


def validate_service_name(service_name: str) -> str:
    if not _SERVICE_RE.fullmatch(service_name):
        raise ValueError(
            f"service_name not allowlisted: {service_name!r} "
            "(must match ^[a-z][a-z0-9_]{1,62}$)"
        )
    return service_name


def assert_not_spine(service_name: str, *, action: DeployAction) -> None:
    name = validate_service_name(service_name)
    if action is DeployAction.STOP and name in SPINE_SERVICES:
        raise ValueError(
            f"refusing {action.value} on spine service {name!r}"
        )


def resolve_compose_files(workspace: Path) -> list[Path]:
    """Return compose.yml + reflex overlay (orchestration is source of truth)."""
    base = workspace / "compose.yml"
    if not base.is_file():
        raise FileNotFoundError(f"compose.yml missing under {workspace}")
    files = [base]
    orch_reflex = (
        workspace / ".cursor" / "orchestration" / "eic" / "compose.reflex.yml"
    )
    root_reflex = workspace / "compose.reflex.yml"
    if orch_reflex.is_file():
        files.append(orch_reflex)
    elif root_reflex.is_file():
        files.append(root_reflex)
    return files


def build_compose_argv(
    *,
    workspace: Path,
    service_name: str,
    action: DeployAction,
) -> list[str]:
    """
    Allowlisted argv only:
      up      → podman-compose -f … up -d --build --force-recreate --no-deps <svc>
      build   → podman-compose -f … build <svc>
      rebuild → first step only: build (cached layers; see build_compose_argv_steps)
      ps      → podman-compose -f … ps <svc>
      stop    → podman-compose -f … stop <svc>
    """
    name = validate_service_name(service_name)
    assert_not_spine(name, action=action)
    files = resolve_compose_files(workspace)
    argv: list[str] = ["podman-compose"]
    for path in files:
        argv.extend(["-f", str(path)])

    if action is DeployAction.UP:
        argv.extend(
            ["up", "-d", "--build", "--force-recreate", "--no-deps", name]
        )
    elif action is DeployAction.BUILD:
        argv.extend(["build", name])
    elif action is DeployAction.REBUILD:
        # Cached layers: COPY of changed source still invalidates; --no-cache
        # made Hands implement waits ~2–3× longer for no correctness gain.
        argv.extend(["build", name])
    elif action is DeployAction.RESTART:
        # Direct podman restart — podman-compose restart is unreliable under
        # rootless + dependents (exit 0 / "no container" / container lost).
        # Project naming: empery_<service>_1 (compose project "empery").
        argv = ["podman", "restart", f"empery_{name}_1"]
        joined = " ".join(argv)
        if _FORBIDDEN.search(joined):
            raise ValueError("forbidden compose token detected")
        if ";" in joined or "|" in joined or "`" in joined or "$(" in joined:
            raise ValueError("shell metacharacters forbidden")
        return argv
    elif action is DeployAction.PS:
        argv.extend(["ps"])
    elif action is DeployAction.STOP:
        argv.extend(["stop", name])
    else:
        raise ValueError(f"action {action} is not a compose argv action")

    joined = " ".join(argv)
    if _FORBIDDEN.search(joined):
        raise ValueError("forbidden compose token detected")
    if ";" in joined or "|" in joined or "`" in joined or "$(" in joined:
        raise ValueError("shell metacharacters forbidden")
    return argv


def build_compose_argv_steps(
    *,
    workspace: Path,
    service_name: str,
    action: DeployAction,
) -> list[list[str]]:
    """One or more allowlisted argv sequences (rebuild = build + up --force-recreate)."""
    if action is DeployAction.REBUILD:
        name = validate_service_name(service_name)
        assert_not_spine(name, action=action)
        files = resolve_compose_files(workspace)
        base: list[str] = ["podman-compose"]
        for path in files:
            base.extend(["-f", str(path)])
        build_argv = [*base, "build", name]
        up_argv = [
            *base,
            "up",
            "-d",
            "--force-recreate",
            "--no-deps",
            name,
        ]
        for argv in (build_argv, up_argv):
            joined = " ".join(argv)
            if _FORBIDDEN.search(joined):
                raise ValueError("forbidden compose token detected")
            if ";" in joined or "|" in joined or "`" in joined or "$(" in joined:
                raise ValueError("shell metacharacters forbidden")
        return [build_argv, up_argv]
    return [
        build_compose_argv(
            workspace=workspace, service_name=service_name, action=action
        )
    ]


def validate_health_url(url: str, *, service_name: str) -> str:
    """Allow only http(s) health probes for the named service host/path shape."""
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("health_url must be http(s)")
    if parsed.username or parsed.password:
        raise ValueError("health_url must not include credentials")
    host = (parsed.hostname or "").lower()
    allowed_hosts = {
        service_name.lower(),
        "127.0.0.1",
        "localhost",
    }
    if host not in allowed_hosts:
        raise ValueError(
            f"health_url host {host!r} not allowlisted for {service_name}"
        )
    path = parsed.path or "/"
    if not path.startswith("/"):
        raise ValueError("invalid health_url path")
    return url
