"""Doc apply safety gates."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from services.empery_intelligence_core.tests.conftest import (
    build_memory_app,
    make_memory_config,
)


def _create_proposal(client: TestClient, target: str, content: str, **extra):
    payload = {
        "target_relative_path": target,
        "title": "proposal",
        "rationale": "test",
        "proposed_content": content,
        "content_mode": "full_file",
        **extra,
    }
    resp = client.post("/api/v1/memory/docs/proposals", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_apply_disabled_by_default(client) -> None:
    proposal = _create_proposal(
        client,
        ".cursor/orchestration/SYSTEM_BLUEPRINT.md",
        "# Blueprint\nupdated\n",
    )
    resp = client.post(
        f"/api/v1/memory/docs/proposals/{proposal['id']}/apply",
        json={"confirm": True},
    )
    assert resp.status_code == 403
    assert resp.json()["error_code"] == "EIC_MEMORY_APPLY_DISABLED"


def test_rules_require_dual_flag(tmp_repo: Path) -> None:
    cfg = make_memory_config(
        tmp_repo,
        allow_doc_apply=True,
        allow_rules_apply=False,
    )
    with TestClient(build_memory_app(cfg)) as client:
        proposal = _create_proposal(
            client,
            ".cursor/rules/architecture-core.mdc",
            "# rule\n",
        )
        resp = client.post(
            f"/api/v1/memory/docs/proposals/{proposal['id']}/apply",
            json={"confirm": True, "apply_rules": True},
        )
        assert resp.status_code == 403
        assert resp.json()["error_code"] == "EIC_MEMORY_RULES_APPLY_DISABLED"

    cfg2 = make_memory_config(
        tmp_repo,
        allow_doc_apply=True,
        allow_rules_apply=True,
    )
    rules_path = tmp_repo / ".cursor" / "rules" / "architecture-core.mdc"
    rules_path.write_text("# old\n", encoding="utf-8")
    with TestClient(build_memory_app(cfg2)) as client:
        proposal = _create_proposal(
            client,
            ".cursor/rules/architecture-core.mdc",
            "# new rule\n",
        )
        # apply_rules false still blocked
        blocked = client.post(
            f"/api/v1/memory/docs/proposals/{proposal['id']}/apply",
            json={"confirm": True, "apply_rules": False},
        )
        assert blocked.status_code == 403

        applied = client.post(
            f"/api/v1/memory/docs/proposals/{proposal['id']}/apply",
            json={"confirm": True, "apply_rules": True},
        )
        assert applied.status_code == 200, applied.text
        assert rules_path.read_text(encoding="utf-8") == "# new rule\n"


def test_hash_conflict_and_traversal(tmp_repo: Path) -> None:
    target = tmp_repo / ".cursor" / "orchestration" / "SYSTEM_BLUEPRINT.md"
    target.write_text("# Blueprint\nv1\n", encoding="utf-8")
    cfg = make_memory_config(tmp_repo, allow_doc_apply=True)
    with TestClient(build_memory_app(cfg)) as client:
        proposal = _create_proposal(
            client,
            ".cursor/orchestration/SYSTEM_BLUEPRINT.md",
            "# Blueprint\nv2\n",
            base_sha256="0" * 64,
        )
        conflict = client.post(
            f"/api/v1/memory/docs/proposals/{proposal['id']}/apply",
            json={"confirm": True},
        )
        assert conflict.status_code == 409
        assert conflict.json()["error_code"] == "EIC_MEMORY_CONFLICT_HASH"

        traverse = client.post(
            "/api/v1/memory/docs/proposals",
            json={
                "target_relative_path": "../secrets.txt",
                "title": "bad",
                "rationale": "escape",
                "proposed_content": "x",
            },
        )
        assert traverse.status_code == 400
        assert traverse.json()["error_code"] == "EIC_MEMORY_INVALID_PATH"
