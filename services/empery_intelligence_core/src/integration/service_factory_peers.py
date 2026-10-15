"""Service factory peer promotion — DB provision, env matrix, live-peers snapshot.

Production path: newborn services become dependency-capable for the next genesis.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.logging import log_event

_SERVICE_RE = re.compile(r"^[a-z][a-z0-9_]{1,62}$")
_SPINE = frozenset(
    {
        "postgres",
        "redis",
        "empery_intelligence_core",
        "empery_control_center",
        "empery_control_center_api",
        "empery_deploy_agent",
        "identity_service",
        "core_auth_service",
    }
)


def validate_service_name(service_name: str) -> str:
    if not _SERVICE_RE.fullmatch(service_name):
        raise ValueError(f"invalid service_name: {service_name!r}")
    if service_name in _SPINE:
        raise ValueError(f"refusing to provision spine service: {service_name}")
    return service_name


def eic_dir(workspace: Path) -> Path:
    path = workspace / ".cursor" / "orchestration" / "eic"
    path.mkdir(parents=True, exist_ok=True)
    return path


def peer_env_matrix_path(workspace: Path) -> Path:
    return eic_dir(workspace) / "peer_env_matrix.json"


def live_peers_path(workspace: Path) -> Path:
    return eic_dir(workspace) / "live_peers.json"


def dynamic_sql_dir(workspace: Path) -> Path:
    path = workspace / "deploy" / "postgres" / "dynamic"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _read_json_object(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def _write_json(path: Path, data: dict[str, Any]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def _admin_database_url() -> str | None:
    explicit = os.environ.get("EIC_POSTGRES_ADMIN_URL", "").strip()
    if explicit:
        return explicit
    password = os.environ.get("POSTGRES_PASSWORD", "").strip()
    user = os.environ.get("POSTGRES_USER", "eworld").strip() or "eworld"
    host = os.environ.get("POSTGRES_HOST", "postgres").strip() or "postgres"
    port = os.environ.get("POSTGRES_PORT", "5432").strip() or "5432"
    if password:
        return f"postgresql+psycopg://{user}:{password}@{host}:{port}/postgres"
    # Compose always injects EIC_DATABASE_URL — derive admin URL when POSTGRES_* missing.
    eic_url = os.environ.get("EIC_DATABASE_URL", "").strip()
    if eic_url:
        return _rewrite_database_name(eic_url, "postgres")
    return None


def _rewrite_database_name(url: str, database: str) -> str | None:
    """Replace the path DB name in a SQLAlchemy URL (keep user/pass/host)."""
    try:
        from sqlalchemy.engine.url import make_url

        parsed = make_url(url)
        return parsed.set(database=database).render_as_string(hide_password=False)
    except Exception:  # noqa: BLE001
        # Fallback: swap trailing /dbname
        if "/" not in url.rsplit("@", 1)[-1]:
            return None
        head, _sep, _tail = url.rpartition("/")
        if not head:
            return None
        return f"{head}/{database}"


def service_database_url(service_name: str) -> str | None:
    """Build postgresql URL for a Hands service DB from admin credentials."""
    name = validate_service_name(service_name)
    admin = _admin_database_url()
    if not admin:
        return None
    return _rewrite_database_name(admin, name)


def provision_sql_snippet(service_name: str, *, db_user: str = "eworld") -> str:
    name = validate_service_name(service_name)
    user = db_user if re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", db_user) else "eworld"
    return (
        f"-- Auto-provisioned by Empery Hands for {name}\n"
        f"SELECT 'CREATE DATABASE {name}'\n"
        f"WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '{name}')\\gexec\n"
        f"GRANT ALL PRIVILEGES ON DATABASE {name} TO {user};\n"
    )


def write_provision_overlay(
    workspace: Path,
    service_name: str,
    *,
    db_user: str = "eworld",
) -> dict[str, Any]:
    """Persist CREATE DATABASE overlay under deploy/postgres/dynamic/."""
    name = validate_service_name(service_name)
    snippet = provision_sql_snippet(name, db_user=db_user)
    dyn = dynamic_sql_dir(workspace)
    per_svc = dyn / f"{name}.sql"
    per_svc.write_text(snippet, encoding="utf-8")
    # Merge all snippets into all.sql for operators / volume re-init docs.
    parts = [
        "-- Merged dynamic DB provisions (Hands). Applied at runtime via "
        "provision_service_database; also safe to feed to psql on empty volumes.\n"
    ]
    for path in sorted(dyn.glob("*.sql")):
        if path.name == "all.sql":
            continue
        parts.append(path.read_text(encoding="utf-8").rstrip() + "\n")
    all_path = dyn / "all.sql"
    all_path.write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")
    return {
        "service_name": name,
        "overlay": str(per_svc),
        "merged": str(all_path),
        "written": [str(per_svc), str(all_path)],
    }


def apply_database_provision(
    service_name: str,
    *,
    logger: logging.Logger | None = None,
    admin_url: str | None = None,
) -> dict[str, Any]:
    """
    CREATE DATABASE if missing via SQLAlchemy/psycopg (compose DNS).

    Returns ok=False with reason when admin URL unavailable (overlay still useful).
    """
    name = validate_service_name(service_name)
    if admin_url is not None:
        url = admin_url.strip() or None
    else:
        url = _admin_database_url()
    if not url:
        return {
            "ok": False,
            "service_name": name,
            "applied": False,
            "error": "POSTGRES_PASSWORD/EIC_POSTGRES_ADMIN_URL unset",
        }
    try:
        from sqlalchemy import create_engine, text
    except ImportError as exc:
        return {
            "ok": False,
            "service_name": name,
            "applied": False,
            "error": f"sqlalchemy_unavailable: {exc}",
        }
    try:
        engine = create_engine(url, isolation_level="AUTOCOMMIT")
        with engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"),
                {"n": name},
            ).scalar()
            created = False
            if not exists:
                # Identifiers validated — safe to interpolate.
                conn.execute(text(f'CREATE DATABASE "{name}"'))
                created = True
            user = os.environ.get("POSTGRES_USER", "eworld").strip() or "eworld"
            if re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", user):
                conn.execute(
                    text(f'GRANT ALL PRIVILEGES ON DATABASE "{name}" TO "{user}"')
                )
        if logger is not None:
            log_event(
                logger,
                event="eic.factory.db_provisioned",
                message="Service database provisioned",
                service_name=name,
                created=created,
            )
        return {
            "ok": True,
            "service_name": name,
            "applied": True,
            "created": created,
        }
    except Exception as exc:  # noqa: BLE001
        if logger is not None:
            log_event(
                logger,
                event="eic.factory.db_provision_failed",
                message="Service database provision failed",
                service_name=name,
                error=str(exc)[:300],
                level=logging.WARNING,
            )
        return {
            "ok": False,
            "service_name": name,
            "applied": False,
            "error": str(exc)[:500],
        }


def run_service_alembic_upgrade(
    workspace: Path,
    service_name: str,
    *,
    database_url: str | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """Apply alembic upgrade head for a Hands capsule (production path)."""
    import subprocess
    import sys

    name = validate_service_name(service_name)
    root = workspace / "services" / name
    ini = root / "alembic.ini"
    if not ini.is_file():
        return {"ok": True, "service_name": name, "skipped": True, "reason": "no alembic.ini"}
    url = (database_url or service_database_url(name) or "").strip()
    if not url:
        return {
            "ok": False,
            "service_name": name,
            "skipped": False,
            "error": "database URL unavailable for alembic",
        }
    env = os.environ.copy()
    env[f"{name.upper()}_DATABASE_URL"] = url
    env["DATABASE_URL"] = url
    # Capsule imports `services.{name}…` from workspace root.
    env["PYTHONPATH"] = os.pathsep.join(
        [str(workspace), env.get("PYTHONPATH", "")]
    ).rstrip(os.pathsep)
    try:
        proc = subprocess.run(
            [
                sys.executable,
                "-m",
                "alembic",
                "-c",
                str(ini),
                "upgrade",
                "head",
            ],
            cwd=str(workspace),
            env=env,
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
    except Exception as exc:  # noqa: BLE001
        if logger is not None:
            log_event(
                logger,
                event="eic.factory.alembic_failed",
                message="Alembic upgrade raised",
                service_name=name,
                error=str(exc)[:300],
                level=logging.ERROR,
            )
        return {"ok": False, "service_name": name, "error": str(exc)[:400]}
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "alembic failed")[-800:]
        if logger is not None:
            log_event(
                logger,
                event="eic.factory.alembic_failed",
                message="Alembic upgrade failed",
                service_name=name,
                error=err[:300],
                level=logging.ERROR,
            )
        return {
            "ok": False,
            "service_name": name,
            "error": err,
            "exit_code": proc.returncode,
        }
    if logger is not None:
        log_event(
            logger,
            event="eic.factory.alembic_ok",
            message="Alembic upgrade head completed",
            service_name=name,
        )
    return {"ok": True, "service_name": name, "applied": True}


def provision_service_database(
    workspace: Path,
    service_name: str,
    *,
    logger: logging.Logger | None = None,
    apply: bool = True,
    require_apply: bool = True,
    run_migrations: bool = True,
) -> dict[str, Any]:
    """Write overlay SQL and optionally apply CREATE DATABASE against live Postgres.

    When ``require_apply`` is True (Hands production path), soft-fail apply
    (missing admin URL / CREATE DATABASE error) makes ``ok=False`` so verify
    cannot PASSED while Desktop metrics still 500 on missing DB.
    """
    overlay = write_provision_overlay(workspace, service_name)
    result: dict[str, Any] = {**overlay, "ok": True, "applied": False}
    if apply:
        applied = apply_database_provision(service_name, logger=logger)
        result.update(applied)
        apply_ok = bool(applied.get("ok"))
        result["apply_ok"] = apply_ok
        if require_apply and not apply_ok:
            result["ok"] = False
            return result
        result["ok"] = True
        if run_migrations and apply_ok:
            mig = run_service_alembic_upgrade(
                workspace, service_name, logger=logger
            )
            result["migrations"] = mig
            if require_apply and not mig.get("ok"):
                result["ok"] = False
                result["error"] = mig.get("error") or "alembic upgrade failed"
    return result


def read_manifest_meta(workspace: Path, service_name: str) -> dict[str, Any]:
    name = validate_service_name(service_name)
    path = workspace / "services" / name / "manifest.json"
    if not path.is_file():
        return {"name": name, "dependencies": [], "publishes": [], "subscribes": []}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"name": name, "dependencies": [], "publishes": [], "subscribes": []}
    if not isinstance(raw, dict):
        return {"name": name, "dependencies": [], "publishes": [], "subscribes": []}
    return {
        "name": name,
        "version": raw.get("version"),
        "features": list(raw.get("features") or []),
        "dependencies": list(raw.get("dependencies") or []),
        "publishes": list(raw.get("publishes") or []),
        "subscribes": list(raw.get("subscribes") or []),
    }


def resolve_service_port(workspace: Path, service_name: str) -> int | None:
    """Best-effort port from compose fragment, then health bases / peer matrix.

    Compose ``SERVICE_PORT`` is authoritative — health bases can lag or be
    overwritten by a second ``allocate_service_port`` after scaffold.
    """
    name = validate_service_name(service_name)
    compose = workspace / "deploy" / "services" / f"{name}.yml"
    if compose.is_file():
        text = compose.read_text(encoding="utf-8")
        m = re.search(r'SERVICE_PORT:\s*"(\d+)"', text)
        if m:
            return int(m.group(1))
        m = re.search(rf"{re.escape(name.upper())}_PORT:\s*\"(\d+)\"", text)
        if m:
            return int(m.group(1))
        m = re.search(r'PORT:\s*"(\d+)"', text)
        if m:
            return int(m.group(1))
    health = _read_json_object(eic_dir(workspace) / "dynamic_health_bases.json")
    base = health.get(name)
    if isinstance(base, str) and ":" in base:
        try:
            return int(base.rsplit(":", 1)[-1].split("/")[0])
        except ValueError:
            pass
    matrix = _read_json_object(peer_env_matrix_path(workspace))
    peers = matrix.get("peers")
    if isinstance(peers, dict):
        entry = peers.get(name)
        if isinstance(entry, dict) and entry.get("port") is not None:
            try:
                return int(entry["port"])
            except (TypeError, ValueError):
                pass
    return None


def upsert_peer_env_matrix(
    workspace: Path,
    service_name: str,
    *,
    port: int | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """Record peer API/health bases so future genesis / ECC can wire dependents."""
    name = validate_service_name(service_name)
    resolved_port = port or resolve_service_port(workspace, name)
    meta = read_manifest_meta(workspace, name)
    health_base = (
        f"http://{name}:{resolved_port}" if resolved_port else f"http://{name}"
    )
    env_key = f"{name.upper()}_API_BASE"
    entry = {
        "service_name": name,
        "port": resolved_port,
        "health_base": health_base,
        "api_base": health_base,
        "api_base_env": env_key,
        "dependencies": meta.get("dependencies") or [],
        "publishes": meta.get("publishes") or [],
        "subscribes": meta.get("subscribes") or [],
        "features": meta.get("features") or [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    path = peer_env_matrix_path(workspace)
    data = _read_json_object(path)
    peers = data.get("peers")
    if not isinstance(peers, dict):
        peers = {}
    peers[name] = entry
    data["peers"] = peers
    data["updated_at"] = entry["updated_at"]
    _write_json(path, data)

    # Keep dynamic_health_bases.json in sync when port known.
    if resolved_port:
        hb_path = eic_dir(workspace) / "dynamic_health_bases.json"
        hb = _read_json_object(hb_path)
        hb[name] = health_base
        _write_json(hb_path, hb)

    if logger is not None:
        log_event(
            logger,
            event="eic.factory.peer_env_upserted",
            message="Peer env matrix updated",
            service_name=name,
            port=resolved_port,
        )
    return {
        "ok": True,
        "service_name": name,
        "path": str(path),
        "entry": entry,
        "written": [str(path)],
    }


def promote_live_peer(
    workspace: Path,
    service_name: str,
    *,
    verified: bool = False,
    health_ok: bool | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """Publish/update live_peers.json so recipe_catalog can feed next genesis."""
    name = validate_service_name(service_name)
    matrix = _read_json_object(peer_env_matrix_path(workspace))
    raw_peers = matrix.get("peers")
    peers_map = raw_peers if isinstance(raw_peers, dict) else {}
    entry = dict(peers_map.get(name) or {})
    if not entry:
        # Ensure matrix row exists.
        upsert = upsert_peer_env_matrix(workspace, name, logger=logger)
        entry = dict(upsert.get("entry") or {})
    now = datetime.now(timezone.utc).isoformat()
    entry.update(
        {
            "service_name": name,
            "verified": bool(verified),
            "health_ok": health_ok,
            "promoted_at": now,
            "status": "verified" if verified else "deployed",
        }
    )
    path = live_peers_path(workspace)
    data = _read_json_object(path)
    peers = data.get("peers")
    if not isinstance(peers, dict):
        peers = {}
    peers[name] = entry
    data["peers"] = peers
    data["updated_at"] = now
    _write_json(path, data)
    if logger is not None:
        log_event(
            logger,
            event="eic.factory.live_peer_promoted",
            message="Live peer promoted for next genesis",
            service_name=name,
            verified=verified,
        )
    return {
        "ok": True,
        "service_name": name,
        "path": str(path),
        "entry": entry,
        "written": [str(path)],
    }


def load_live_peers(workspace: Path) -> dict[str, Any]:
    return _read_json_object(live_peers_path(workspace))


def format_live_peers_digest(workspace: Path, *, limit: int = 40) -> str:
    """Markdown block for Architect / Hands prompts."""
    data = load_live_peers(workspace)
    peers = data.get("peers")
    if not isinstance(peers, dict) or not peers:
        return (
            "## Live peers (dependency-capable)\n\n"
            "_(none yet — after verify PASSED, Hands promotes newborns here)_"
        )
    lines = [
        "## Live peers (dependency-capable for next genesis)",
        "Use these as honest `manifest.dependencies` / HTTP peer bases — "
        "never invent FakeAI stubs.",
    ]
    count = 0
    for name in sorted(peers.keys()):
        if count >= limit:
            lines.append(f"- …(+{len(peers) - limit} more)")
            break
        entry = peers[name]
        if not isinstance(entry, dict):
            continue
        port = entry.get("port")
        api = entry.get("api_base") or entry.get("health_base") or ""
        pubs = entry.get("publishes") or []
        deps = entry.get("dependencies") or []
        status = entry.get("status") or ("verified" if entry.get("verified") else "known")
        lines.append(
            f"- **`{name}`** port={port} status=`{status}` api=`{api}` "
            f"publishes={pubs} dependencies={deps}"
        )
        count += 1
    return "\n".join(lines)


def after_scaffold_hooks(
    workspace: Path,
    service_name: str,
    *,
    port: int | None = None,
    logger: logging.Logger | None = None,
    provision_db: bool = True,
    require_db_apply: bool = True,
) -> dict[str, Any]:
    """Run DB overlay + peer env matrix after Hands scaffold."""
    written: list[str] = []
    out: dict[str, Any] = {"service_name": service_name, "ok": True}
    if provision_db:
        db = provision_service_database(
            workspace,
            service_name,
            logger=logger,
            require_apply=require_db_apply,
        )
        out["database"] = db
        written.extend(list(db.get("written") or []))
        if not db.get("ok"):
            out["ok"] = False
            out["error"] = db.get("error") or "database provision failed"
    env = upsert_peer_env_matrix(
        workspace, service_name, port=port, logger=logger
    )
    out["peer_env"] = env
    written.extend(list(env.get("written") or []))
    out["written"] = written
    return out


def after_deploy_hooks(
    workspace: Path,
    service_name: str,
    *,
    health_ok: bool | None = None,
    logger: logging.Logger | None = None,
    require_db_apply: bool = True,
) -> dict[str, Any]:
    """Re-provision DB (idempotent) + promote peer after successful deploy."""
    db = provision_service_database(
        workspace,
        service_name,
        logger=logger,
        require_apply=require_db_apply,
    )
    upsert_peer_env_matrix(workspace, service_name, logger=logger)
    promo = promote_live_peer(
        workspace,
        service_name,
        verified=False,
        health_ok=health_ok,
        logger=logger,
    )
    # Preserve promote_live_peer shape (entry/…) for callers + tests.
    out = dict(promo)
    out["database"] = db
    out["ok"] = bool(db.get("ok")) and bool(promo.get("ok", True))
    if not db.get("ok"):
        out["error"] = db.get("error") or "database provision failed"
    return out


def after_verify_passed_hooks(
    workspace: Path,
    service_name: str,
    *,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """Mark peer verified so next genesis can depend on it."""
    return promote_live_peer(
        workspace,
        service_name,
        verified=True,
        health_ok=True,
        logger=logger,
    )
