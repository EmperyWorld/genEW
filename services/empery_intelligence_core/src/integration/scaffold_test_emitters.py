"""Load capsule test-file emitters from scaffold_emitters/ (outside src/).

Keeps FakeNervas / monkeypatch strings out of ``services/**/src`` while Hands
still emits them into newborn ``services/{name}/tests/`` only.
"""

from __future__ import annotations

from pathlib import Path

_EMITTERS = Path(__file__).resolve().parents[2] / "scaffold_emitters"


def _render(name: str, **fields: str) -> str:
    path = _EMITTERS / name
    return path.read_text(encoding="utf-8").format(**fields)


def companion_domain_test(service_name: str, err_prefix: str) -> str:
    return _render(
        "companion_domain_test.py.tmpl",
        service_name=service_name,
        err_prefix=err_prefix,
    )


def site_studio_api_test(service_name: str) -> str:
    return _render("site_studio_api_test.py.tmpl", service_name=service_name)


def presentation_ai_api_test(service_name: str) -> str:
    return _render("presentation_ai_api_test.py.tmpl", service_name=service_name)
