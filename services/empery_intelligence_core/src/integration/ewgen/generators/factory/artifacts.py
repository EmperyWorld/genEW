"""
Factory run artifact workspaces — on-disk sandboxes for generated files.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Dict, List

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_RUNS_DIR = PROJECT_ROOT / "data" / "factory-runs"

VERIFY_DEPENDENCY_PACKAGES = (
    "framer-motion",
    "lucide-react",
    "@tanstack/react-query",
)

SANDBOX_TSCONFIG = {
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": True,
        "skipLibCheck": True,
        "noEmit": True,
        "isolatedModules": True,
        "esModuleInterop": True,
        "jsx": "react-jsx",
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules"],
}

SANDBOX_JEST_CONFIG_TEMPLATE = """/** @type {import('jest').Config} */
module.exports = {
  preset: '__PRESET_PATH__',
  testEnvironment: 'node',
  rootDir: '__WORKSPACE_PATH__',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  transform: {
    '^.+\\\\.tsx?$': ['__PRESET_PATH__', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
"""

SANDBOX_PACKAGE_JSON = {
    "name": "factory-sandbox",
    "private": True,
    "type": "module",
}


def get_factory_runs_root() -> Path:
    configured = os.getenv("EWGEN_FACTORY_RUNS_DIR", "").strip()
    if configured:
        path = Path(configured)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path
    return DEFAULT_RUNS_DIR


def get_run_workspace(run_id: str) -> Path:
    return get_factory_runs_root() / run_id


def materialize_run_files(
    run_id: str,
    files: List[Dict[str, str]],
    *,
    overwrite: bool = True,
) -> Path:
    """
    Write generated file payloads into the run workspace.

    Each file dict must contain ``path`` and ``content`` keys.
    """
    workspace = get_run_workspace(run_id)
    if workspace.exists() and overwrite:
        shutil.rmtree(workspace)
    workspace.mkdir(parents=True, exist_ok=True)

    for item in files:
        rel = str(item.get("path", "")).replace("\\", "/").lstrip("/")
        if not rel:
            continue
        target = workspace / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(str(item.get("content", "")), encoding="utf-8")

    return workspace


def _dependency_path_map(workspace: Path, project_root: Path) -> Dict[str, List[str]]:
    node_modules = project_root / "node_modules"
    rel_root = Path(os.path.relpath(node_modules, workspace)).as_posix()
    paths: Dict[str, List[str]] = {}
    for pkg in VERIFY_DEPENDENCY_PACKAGES:
        target = node_modules / pkg
        if target.is_dir():
            paths[pkg] = [f"{rel_root}/{pkg}"]
    return paths


def ensure_typescript_scaffold(
    workspace: Path, *, project_root: Path = PROJECT_ROOT
) -> None:
    """Ensure minimal TS/Jest tooling files exist for verification."""
    from .verify_shims import ensure_factory_verify_shims

    workspace.mkdir(parents=True, exist_ok=True)
    src_dir = workspace / "src"
    src_dir.mkdir(parents=True, exist_ok=True)
    ensure_factory_verify_shims(workspace)

    module_paths = _dependency_path_map(workspace, project_root)
    tsconfig_path = workspace / "tsconfig.json"
    tsconfig = {
        **SANDBOX_TSCONFIG,
        "compilerOptions": {
            **SANDBOX_TSCONFIG["compilerOptions"],
            "typeRoots": [str(project_root / "node_modules" / "@types")],
            "types": ["jest", "node"],
            "paths": module_paths,
        },
    }
    tsconfig_path.write_text(
        json.dumps(tsconfig, indent=2),
        encoding="utf-8",
    )

    package_path = workspace / "package.json"
    if package_path.is_file():
        package_path.unlink()

    jest_path = workspace / "jest.config.cjs"
    if not jest_path.is_file():
        preset_path = project_root / "node_modules" / "ts-jest"
        jest_content = SANDBOX_JEST_CONFIG_TEMPLATE.replace(
            "__PRESET_PATH__",
            str(preset_path).replace("\\", "/"),
        ).replace(
            "__WORKSPACE_PATH__",
            str(workspace.resolve()).replace("\\", "/"),
        )
        jest_path.write_text(jest_content, encoding="utf-8")


def detect_artifact_stack(workspace: Path) -> str:
    """Return primary stack hint: typescript, python, or unknown."""
    if not workspace.is_dir():
        return "unknown"
    if list(workspace.rglob("*.py")):
        return "python"
    if list(workspace.rglob("*.ts")) or list(workspace.rglob("*.tsx")):
        return "typescript"
    return "unknown"


def has_typescript_tests(workspace: Path) -> bool:
    patterns = ("*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx")
    for pattern in patterns:
        if list(workspace.rglob(pattern)):
            return True
    return False


def has_python_tests(workspace: Path) -> bool:
    return bool(list(workspace.rglob("test_*.py")))


def cleanup_run_workspace(run_id: str) -> None:
    workspace = get_run_workspace(run_id)
    if workspace.is_dir():
        shutil.rmtree(workspace)


def workspace_exists(run_id: str) -> bool:
    return get_run_workspace(run_id).is_dir()
