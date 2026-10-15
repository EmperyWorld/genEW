"""Assembly artifact bundle — inventory SoT for Mechanics outputs.

Shared FS remains the compose runtime contract until content-transfer exists.
The bundle records what Assembler wrote (relpath + kind + sha256) so Brain /
Auditor can evidence delivery without ad-hoc tree scans.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def artifact_bundle_rel(service_name: str) -> str:
    return f"services/{service_name}/assembly_artifact_bundle.json"


def artifact_bundle_path(workspace: Path, service_name: str) -> Path:
    return workspace / artifact_bundle_rel(service_name)


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def classify_written_kind(relpath: str) -> str:
    rel = str(relpath).replace("\\", "/")
    if rel.endswith("assembly_runtime.json"):
        return "stamp"
    if rel.endswith("assembly_freeze.json"):
        return "freeze"
    if rel.endswith("assembly_artifact_bundle.json"):
        return "bundle"
    if rel.endswith((".tsx", ".ts", ".jsx", ".js")):
        return "tsx"
    if "/atoms/" in rel or rel.endswith(".py"):
        return "extract"
    return "artifact"


def build_written_inventory(
    workspace: Path,
    written_relpaths: list[str],
) -> list[dict[str, Any]]:
    """Build [{relpath, kind, sha256?}] for paths that exist under workspace."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in written_relpaths:
        rel = str(raw).replace("\\", "/").lstrip("./")
        if not rel or rel in seen:
            continue
        seen.add(rel)
        entry: dict[str, Any] = {
            "relpath": rel,
            "kind": classify_written_kind(rel),
        }
        path = workspace / rel
        if path.is_file():
            entry["sha256"] = _sha256_file(path)
        out.append(entry)
    return out


def build_artifact_bundle(
    workspace: Path,
    *,
    service_name: str,
    written_relpaths: list[str],
    assembler_version: str = "v1",
    widget_count: int = 0,
) -> dict[str, Any]:
    """Assemble inventory dict (not yet written to disk)."""
    written = build_written_inventory(workspace, written_relpaths)
    freeze_rel = f"services/{service_name}/assembly_freeze.json"
    freeze_files: dict[str, str] = {}
    freeze_path = workspace / freeze_rel
    if freeze_path.is_file():
        try:
            data = json.loads(freeze_path.read_text(encoding="utf-8"))
            files = data.get("files") if isinstance(data, dict) else None
            if isinstance(files, dict):
                freeze_files = {str(k): str(v) for k, v in files.items()}
        except (OSError, json.JSONDecodeError, TypeError):
            freeze_files = {}
    return {
        "version": "1",
        "service_name": service_name,
        "assembler_version": assembler_version,
        "widget_count": int(widget_count or 0),
        "created_at": datetime.now(timezone.utc).isoformat(),
        # Until content-transfer RPCs exist, peers share the workspace volume.
        "workspace_contract": "shared_fs",
        "freeze_relpath": freeze_rel if freeze_path.is_file() else None,
        "freeze_files": freeze_files,
        "written": written,
    }


def write_artifact_bundle(
    workspace: Path,
    *,
    service_name: str,
    written_relpaths: list[str],
    assembler_version: str = "v1",
    widget_count: int = 0,
) -> Path:
    """Persist bundle JSON under services/{svc}/assembly_artifact_bundle.json."""
    bundle = build_artifact_bundle(
        workspace,
        service_name=service_name,
        written_relpaths=written_relpaths,
        assembler_version=assembler_version,
        widget_count=widget_count,
    )
    out = artifact_bundle_path(workspace, service_name)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(bundle, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return out


def load_artifact_bundle(
    workspace: Path, service_name: str
) -> dict[str, Any] | None:
    path = artifact_bundle_path(workspace, service_name)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def verify_bundle_hashes(
    workspace: Path, bundle: dict[str, Any]
) -> tuple[str, str]:
    """Return (PASSED|FAILED, detail) — on-disk bytes must match inventory sha256."""
    written = bundle.get("written")
    if not isinstance(written, list) or not written:
        return "FAILED", "Artifact bundle: empty written inventory"
    drift: list[str] = []
    missing: list[str] = []
    for item in written:
        if not isinstance(item, dict):
            continue
        rel = str(item.get("relpath") or "")
        expect = item.get("sha256")
        if not rel or not expect:
            continue
        path = workspace / rel
        if not path.is_file():
            missing.append(rel)
            continue
        actual = _sha256_file(path)
        if actual != expect:
            drift.append(rel)
    if missing or drift:
        parts = []
        if missing:
            parts.append(f"missing={missing[:8]}")
        if drift:
            parts.append(f"drift={drift[:8]}")
        return "FAILED", "Artifact bundle: " + "; ".join(parts)
    return "PASSED", f"Artifact bundle OK ({len(written)} entries)"


# Max bytes per file attached on the wire (content-transfer). Larger → sha256 only.
DEFAULT_ARTIFACT_BYTES_CAP = 2 * 1024 * 1024


def attach_artifact_bytes(
    workspace: Path,
    inventory: list[dict[str, Any]],
    *,
    max_bytes: int = DEFAULT_ARTIFACT_BYTES_CAP,
    relpaths: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Copy inventory entries and attach ``content`` (bytes) when under cap."""
    allow = {str(p).replace("\\", "/").lstrip("./") for p in (relpaths or [])}
    out: list[dict[str, Any]] = []
    for item in inventory:
        if not isinstance(item, dict):
            continue
        rel = str(item.get("relpath") or "").replace("\\", "/").lstrip("./")
        if not rel:
            continue
        if allow and rel not in allow:
            continue
        entry = dict(item)
        path = workspace / rel
        if path.is_file():
            raw = path.read_bytes()
            if len(raw) <= max_bytes:
                entry["content"] = raw
                if "sha256" not in entry:
                    entry["sha256"] = hashlib.sha256(raw).hexdigest()
        out.append(entry)
    return out


def materialize_written_artifacts(
    workspace: Path,
    artifacts: list[dict[str, Any]],
    *,
    require_sha256: bool = True,
) -> list[str]:
    """Write artifact ``content`` bytes onto workspace; verify sha256 when present.

    Returns list of relpaths written. Raises ValueError on hash mismatch.
    """
    written: list[str] = []
    for item in artifacts:
        if not isinstance(item, dict):
            continue
        rel = str(item.get("relpath") or "").replace("\\", "/").lstrip("./")
        content = item.get("content")
        if not rel or not isinstance(content, (bytes, bytearray)):
            continue
        raw = bytes(content)
        expect = item.get("sha256")
        if expect:
            actual = hashlib.sha256(raw).hexdigest()
            if actual != expect:
                raise ValueError(
                    f"artifact sha256 mismatch for {rel}: "
                    f"expected {expect}, got {actual}"
                )
        elif require_sha256:
            raise ValueError(f"artifact missing sha256 for {rel}")
        path = workspace / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        written.append(rel)
    return written


def fetch_artifacts_inventory(
    workspace: Path,
    service_name: str,
    *,
    include_bytes: bool = False,
    relpaths: list[str] | None = None,
    max_bytes: int = DEFAULT_ARTIFACT_BYTES_CAP,
) -> dict[str, Any]:
    """Load bundle inventory (or freeze fallback) and optionally attach bytes."""
    bundle = load_artifact_bundle(workspace, service_name)
    written_src: list[dict[str, Any]] = []
    if bundle and isinstance(bundle.get("written"), list):
        written_src = [dict(x) for x in bundle["written"] if isinstance(x, dict)]
    else:
        freeze_path = workspace / f"services/{service_name}/assembly_freeze.json"
        if freeze_path.is_file():
            try:
                data = json.loads(freeze_path.read_text(encoding="utf-8"))
                files = data.get("files") if isinstance(data, dict) else {}
                if isinstance(files, dict):
                    for rel, sha in files.items():
                        written_src.append(
                            {
                                "relpath": str(rel),
                                "kind": classify_written_kind(str(rel)),
                                "sha256": str(sha),
                            }
                        )
            except (OSError, json.JSONDecodeError, TypeError):
                written_src = []
    if include_bytes:
        written = attach_artifact_bytes(
            workspace,
            written_src,
            max_bytes=max_bytes,
            relpaths=relpaths,
        )
    else:
        if relpaths:
            allow = {str(p).replace("\\", "/").lstrip("./") for p in relpaths}
            written = [
                x
                for x in written_src
                if str(x.get("relpath") or "").replace("\\", "/").lstrip("./")
                in allow
            ]
        else:
            written = written_src
    return {
        "ok": True,
        "service_name": service_name,
        "artifact_bundle_relpath": (
            artifact_bundle_rel(service_name) if bundle else None
        ),
        "written": written,
        "written_artifacts": written,
    }
