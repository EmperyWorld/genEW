"""Unit checks for P7.3 strict golden-loop smoke defaults (no live stack)."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path


def _load_smoke():
    path = (
        Path(__file__).resolve().parents[2]
        / "scripts"
        / "p4_golden_loop_smoke.py"
    )
    # Isolate env so module-level defaults match P7.3
    for key in list(os.environ):
        if key.startswith("EMPERY_SMOKE_"):
            del os.environ[key]
    spec = importlib.util.spec_from_file_location("p4_golden_loop_smoke", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_posthoc_default_off() -> None:
    mod = _load_smoke()
    assert mod.ALLOW_POSTHOC is False


def test_resolve_defaults_to_fresh_create(tmp_path: Path, monkeypatch) -> None:
    mod = _load_smoke()
    monkeypatch.setattr(mod, "EXISTING_SERVICE", "")
    monkeypatch.setattr(mod, "ROOT", tmp_path)
    name, enqueue = mod._resolve_service_name()
    assert enqueue is True
    assert name.startswith("p4_golden_")


def test_resolve_reuses_explicit_service(monkeypatch) -> None:
    mod = _load_smoke()
    monkeypatch.setattr(mod, "EXISTING_SERVICE", "p3_comp_live")
    name, enqueue = mod._resolve_service_name()
    assert name == "p3_comp_live"
    assert enqueue is False
