# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Born-Ready Neutral Contract helpers — soft product env walls and dangling
# ewgen_bundle import detection after atomize/materialize.
# Invariants:
# - Never invents missing package bodies; only softens _require_env and reports.
# - Applied to shell module copies (and optional atom write), not monorepo EliteEW.
# Related:
# - generators/atomizer/import_rewrite.py
# - generators/synthesis/backend_mount.py
# - documentation/platform/EWGEN-MONOREPO-INTEGRATION.md (Neutral Contract)
# ---

"""Neutral Contract sanitizers for Born-Ready shells."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

_REQUIRE_ENV_DEF_RE = re.compile(
    r"^def _require_env\(key:\s*str\)\s*->\s*str:\n"
    r"(?:^[ \t]+.*\n)+",
    re.MULTILINE,
)

_SOFT_REQUIRE_ENV = (
    "def _require_env(key: str) -> str:\n"
    '    """Born-Ready Neutral Contract: soft default when product env is unset."""\n'
    "    val = os.environ.get(key)\n"
    '    if val is None or str(val).strip() == "":\n'
    '        return os.environ.get(f"EWGEN_SHELL_{key}") or f"shell-{key.lower()}"\n'
    "    return val.strip()\n"
)

_EWGEN_IMPORT_RE = re.compile(
    r"^\s*(?:from|import)\s+(ewgen_bundle(?:\.[A-Za-z_][\w]*)*)",
    re.MULTILINE,
)


def soften_require_env_source(content: str) -> tuple[str, bool]:
    """
    Replace strict ``_require_env`` with soft shell defaults.

    Returns (new_content, changed).
    """
    if "def _require_env(" not in content:
        return content, False
    if "Born-Ready Neutral Contract: soft default" in content:
        return content, False
    new_content, n = _REQUIRE_ENV_DEF_RE.subn(_SOFT_REQUIRE_ENV, content, count=1)
    if n == 0:
        return content, False
    if "import os" not in new_content and "from os " not in new_content:
        new_content = "import os\n" + new_content
    return new_content, True


_EWGEN_FROM_IMPORT_RE = re.compile(
    r"^\s*from\s+(ewgen_bundle(?:\.[A-Za-z_][\w]*)*)\s+import\s+(.+)$",
    re.MULTILINE,
)


def _parse_imported_names(clause: str) -> list[str]:
    names: list[str] = []
    for part in clause.split(","):
        token = part.strip()
        if not token or token.startswith("("):
            token = token.lstrip("(").strip()
        if not token or token == ")":
            continue
        # drop parenthetical multi-line leftovers
        token = token.split("#")[0].strip().rstrip(")")
        if not token:
            continue
        base = token.split(" as ")[0].strip()
        if base.isidentifier():
            names.append(base)
    return names


def stub_missing_ewgen_bundle_imports(root: Path) -> int:
    """
    Create minimal stub modules for dangling ``ewgen_bundle.*`` imports.

    Incomplete scavenger catalogs often keep package ``__init__.py`` re-exports
    without leaf modules (e.g. ``models/database_models.py``). Born-Ready shells
    need importable stubs so APIRouter modules can load; stubs are not product
    behavior.
    """
    base = Path(root)
    if not base.is_dir():
        return 0
    needed: dict[str, set[str]] = {}
    for py_path in base.rglob("*.py"):
        if "__pycache__" in py_path.parts:
            continue
        try:
            text = py_path.read_text(encoding="utf-8")
        except OSError:
            continue
        for match in _EWGEN_FROM_IMPORT_RE.finditer(text):
            spec = match.group(1)
            if _spec_resolves(base, spec):
                continue
            needed.setdefault(spec, set()).update(
                _parse_imported_names(match.group(2))
            )
        for match in _EWGEN_IMPORT_RE.finditer(text):
            spec = match.group(1)
            if not _spec_resolves(base, spec):
                needed.setdefault(spec, set())

    written = 0
    for spec, names in sorted(needed.items()):
        rel = spec.replace(".", "/")
        module_file = base / f"{rel}.py"
        package_init = base / rel / "__init__.py"
        if module_file.is_file() or package_init.is_file():
            continue
        module_file.parent.mkdir(parents=True, exist_ok=True)
        # Ensure parent packages exist
        parts = spec.split(".")
        for i in range(1, len(parts)):
            init = base.joinpath(*parts[:i]) / "__init__.py"
            if not init.exists() and not (base.joinpath(*parts[:i]).with_suffix(".py")).exists():
                init.parent.mkdir(parents=True, exist_ok=True)
                if not init.is_file():
                    init.write_text(
                        '"""Born-Ready Neutral Contract package stub."""\n',
                        encoding="utf-8",
                    )
                    written += 1
        body_lines = [
            '"""Born-Ready Neutral Contract stub — missing scavenger leaf."""',
            "from __future__ import annotations",
            "",
        ]
        for name in sorted(names):
            body_lines.append(f"class {name}:  # noqa: D101")
            body_lines.append("    pass")
            body_lines.append("")
        if not names:
            body_lines.append("# import-only stub")
            body_lines.append("")
        module_file.write_text("\n".join(body_lines), encoding="utf-8")
        written += 1
    return written


def neutralize_atom_tree(root: Path) -> dict[str, int]:
    """Walk ``root`` Python files and soft-rewrite ``_require_env`` in place."""
    changed = 0
    scanned = 0
    base = Path(root)
    if not base.is_dir():
        return {"scanned": 0, "changed": 0, "stubs": 0}
    for py_path in base.rglob("*.py"):
        if "__pycache__" in py_path.parts:
            continue
        scanned += 1
        try:
            text = py_path.read_text(encoding="utf-8")
        except OSError:
            continue
        new_text, did = soften_require_env_source(text)
        if not did:
            continue
        try:
            py_path.write_text(new_text, encoding="utf-8")
            changed += 1
        except OSError:
            continue
    stubs = stub_missing_ewgen_bundle_imports(base)
    return {"scanned": scanned, "changed": changed, "stubs": stubs}


def dangling_ewgen_bundle_imports(root: Path) -> list[str]:
    """
    Return ``ewgen_bundle…`` import specs that have no matching package on disk.

    Spec ``ewgen_bundle.<any_slug>.…`` requires the matching path under the
    atom root (or package ``__init__.py``). Slug-agnostic — not tied to a
    single product module.
    """
    base = Path(root)
    if not base.is_dir():
        return []
    hits: list[str] = []
    seen: set[str] = set()
    for py_path in base.rglob("*.py"):
        try:
            text = py_path.read_text(encoding="utf-8")
        except OSError:
            continue
        for match in _EWGEN_IMPORT_RE.finditer(text):
            spec = match.group(1)
            if spec in seen:
                continue
            if _spec_resolves(base, spec):
                seen.add(spec)
                continue
            seen.add(spec)
            hits.append(spec)
    return sorted(hits)


def _spec_resolves(atom_root: Path, spec: str) -> bool:
    rel = spec.replace(".", "/")
    candidates = (
        atom_root / f"{rel}.py",
        atom_root / rel / "__init__.py",
    )
    return any(c.is_file() for c in candidates)


def dangling_import_penalty(root: Path, *, cap: int = 40) -> int:
    """Ranking penalty points for unresolved Neutral Contract imports."""
    n = len(dangling_ewgen_bundle_imports(root))
    return min(cap, n * 2)


def collect_require_env_keys(paths: Iterable[Path]) -> list[str]:
    """Scan Python sources for ``_require_env('KEY')`` / ``_require_env_int``."""
    key_re = re.compile(r"_require_env(?:_int)?\(\s*['\"]([A-Z0-9_]+)['\"]\s*\)")
    keys: set[str] = set()
    for path in paths:
        try:
            text = Path(path).read_text(encoding="utf-8")
        except OSError:
            continue
        keys.update(key_re.findall(text))
    return sorted(keys)
