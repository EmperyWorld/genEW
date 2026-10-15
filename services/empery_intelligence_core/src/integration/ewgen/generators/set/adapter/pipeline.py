"""
SET Adapter — orchestrated pipeline (analyze → transform → optional install)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .analyze import analyze_for_set
from .constants import ADAPTER_STATUS_READY
from .constants import SET_COMPONENT_MODULE_KIND
from .gate import evaluate_adapter_gate
from .verify import verify_adapter_staging
from .transform import transform_for_set


def _pipeline_status(
    *,
    analysis: Dict[str, Any],
    transform_result: Optional[Dict[str, Any]] = None,
    install_result: Optional[Dict[str, Any]] = None,
) -> str:
    if install_result and install_result.get("success"):
        return "installed"
    if transform_result and transform_result.get("adapterStatus") == ADAPTER_STATUS_READY:
        return "staging_ready"
    if transform_result and transform_result.get("success"):
        return "staging_partial"
    if analysis.get("ready"):
        return "analyze_ready"
    return "blocked"


def _next_actions(
    status: str,
    *,
    blockers: List[str],
) -> List[str]:
    actions: List[str] = []
    if status == "blocked":
        if any("FE slice" in item for item in blockers):
            actions.append("expand_fortune_seaker_cluster_or_run_transform_with_closure")
        if any("router" in item.lower() or "scavenger" in item.lower() for item in blockers):
            actions.append("scavenger_set_backend_preset")
        if any("overlap" in item.lower() or "contract" in item.lower() for item in blockers):
            actions.append("review_route_contract_or_allow_weak")
        if not actions:
            actions.append("review_adapter_blockers")
    elif status == "analyze_ready":
        actions.append("run_transform")
    elif status in {"staging_ready", "staging_partial"}:
        actions.append("install_from_staging")
        if status == "staging_partial":
            actions.append("fix_blockers_or_allow_shims")
    elif status == "installed":
        actions.append("rebuild_frontend")
        actions.append("open_set_runtime_ui")
    if status == "staging_ready" and any("verify" in item for item in blockers):
        actions.insert(0, "run_adapter_verify")
    return actions


def run_adapter_pipeline(
    warsmith_catalog_id: str,
    *,
    run_transform: bool = True,
    run_install: bool = False,
    overwrite: bool = True,
    require_set_ready: bool = True,
    allow_shims: bool = False,
    allow_weak_contract: bool = False,
    expand_closure: bool = True,
    generate_readme: bool = True,
    generate_architecture: bool = True,
    entry_point_override: Optional[str] = None,
    build_frontend: bool = False,
    build_backend: bool = True,
    module_kind: Optional[str] = None,
    run_verify: bool = False,
    verify_fe_build: bool = False,
) -> Dict[str, Any]:
    """
    Run SET Adapter steps for a Warsmith catalog entry.

    Default: analyze + transform (staging). Install is opt-in.
    """
    steps: Dict[str, Any] = {}
    blockers: List[str] = []

    analysis = analyze_for_set(
        warsmith_catalog_id,
        require_set_ready=require_set_ready,
        allow_weak_contract=allow_weak_contract,
        overwrite=overwrite,
    )
    steps["analyze"] = {
        "ready": analysis.get("ready"),
        "grade": analysis.get("grade"),
        "blockers": analysis.get("blockers"),
        "warnings": analysis.get("warnings"),
        "moduleId": analysis.get("moduleId"),
        "moduleName": analysis.get("moduleName"),
    }
    blockers.extend(list(analysis.get("blockers") or []))

    transform_result: Optional[Dict[str, Any]] = None
    if run_transform:
        transform_result = transform_for_set(
            warsmith_catalog_id,
            overwrite=overwrite,
            require_set_ready=require_set_ready,
            allow_shims=allow_shims,
            allow_weak_contract=allow_weak_contract,
            expand_closure=expand_closure,
            generate_readme=generate_readme,
            generate_architecture=generate_architecture,
            entry_point_override=entry_point_override,
        )
        steps["transform"] = {
            "adapterStatus": transform_result.get("adapterStatus"),
            "ready": transform_result.get("ready"),
            "stagingPath": transform_result.get("stagingPath"),
            "closure": transform_result.get("closure"),
            "blockers": transform_result.get("blockers"),
            "feWritten": transform_result.get("feWritten"),
            "beWritten": transform_result.get("beWritten"),
        }
        blockers = list(transform_result.get("blockers") or blockers)

    module_id = str(analysis.get("moduleId") or "")
    verify_result: Optional[Dict[str, Any]] = None
    if run_verify and module_id:
        try:
            verify_result = verify_adapter_staging(
                module_id,
                module_kind=module_kind,
                verify_fe_build=verify_fe_build,
            )
            steps["verify"] = {
                "ready": verify_result.get("ready"),
                "verifyStatus": verify_result.get("verifyStatus"),
                "moduleKind": verify_result.get("moduleKind"),
                "blockers": verify_result.get("blockers"),
                "warnings": verify_result.get("warnings"),
            }
            if not verify_result.get("ready"):
                blockers = list(dict.fromkeys(
                    list(blockers) + list(verify_result.get("blockers") or []),
                ))
        except (ValueError, OSError) as error:
            steps["verify"] = {"ready": False, "error": str(error)}
            blockers.append(str(error))

    install_result: Optional[Dict[str, Any]] = None
    if run_install and module_id and run_verify and verify_result and not verify_result.get("ready"):
        steps["install"] = {
            "skipped": True,
            "reason": "verify_failed",
            "verify": steps.get("verify"),
        }
    elif run_install and module_id:
        gate = evaluate_adapter_gate(
            warsmith_catalog_id=warsmith_catalog_id,
            module_id=module_id,
        )
        if not gate.get("ready"):
            steps["install"] = {
                "skipped": True,
                "reason": "adapter_gate_failed",
                "gate": gate,
            }
        else:
            from generators.set.install_from_staging import install_from_adapter_staging

            install_result = install_from_adapter_staging(
                module_id,
                overwrite=overwrite,
                build_frontend=build_frontend,
                build_backend=build_backend,
            )
            steps["install"] = {
                "success": install_result.get("success"),
                "moduleId": install_result.get("moduleId"),
                "installedFrom": install_result.get("installedFrom"),
                "feBuild": install_result.get("feBuild"),
            }

    status = _pipeline_status(
        analysis=analysis,
        transform_result=transform_result,
        install_result=install_result,
    )

    install_ok = bool(install_result and install_result.get("success"))
    pipeline_success = install_ok if run_install else status in {"staging_ready", "installed"}

    return {
        "success": pipeline_success,
        "warsmithCatalogId": warsmith_catalog_id,
        "moduleId": module_id,
        "moduleName": analysis.get("moduleName"),
        "pipelineStatus": status,
        "nextActions": _next_actions(status, blockers=blockers),
        "steps": steps,
        "analysis": analysis,
        "transform": transform_result,
        "install": install_result,
    }
