"""Audit log read API tests."""

from pathlib import Path

from fastapi.testclient import TestClient

from services.empery_control_center_api.tests.conftest import build_test_app


def test_audit_missing_file_ok(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        r = client.get("/api/v1/audit")
        assert r.status_code == 200
        body = r.json()
        assert body["source_exists"] is False
        assert body["entries"] == []
        assert body["count"] == 0


def test_audit_reads_jsonl(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        # ensure layout via health
        client.get("/api/v1/health")
        audit = tmp_path / "orchestration" / "audit" / "events.jsonl"
        audit.parent.mkdir(parents=True, exist_ok=True)
        audit.write_text(
            '{"timestamp":"2026-07-20T10:00:00Z","event":"agent.done","summary":"ok"}\n'
            "not-json\n"
            '{"event":"agent.start","message":"begin"}\n',
            encoding="utf-8",
        )
        r = client.get("/api/v1/audit?limit=10")
        assert r.status_code == 200
        body = r.json()
        assert body["source_exists"] is True
        assert body["count"] == 2
        assert body["entries"][0]["event"] == "agent.done"
        assert body["entries"][0]["category"] == "intelligence"


def test_audit_tags_cursor_hooks(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        client.get("/api/v1/health")
        audit = tmp_path / "orchestration" / "audit" / "events.jsonl"
        audit.parent.mkdir(parents=True, exist_ok=True)
        audit.write_text(
            '{"timestamp":"2026-07-20T10:00:00Z","event":"afterFileEdit","file_path":"x.py"}\n'
            '{"timestamp":"2026-07-20T10:00:01Z","event":"task.created","summary":"ok"}\n'
            '{"timestamp":"2026-07-20T10:00:02Z","event":"beforeShellExecution","command":"ls"}\n'
            '{"timestamp":"2026-07-20T10:00:03Z","event":"AFTERFILEEDIT","context":"Style & Contract: x"}\n',
            encoding="utf-8",
        )
        r = client.get("/api/v1/audit?limit=10")
        assert r.status_code == 200
        by_event = {e["event"]: e["category"] for e in r.json()["entries"]}
        assert by_event["afterFileEdit"] == "audit_hook"
        assert by_event["beforeShellExecution"] == "audit_hook"
        assert by_event["AFTERFILEEDIT"] == "audit_hook"
        assert by_event["task.created"] == "intelligence"

        excluded = client.get("/api/v1/audit?limit=10&exclude_category=audit_hook")
        assert excluded.status_code == 200
        events = [e["event"] for e in excluded.json()["entries"]]
        assert events == ["task.created"]
        assert all(e["category"] != "audit_hook" for e in excluded.json()["entries"])

        no_hooks = client.get("/api/v1/audit?limit=10&include_hooks=false")
        assert no_hooks.status_code == 200
        assert [e["event"] for e in no_hooks.json()["entries"]] == ["task.created"]

        with_hooks = client.get("/api/v1/audit?limit=10&include_hooks=true")
        assert with_hooks.status_code == 200
        assert "afterFileEdit" in {e["event"] for e in with_hooks.json()["entries"]}
