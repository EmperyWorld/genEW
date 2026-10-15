# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Stage 6+11 integration resolver — grade ui↔api / fullstack / db / auth /
# events and auto-wire strong pairs into an existing project shell.
# Invariants:
# - Weak contracts require allow_weak_contracts=True; blocked otherwise.
# - Does not mutate set-runtime/; only data/project-shells/.
# - Full Keycloak realm setup deferred (auth env example only).
# Related:
# - generators/set/contract_gate.py
# - generators/project_shell/materialize.py
# - generators/project_shell/deep_contracts.py
# - documentation/platform/EWGEN-COMPONENT-FACTORY-VISION.md
# ---

"""Resolve contracts on an existing N-way project shell."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from generators.set.contract_gate import evaluate_install_contract
from generators.set.module_files import collect_backend_files, collect_frontend_files
from generators.set.requirements_merge import merge_module_requirements
from generators.set.router_mount import build_set_module_router

from .deep_contracts import (
    apply_deep_side_effects,
    probe_auth_contract,
    probe_db_contract,
    probe_events_contract,
)
from .paths import project_shell_path

PROTOCOL_RESOLVE_V1 = "ewgen_project_resolve_v1"


def _letter_to_vision(letter: str, *, allowed: bool) -> str:
    if not allowed:
        return "blocked"
    if letter in {"A", "B"}:
        return "strong"
    if letter in {"C", "·"}:
        return "weak"
    return "weak"


def _load_shell_manifest(shell_root: Path) -> Dict[str, Any]:
    path = shell_root / "project.manifest.json"
    if not path.is_file():
        raise FileNotFoundError(f"project.manifest.json missing: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("project.manifest.json must be an object")
    return data


def _resolve_shell_root(
    *,
    project_id: Optional[str],
    project_path: Optional[Path],
) -> Path:
    if project_path is not None:
        root = Path(project_path)
    elif project_id:
        root = project_shell_path(str(project_id).strip())
    else:
        raise ValueError("projectId or projectPath is required")
    if not root.is_dir():
        raise FileNotFoundError(f"Project shell not found: {root}")
    if not (root / "compose.yaml").is_file():
        raise FileNotFoundError(f"Project shell incomplete (no compose.yaml): {root}")
    return root


def _modules_by_role(manifest: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for module in manifest.get("modules") or []:
        if not isinstance(module, dict):
            continue
        role = str(module.get("role") or "").strip().lower()
        grouped.setdefault(role, []).append(module)
    return grouped


def _pair_targets(
    grouped: Dict[str, List[Dict[str, Any]]],
) -> List[Tuple[str, Dict[str, Any], Optional[Dict[str, Any]]]]:
    """
    Build resolve targets: fullstack alone, or ui×api pairs (cartesian, capped).
    """
    targets: List[Tuple[str, Dict[str, Any], Optional[Dict[str, Any]]]] = []
    for module in grouped.get("fullstack") or []:
        targets.append(("fullstack", module, None))

    uis = grouped.get("ui") or []
    apis = grouped.get("api") or []
    for ui in uis:
        for api in apis:
            targets.append(("ui_api", ui, api))
            # Prefer first api per ui for Stage 6 minimal; still record all
            # but cap explosion
            if len(targets) >= 24:
                return targets
    return targets


def _hydrate_from_disk(
    shell_root: Path,
    *,
    fe_module_id: Optional[str],
    be_module_id: Optional[str],
    display_name: str,
) -> Dict[str, Any]:
    fe_files: List[Dict[str, str]] = []
    be_files: List[Dict[str, str]] = []
    if fe_module_id:
        fe_files = collect_frontend_files(
            shell_root / "modules" / fe_module_id / "frontend"
        )
    if be_module_id:
        be_files = collect_backend_files(
            shell_root / "modules" / be_module_id / "backend"
        )
    return {
        "moduleName": display_name,
        "layers": {
            "frontend": {"files": fe_files, "moduleName": fe_module_id},
            "backend": {"files": be_files, "moduleName": be_module_id},
        },
    }


def _evaluate_target(
    shell_root: Path,
    kind: str,
    primary: Dict[str, Any],
    secondary: Optional[Dict[str, Any]],
    *,
    allow_weak_contracts: bool,
) -> Dict[str, Any]:
    if kind == "fullstack":
        module_id = str(primary["moduleId"])
        hydrated = _hydrate_from_disk(
            shell_root,
            fe_module_id=module_id,
            be_module_id=module_id,
            display_name=str(primary.get("displayName") or module_id),
        )
        gate = evaluate_install_contract(
            hydrated,
            allow_weak_contract=allow_weak_contracts,
        )
        return {
            "kind": kind,
            "moduleIds": [module_id],
            "displayName": primary.get("displayName") or module_id,
            "beModuleId": module_id,
            "feModuleId": module_id,
            "letterGrade": gate.get("grade"),
            "contractGrade": _letter_to_vision(
                str(gate.get("grade") or "·"),
                allowed=bool(gate.get("allowed")),
            ),
            "overlapCount": gate.get("overlapCount", 0),
            "overlap": list(gate.get("overlap") or [])[:20],
            "warnings": list(gate.get("warnings") or []),
            "errors": list(gate.get("errors") or []),
            "allowed": bool(gate.get("allowed")),
            "hydrated": hydrated,
        }

    ui = primary
    api = secondary or {}
    ui_id = str(ui["moduleId"])
    api_id = str(api["moduleId"])
    hydrated = _hydrate_from_disk(
        shell_root,
        fe_module_id=ui_id,
        be_module_id=api_id,
        display_name=f"{ui.get('displayName')}+{api.get('displayName')}",
    )
    gate = evaluate_install_contract(
        hydrated,
        allow_weak_contract=allow_weak_contracts,
    )
    return {
        "kind": kind,
        "moduleIds": [ui_id, api_id],
        "displayName": f"{ui_id}+{api_id}",
        "beModuleId": api_id,
        "feModuleId": ui_id,
        "letterGrade": gate.get("grade"),
        "contractGrade": _letter_to_vision(
            str(gate.get("grade") or "·"),
            allowed=bool(gate.get("allowed")),
        ),
        "overlapCount": gate.get("overlapCount", 0),
        "overlap": list(gate.get("overlap") or [])[:20],
        "warnings": list(gate.get("warnings") or []),
        "errors": list(gate.get("errors") or []),
        "allowed": bool(gate.get("allowed")),
        "hydrated": hydrated,
    }


def _apply_wire(
    shell_root: Path,
    evaluation: Dict[str, Any],
    *,
    dry_run: bool,
) -> Dict[str, Any]:
    actions: List[str] = []
    be_module_id = str(evaluation["beModuleId"])
    display_name = str(evaluation.get("displayName") or be_module_id)
    hydrated = evaluation["hydrated"]
    layers = hydrated.get("layers") or {}
    be_files = list((layers.get("backend") or {}).get("files") or [])
    overlap = [str(item) for item in (evaluation.get("overlap") or [])]

    router_build = build_set_module_router(
        be_module_id,
        display_name,
        be_files,
        overlap,
    )
    mount_mode = str(router_build.get("mountMode", "stub"))
    actions.append(f"router:{mount_mode}")

    if not dry_run:
        be_root = shell_root / "modules" / be_module_id / "backend"
        be_root.mkdir(parents=True, exist_ok=True)
        (be_root / "router.py").write_text(
            router_build["content"],
            encoding="utf-8",
        )
        actions.append("router_written")

        req = merge_module_requirements(
            be_module_id,
            be_files,
            module_root=shell_root / "modules" / be_module_id,
            target_path=shell_root / "backend" / "requirements.modules.txt",
        )
        if req.get("addedCount"):
            actions.append(f"requirements_added:{req['addedCount']}")
        else:
            actions.append("requirements_checked")

        _patch_module_manifest(
            shell_root,
            be_module_id,
            evaluation,
            mount_mode=mount_mode,
        )
        if evaluation.get("feModuleId") and evaluation["feModuleId"] != be_module_id:
            _patch_module_manifest(
                shell_root,
                str(evaluation["feModuleId"]),
                evaluation,
                mount_mode=None,
            )
        _patch_registry(shell_root, evaluation, mount_mode=mount_mode)
        actions.append("registry_updated")

    return {
        "mountMode": mount_mode,
        "actions": actions,
        "routerMountedCount": router_build.get("mountedRouterCount", 0),
    }


def _patch_module_manifest(
    shell_root: Path,
    module_id: str,
    evaluation: Dict[str, Any],
    *,
    mount_mode: Optional[str],
) -> None:
    path = shell_root / "modules" / module_id / "set.module.json"
    if not path.is_file():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return
    data["contract"] = {
        "grade": evaluation.get("letterGrade"),
        "contractGrade": evaluation.get("contractGrade"),
        "overlapCount": evaluation.get("overlapCount", 0),
        "compatVersion": "2.0.0",
    }
    runtime = data.get("runtime") or {}
    be = runtime.get("be") or {}
    if mount_mode is not None:
        be["mountMode"] = mount_mode
    runtime["be"] = be
    data["runtime"] = runtime
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _patch_registry(
    shell_root: Path,
    evaluation: Dict[str, Any],
    *,
    mount_mode: str,
) -> None:
    path = shell_root / "modules" / "registry.json"
    if not path.is_file():
        return
    entries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        return
    target_ids = set(evaluation.get("moduleIds") or [])
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        mid = str(entry.get("moduleId") or "")
        if mid not in target_ids:
            continue
        entry["contract"] = {
            "grade": evaluation.get("letterGrade"),
            "contractGrade": evaluation.get("contractGrade"),
            "overlapCount": evaluation.get("overlapCount", 0),
            "compatVersion": "2.0.0",
        }
        be = entry.get("be") or {}
        if mid == evaluation.get("beModuleId"):
            be["mountMode"] = mount_mode
        entry["be"] = be
    path.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def resolve_project_shell(
    *,
    project_id: Optional[str] = None,
    project_path: Optional[Path] = None,
    allow_weak_contracts: bool = False,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Grade and optionally auto-wire contracts on an existing project shell.
    """
    shell_root = _resolve_shell_root(
        project_id=project_id,
        project_path=project_path,
    )
    manifest = _load_shell_manifest(shell_root)
    grouped = _modules_by_role(manifest)
    targets = _pair_targets(grouped)

    warnings: List[str] = []
    deep_db = probe_db_contract(shell_root, grouped)
    deep_auth = probe_auth_contract(shell_root)
    deep_events = probe_events_contract(shell_root)
    deep_probes = [deep_db, deep_auth, deep_events]
    for probe in deep_probes:
        warnings.extend(probe.get("warnings") or [])
        grade = probe.get("contractGrade")
        if grade == "weak" and not allow_weak_contracts:
            probe["contractGrade"] = "blocked"
            probe["allowed"] = False
            probe["errors"] = list(probe.get("errors") or []) + [
                "Weak deep contract requires allowWeakContracts=true"
            ]

    if not targets:
        warnings.append(
            "No fullstack or ui+api pairs to resolve — deep contracts still run"
        )

    evaluations: List[Dict[str, Any]] = []
    for kind, primary, secondary in targets:
        evaluation = _evaluate_target(
            shell_root,
            kind,
            primary,
            secondary,
            allow_weak_contracts=allow_weak_contracts,
        )
        grade = evaluation["contractGrade"]
        if grade == "weak" and not allow_weak_contracts:
            evaluation["contractGrade"] = "blocked"
            evaluation["errors"] = list(evaluation.get("errors") or []) + [
                "Weak contract requires allowWeakContracts=true"
            ]
            evaluation["allowed"] = False
        evaluations.append(evaluation)

    blocked_evals = [
        item for item in evaluations if item["contractGrade"] == "blocked"
    ]
    blocked_deep = [
        item for item in deep_probes if item.get("contractGrade") == "blocked"
    ]
    if blocked_evals or blocked_deep:
        messages = []
        for item in blocked_evals:
            detail = "; ".join(item.get("errors") or []) or item["displayName"]
            messages.append(f"{item['displayName']}: {detail}")
        for item in blocked_deep:
            detail = "; ".join(item.get("errors") or []) or item.get("kind")
            messages.append(f"deep:{item.get('kind')}: {detail}")
        raise ValueError(
            "PROJECT_RESOLVE_BLOCKED: " + " | ".join(messages)
        )

    results: List[Dict[str, Any]] = []
    for evaluation in evaluations:
        grade = evaluation["contractGrade"]
        row: Dict[str, Any] = {
            "kind": evaluation["kind"],
            "moduleIds": evaluation["moduleIds"],
            "displayName": evaluation["displayName"],
            "letterGrade": evaluation["letterGrade"],
            "contractGrade": grade,
            "overlapCount": evaluation["overlapCount"],
            "overlap": evaluation["overlap"],
            "warnings": evaluation["warnings"],
            "errors": evaluation["errors"],
            "wired": False,
            "actions": [],
            "mountMode": None,
        }
        wire = _apply_wire(shell_root, evaluation, dry_run=dry_run)
        row["wired"] = not dry_run
        row["actions"] = (
            ["dry_run"] + wire["actions"] if dry_run else wire["actions"]
        )
        row["mountMode"] = wire["mountMode"]
        results.append(row)

    deep_actions = apply_deep_side_effects(
        shell_root,
        auth=deep_auth,
        events=deep_events,
        db=deep_db,
        dry_run=dry_run,
    )

    strong_count = sum(1 for row in results if row["contractGrade"] == "strong")
    weak_count = sum(1 for row in results if row["contractGrade"] == "weak")
    deep_strong = sum(
        1 for item in deep_probes if item.get("contractGrade") == "strong"
    )

    return {
        "protocol": PROTOCOL_RESOLVE_V1,
        "success": True,
        "projectId": manifest.get("projectId") or shell_root.name,
        "projectPath": str(shell_root),
        "dryRun": dry_run,
        "allowWeakContracts": allow_weak_contracts,
        "pairs": results,
        "pairCount": len(results),
        "strongCount": strong_count,
        "weakCount": weak_count,
        "blockedCount": 0,
        "deep": {
            "db": {
                k: v
                for k, v in deep_db.items()
                if k != "errors" or deep_db.get("errors")
            },
            "auth": {
                "contractGrade": deep_auth.get("contractGrade"),
                "status": deep_auth.get("status"),
                "envKeys": deep_auth.get("envKeys"),
                "warnings": deep_auth.get("warnings"),
            },
            "events": {
                "contractGrade": deep_events.get("contractGrade"),
                "status": deep_events.get("status"),
                "eventCount": len(deep_events.get("events") or []),
                "warnings": deep_events.get("warnings"),
            },
            "actions": deep_actions,
            "strongCount": deep_strong,
        },
        "warnings": warnings,
    }
