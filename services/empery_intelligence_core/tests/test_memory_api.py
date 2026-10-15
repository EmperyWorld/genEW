"""HTTP API tests for /api/v1/memory/*."""

from __future__ import annotations


def test_ingest_retrieve_and_context(client) -> None:
    arch = client.post(
        "/api/v1/memory/atoms/ingest/architect",
        json={
            "service_name": "demo_svc",
            "title": "Use SQLite atoms",
            "decision_summary": "Persist Atoms in SQLite with embedding stub",
            "constraints": ["no chromadb"],
            "design_paths": ["designs/eic_memory_design.md"],
        },
    )
    assert arch.status_code == 200, arch.text
    atom_id = arch.json()["id"]
    assert arch.json()["kind"] == "architect_decision"

    ver = client.post(
        "/api/v1/memory/atoms/ingest/verifier",
        json={
            "service_name": "demo_svc",
            "title": "Memory verify",
            "verify_status": "PASSED",
            "summary": "Atom store and context pack verified",
            "violations": [],
            "required_fixes": [],
        },
    )
    assert ver.status_code == 200, ver.text

    got = client.get(f"/api/v1/memory/atoms/{atom_id}")
    assert got.status_code == 200
    assert got.json()["title"] == "Use SQLite atoms"

    listed = client.get("/api/v1/memory/atoms", params={"service_name": "demo_svc"})
    assert listed.status_code == 200
    assert listed.json()["count"] >= 2

    retrieve = client.post(
        "/api/v1/memory/retrieve",
        json={"query": "sqlite atoms embedding", "service_name": "demo_svc", "limit": 8},
    )
    assert retrieve.status_code == 200, retrieve.text
    assert len(retrieve.json()["results"]) >= 1

    ctx = client.post(
        "/api/v1/memory/context",
        json={
            "query": "sqlite memory atoms",
            "stage": "plan",
            "service_name": "demo_svc",
        },
    )
    assert ctx.status_code == 200, ctx.text
    body = ctx.json()
    assert "EIC Memory Context" in body["formatted_context"]
    assert body["atoms"]


def test_not_found_error_code(client) -> None:
    resp = client.get("/api/v1/memory/atoms/00000000-0000-0000-0000-000000000001")
    assert resp.status_code == 404
    assert resp.json()["error_code"] == "EIC_MEMORY_NOT_FOUND"


def test_soft_archive(client) -> None:
    created = client.post(
        "/api/v1/memory/atoms",
        json={
            "kind": "context_note",
            "title": "note",
            "body": "a contextual fact",
            "provenance": {"source": "human", "service_name": "demo"},
        },
    )
    assert created.status_code == 200
    atom_id = created.json()["id"]
    deleted = client.delete(f"/api/v1/memory/atoms/{atom_id}")
    assert deleted.status_code == 204
    missing = client.get(f"/api/v1/memory/atoms/{atom_id}")
    assert missing.status_code == 404
