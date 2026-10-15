"""Brain content-transfer detection + response materialize helpers."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from core.protos.empery.assembly.v1 import assembly_pb2
from services.empery_intelligence_core.src.integration.grpc_assembler_adapter import (
    _written_artifacts_from_response,
)
from services.empery_intelligence_core.src.integration.grpc_workspace_map import (
    needs_artifact_content_transfer,
)


@pytest.fixture(autouse=True)
def _clear_transfer_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EIC_ASSEMBLER_CONTENT_TRANSFER", raising=False)
    monkeypatch.delenv("EIC_ASSEMBLER_SHARED_FS", raising=False)


def test_needs_transfer_default_off(tmp_path: Path) -> None:
    assert needs_artifact_content_transfer(tmp_path) is False


def test_needs_transfer_content_transfer_flag(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("EIC_ASSEMBLER_CONTENT_TRANSFER", "1")
    assert needs_artifact_content_transfer(tmp_path) is True
    monkeypatch.setenv("EIC_ASSEMBLER_CONTENT_TRANSFER", "0")
    assert needs_artifact_content_transfer(tmp_path) is False


def test_needs_transfer_shared_fs_off(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("EIC_ASSEMBLER_SHARED_FS", "0")
    assert needs_artifact_content_transfer(tmp_path) is True
    monkeypatch.setenv("EIC_ASSEMBLER_SHARED_FS", "1")
    assert needs_artifact_content_transfer(tmp_path) is False


def test_written_artifacts_from_response_and_materialize(tmp_path: Path) -> None:
    from core.assembly.artifact_bundle import materialize_written_artifacts

    body = b"export const X = 1;\n"
    import hashlib

    sha = hashlib.sha256(body).hexdigest()
    resp = assembly_pb2.AssemblyResponse(
        ok=True,
        service_name="xfer",
        written=[
            assembly_pb2.WrittenArtifact(
                relpath="apps/empery_desktop/src/shell/mounts/xfer.tsx",
                kind="tsx",
                sha256=sha,
                content=body,
            )
        ],
    )
    arts = _written_artifacts_from_response(resp)
    assert arts[0]["content"] == body
    written = materialize_written_artifacts(tmp_path, arts)
    assert written == ["apps/empery_desktop/src/shell/mounts/xfer.tsx"]
    assert (
        tmp_path / "apps/empery_desktop/src/shell/mounts/xfer.tsx"
    ).read_bytes() == body
