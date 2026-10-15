"""Dual-Gate Auditor — Gate T (hash freeze), Gate C (contract), Gate S (semantic).

Authoritative: PASSED ⇔ T ∧ C. Gate S FAILURE fails the job for config_driven
(cannot rescue T/C fail; cannot mint PASSED when Nervas abstains).
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from core.integration.assembly_contracts import (
    AssemblyManifest,
    BlueprintContract,
    is_config_driven_profile,
    validate_blueprint,
    validate_manifest,
    validate_manifest_against_blueprint,
)


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def _pascal(service_name: str) -> str:
    return "".join(part.capitalize() for part in service_name.split("_"))


def _kebab(service_name: str) -> str:
    return service_name.replace("_", "-")


def assembler_owned_paths(workspace: Path, service_name: str) -> list[Path]:
    """Paths Assembler may write — frozen after inject."""
    kebab = _kebab(service_name)
    pascal = _pascal(service_name)
    return [
        workspace
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service_name}.tsx",
        workspace
        / "apps"
        / "empery_control_center"
        / "src"
        / "features"
        / kebab
        / f"{pascal}Page.tsx",
        workspace / "services" / service_name / "assembly_runtime.json",
    ]


def immutable_golden_paths(workspace: Path) -> list[Path]:
    """Shared golden lib / schemas — must not drift mid-job (spot-check files)."""
    roots = [
        workspace / "apps" / "empery_desktop" / "src" / "assembly_lib",
        workspace / "apps" / "empery_control_center" / "src" / "assembly_lib",
    ]
    files: list[Path] = []
    for root in roots:
        if not root.is_dir():
            continue
        for p in sorted(root.rglob("*")):
            if p.is_file() and p.suffix in {".ts", ".tsx"}:
                files.append(p)
    return files


def write_assembly_freeze(
    workspace: Path,
    service_name: str,
    *,
    include_golden: bool = True,
) -> Path:
    """Snapshot sha256 of Assembler-owned (+ golden lib) files after inject."""
    entries: dict[str, str] = {}
    for path in assembler_owned_paths(workspace, service_name):
        if path.is_file():
            rel = str(path.relative_to(workspace)).replace("\\", "/")
            entries[rel] = _sha256_file(path)
    if include_golden:
        for path in immutable_golden_paths(workspace):
            rel = str(path.relative_to(workspace)).replace("\\", "/")
            entries[rel] = _sha256_file(path)
    out = workspace / "services" / service_name / "assembly_freeze.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "service_name": service_name,
        "version": "1",
        "files": entries,
    }
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out


def verify_assembly_gate_t(
    workspace: Path,
    service_name: str,
) -> tuple[str, str]:
    """Gate T — hash freeze. Drift from Assembler output → FAILED (CRITICAL)."""
    freeze_path = workspace / "services" / service_name / "assembly_freeze.json"
    runtime = workspace / "services" / service_name / "assembly_runtime.json"
    # Skip if not config-driven assembly job.
    if not freeze_path.is_file():
        if runtime.is_file():
            return (
                "FAILED",
                "Gate T: assembly_runtime.json present but assembly_freeze.json missing "
                "(Assembler did not hash-freeze)",
            )
        return "SKIPPED", "Gate T: no assembly_freeze.json (legacy)"

    try:
        data = json.loads(freeze_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return "FAILED", f"Gate T: unreadable assembly_freeze.json: {exc}"

    files = data.get("files") if isinstance(data, dict) else None
    if not isinstance(files, dict) or not files:
        return "FAILED", "Gate T: empty freeze map"

    drifts: list[str] = []
    missing: list[str] = []
    for rel, expected in files.items():
        path = workspace / str(rel)
        if not path.is_file():
            missing.append(str(rel))
            continue
        actual = _sha256_file(path)
        if actual != expected:
            drifts.append(str(rel))

    if missing or drifts:
        parts = []
        if missing:
            parts.append(f"missing={missing}")
        if drifts:
            parts.append(f"CRITICAL_VIOLATION drift={drifts}")
        return "FAILED", "Gate T: " + "; ".join(parts)

    return "PASSED", f"Gate T OK: {len(files)} frozen file hashes match"


def verify_assembly_gate_c_full(
    workspace: Path,
    service_name: str,
    *,
    designs_root: Path | None = None,
    eic_root: Path | None = None,
) -> tuple[str, str]:
    """Gate C full — Blueprint↔Manifest↔runtime + slot coverage + endpoint allowlist."""
    # Reuse core coverage from assembler, then deepen.
    from core.assembly.assembler import (
        verify_assembly_contract_gate,
    )

    base_status, base_detail = verify_assembly_contract_gate(
        workspace,
        service_name,
        designs_root=designs_root,
        eic_root=eic_root,
    )
    if base_status in {"SKIPPED", "FAILED"}:
        return base_status, base_detail

    bp_path = None
    mf_path = None
    if designs_root is not None:
        bp_path = designs_root / f"{service_name}_blueprint.json"
    else:
        for c in (
            workspace
            / ".cursor"
            / "orchestration"
            / "designs"
            / f"{service_name}_blueprint.json",
            workspace / "orchestration" / "designs" / f"{service_name}_blueprint.json",
        ):
            if c.is_file():
                bp_path = c
                break
    if eic_root is not None:
        mf_path = eic_root / "assembly" / f"{service_name}_manifest.json"
    else:
        for c in (
            workspace
            / ".cursor"
            / "orchestration"
            / "eic"
            / "assembly"
            / f"{service_name}_manifest.json",
            workspace
            / "orchestration"
            / "eic"
            / "assembly"
            / f"{service_name}_manifest.json",
        ):
            if c.is_file():
                mf_path = c
                break

    assert bp_path is not None and mf_path is not None
    blueprint = validate_blueprint(json.loads(bp_path.read_text(encoding="utf-8")))
    manifest = validate_manifest(json.loads(mf_path.read_text(encoding="utf-8")))

    notes: list[str] = [base_detail]

    # Instance counts vs Blueprint widgets.
    bp_widgets = [
        n
        for n in blueprint.target_component_tree
        if n.type.value == "Widget" or n.widget_type is not None
    ]
    if bp_widgets and len(manifest.composition) < len(bp_widgets):
        return (
            "FAILED",
            f"Gate C: composition count {len(manifest.composition)} < "
            f"Blueprint widgets {len(bp_widgets)}",
        )

    # Endpoint allowlist — every Manifest data_source ⊆ Blueprint data_requirements.
    allowed = {d.endpoint.lstrip("/") for d in blueprint.data_requirements}
    for item in manifest.composition:
        if not item.data_source:
            continue
        src = item.data_source.lstrip("/")
        if allowed and not any(
            src == ep or src.endswith(ep) or ep.endswith(src) for ep in allowed
        ):
            return (
                "FAILED",
                f"Gate C: data_source={item.data_source!r} not in Blueprint allowlist "
                f"{sorted(allowed)}",
            )

    # Slot coverage — composition ids / titles present in mount or page after inject.
    mount = (
        workspace
        / "apps"
        / "empery_desktop"
        / "src"
        / "shell"
        / "mounts"
        / f"{service_name}.tsx"
    )
    page = (
        workspace
        / "apps"
        / "empery_control_center"
        / "src"
        / "features"
        / _kebab(service_name)
        / f"{_pascal(service_name)}Page.tsx"
    )
    ui_bodies: list[str] = []
    for p in (mount, page):
        if p.is_file():
            ui_bodies.append(p.read_text(encoding="utf-8"))
    combined = "\n".join(ui_bodies)
    if not combined:
        return (
            "FAILED",
            "Gate C: no Desktop mount or ECC page for slot coverage check",
        )
    if 'data-assembler-slot="widgets"' not in combined:
        return "FAILED", "Gate C: missing data-assembler-slot=widgets in UI"

    # Empty-div / placeholder-only: slot present but zero injected component keys.
    missing_ids: list[str] = []
    for item in manifest.composition:
        # Injected widgets use key="{component_id}"
        if (
            f'key="{item.component_id}"' not in combined
            and f"key='{item.component_id}'" not in combined
            and item.component_id not in combined
        ):
            missing_ids.append(item.component_id)
    if missing_ids:
        return (
            "FAILED",
            f"Gate C: slot not covering composition ids {missing_ids} "
            "(empty-div / inject missing)",
        )

    notes.append(
        f"slot_coverage={len(manifest.composition)}; endpoints_ok; widgets_vs_bp="
        f"{len(manifest.composition)}/{len(bp_widgets) or len(manifest.composition)}"
    )
    return "PASSED", "Gate C OK: " + "; ".join(notes)


def _heuristic_semantic_match(
    intent: str,
    blueprint: BlueprintContract,
    manifest: AssemblyManifest,
) -> dict[str, Any]:
    """Deterministic Gate S fallback when Nervas unavailable."""
    hay = (intent or "").lower()
    titles: list[str] = []
    for item in manifest.composition:
        for m in item.mapping:
            if m.prop_name == "title" and m.source_type == "static" and m.value is not None:
                titles.append(str(m.value).lower())
    widget_types = {
        (item.widget_type.value if item.widget_type else "")
        for item in manifest.composition
    }
    score = 0.0
    reasons: list[str] = []
    if any(k in hay for k in ("dashboard", "metrics", "ops", "дашборд", "метрик")):
        if "card" in widget_types or "chart" in widget_types or "metric" in widget_types:
            score += 0.5
            reasons.append("intent asks dashboard-like UI; Manifest has widgets")
        else:
            reasons.append("intent dashboard-like but Manifest lacks card/chart/metric")
    else:
        score += 0.2
        reasons.append("intent not dashboard-specific; structural Manifest accepted")

    if blueprint.data_requirements and any(c.data_source for c in manifest.composition):
        score += 0.3
        reasons.append("data_requirements mapped to composition data_source")
    if len(manifest.composition) >= 1:
        score += 0.2
    match = score >= 0.5
    return {
        "match": match,
        "reason": "; ".join(reasons) or "heuristic Gate S",
        "confidence": round(min(1.0, score), 2),
        "titles": titles,
        "source": "heuristic",
    }


def verify_assembly_gate_s(
    *,
    intent: str,
    workspace: Path,
    service_name: str,
    designs_root: Path | None = None,
    eic_root: Path | None = None,
    nervas: Any | None = None,
    judge_raw: str | None = None,
    nervas_abstained: bool = False,
) -> tuple[str, str, dict[str, Any]]:
    """Gate S — Intent↔Blueprint↔Manifest semantic judge.

    Prefer ``judge_raw`` (Nervas text already fetched by agent_loop). ``nervas``
    arg is unused for async (kept for API compat).

    When ``nervas_abstained`` is True (judge timed out / unparseable after
    retries), return FAILED — never mint PASSED from heuristic alone.
    Heuristic is allowed only when Nervas was not attempted, or when Nervas
    returned parseable low-confidence mismatch (defer to heuristic).
    """
    del nervas  # async Nervas must be called from agent_loop; pass judge_raw
    bp_path = None
    mf_path = None
    if designs_root is not None:
        bp_path = designs_root / f"{service_name}_blueprint.json"
    if eic_root is not None:
        mf_path = eic_root / "assembly" / f"{service_name}_manifest.json"
    if bp_path is None or not bp_path.is_file():
        for c in (
            workspace
            / ".cursor"
            / "orchestration"
            / "designs"
            / f"{service_name}_blueprint.json",
            workspace / "orchestration" / "designs" / f"{service_name}_blueprint.json",
        ):
            if c.is_file():
                bp_path = c
                break
    if mf_path is None or not mf_path.is_file():
        for c in (
            workspace
            / ".cursor"
            / "orchestration"
            / "eic"
            / "assembly"
            / f"{service_name}_manifest.json",
            workspace
            / "orchestration"
            / "eic"
            / "assembly"
            / f"{service_name}_manifest.json",
        ):
            if c.is_file():
                mf_path = c
                break

    if bp_path is None or not bp_path.is_file() or mf_path is None or not mf_path.is_file():
        return "SKIPPED", "Gate S: no Blueprint/Manifest", {"match": None}

    try:
        blueprint = validate_blueprint(json.loads(bp_path.read_text(encoding="utf-8")))
        manifest = validate_manifest(json.loads(mf_path.read_text(encoding="utf-8")))
        validate_manifest_against_blueprint(manifest, blueprint)
    except Exception as exc:
        return (
            "FAILED",
            f"Gate S: contracts invalid before judge: {exc}",
            {"match": False, "reason": str(exc)},
        )

    if blueprint.assembly_mode != "config_driven" and not is_config_driven_profile(
        blueprint.scaffold_profile
    ):
        return "SKIPPED", "Gate S: not config_driven", {"match": None}

    if nervas_abstained or judge_raw == "__NERVAS_ABSTAINED__":
        return (
            "FAILED",
            "Gate S ABSTAINED: Nervas judge unavailable/unparseable after retries",
            {
                "match": False,
                "reason": "nervas_abstained",
                "source": "abstention",
                "confidence": 0.0,
            },
        )

    judge = _heuristic_semantic_match(intent, blueprint, manifest)

    if judge_raw and judge_raw != "__NERVAS_ABSTAINED__":
        m = re.search(r"\{[\s\S]*\}", judge_raw)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict) and "match" in parsed:
                conf = float(parsed.get("confidence") or 0)
                nervas_judge = {
                    "match": bool(parsed.get("match")),
                    "reason": str(parsed.get("reason") or ""),
                    "confidence": conf,
                    "source": "nervas",
                }
                # Low-confidence Nervas mismatch → keep heuristic (weak evidence).
                if nervas_judge["match"] is False and conf < 0.45:
                    judge = {
                        **judge,
                        "nervas_deferred": nervas_judge,
                        "source": f"{judge.get('source')}+nervas_low_conf",
                    }
                else:
                    judge = nervas_judge
            else:
                # Provided raw but unparseable / no match key → abstain fail-closed.
                return (
                    "FAILED",
                    "Gate S ABSTAINED: judge_raw unparseable or missing match",
                    {
                        "match": False,
                        "reason": "judge_raw_unparseable",
                        "source": "abstention",
                        "confidence": 0.0,
                    },
                )
        else:
            return (
                "FAILED",
                "Gate S ABSTAINED: judge_raw had no JSON object",
                {
                    "match": False,
                    "reason": "judge_raw_no_json",
                    "source": "abstention",
                    "confidence": 0.0,
                },
            )

    if judge.get("match") is True:
        return (
            "PASSED",
            f"Gate S OK ({judge.get('source')}): {judge.get('reason')}",
            judge,
        )
    return (
        "FAILED",
        f"Gate S mismatch ({judge.get('source')}): {judge.get('reason')}",
        judge,
    )


def apply_authoritative_assembly_gates(
    status: str,
    *,
    gate_t: str | None,
    gate_c: str | None,
    gate_s: str | None = None,
) -> str:
    """Enforce PASSED ⇔ T∧C. Gate S fail cannot alone decide; T/C fail always wins.

    When T∧C PASSED and S is not FAILED, deterministic assembly wins over LLM
    FAILED/UNKNOWN (C6 stickiness kill). Callers must re-apply product hard fails
    (factory/ui/desktop/live) after this — those must still win.
    """
    if gate_t == "FAILED" or gate_c == "FAILED":
        return "FAILED"
    # Plan: S cannot override T/C fail; S fail when T∧C pass → still FAILED for semantic.
    if gate_t == "PASSED" and gate_c == "PASSED" and gate_s == "FAILED":
        return "FAILED"
    if gate_t == "PASSED" and gate_c == "PASSED":
        return "PASSED"
    if gate_t in {"PASSED", "SKIPPED"} and gate_c in {"PASSED", "SKIPPED"}:
        if status == "UNKNOWN" and (gate_c == "PASSED" or gate_t == "PASSED"):
            return "PASSED"
    return status
