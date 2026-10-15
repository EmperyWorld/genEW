"""Doc proposal allowlist + on-disk proposal files."""

from __future__ import annotations

from pathlib import Path


def test_proposal_allowlist_and_files(client, tmp_repo: Path) -> None:
    ok = client.post(
        "/api/v1/memory/docs/proposals",
        json={
            "target_relative_path": ".cursor/orchestration/SYSTEM_BLUEPRINT.md",
            "title": "Update blueprint",
            "rationale": "Reflect memory slice",
            "proposed_content": "# Blueprint\n\nMemory atoms added.\n",
            "content_mode": "full_file",
        },
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["status"] == "pending"
    assert body["atom_id"] is not None

    proposals_dir = tmp_repo / ".cursor" / "orchestration" / "proposals"
    pid = body["id"]
    assert (proposals_dir / f"{pid}.json").is_file()
    assert (proposals_dir / f"{pid}.md").is_file()
    assert (proposals_dir / f"{pid}.content").is_file()

    listed = client.get("/api/v1/memory/docs/proposals")
    assert listed.status_code == 200
    assert listed.json()["count"] >= 1

    denied = client.post(
        "/api/v1/memory/docs/proposals",
        json={
            "target_relative_path": "services/evil/hack.py",
            "title": "Nope",
            "rationale": "code write",
            "proposed_content": "print('no')\n",
        },
    )
    assert denied.status_code == 403
    assert denied.json()["error_code"] == "EIC_MEMORY_PATH_NOT_ALLOWLISTED"
