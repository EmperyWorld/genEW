"""
Scavenger - Python dependency file discovery
"""

import re
from pathlib import PurePosixPath
from typing import Dict, List, Optional, Set

DEPENDENCY_FILE_NAMES = (
    "requirements.txt",
    "requirements-dev.txt",
    "pyproject.toml",
    "setup.cfg",
    "Pipfile",
    "poetry.lock",
)

_PYPROJECT_DEP_RE = re.compile(
    r"^\s*[\"']([^\"']+)[\"']\s*,?\s*$",
    re.MULTILINE,
)


def find_requirements_fallback(
    archive_paths: List[str],
    group_root: str,
    project_root: Optional[str] = None,
) -> Optional[str]:
    """
    Find requirements.txt when pyproject.toml has no [project.dependencies].
    """
    archive_set = set(archive_paths)
    search_roots: List[str] = []

    if project_root:
        search_roots.append(project_root)
    if group_root and group_root not in search_roots:
        search_roots.append(group_root)

    parent = PurePosixPath(group_root.rstrip("/")).parent.as_posix()
    if parent and parent != ".":
        search_roots.append(f"{parent}/")

    for path in archive_paths:
        normalized = path.replace("\\", "/")
        if normalized.endswith("/api/requirements.txt") or normalized.endswith("api/requirements.txt"):
            api_root = str(PurePosixPath(normalized).parent) + "/"
            if api_root not in search_roots:
                search_roots.append(api_root)

    seen_roots: Set[str] = set()
    for root in search_roots:
        normalized = root if root.endswith("/") or not root else f"{root}/"
        if normalized in seen_roots:
            continue
        seen_roots.add(normalized)
        candidate = f"{normalized}requirements.txt"
        if candidate in archive_set:
            return candidate
    return None


def find_dependency_files_for_group(
    archive_paths: List[str],
    group_root: str,
    project_root: Optional[str] = None,
    file_contents: Optional[Dict[str, str]] = None,
    *,
    include_project_level: bool = False,
) -> List[str]:
    """
    Find dependency manifest paths relevant to a package group.

    By default only local manifests under the group root are attached. Project-
    level ``api/requirements.txt`` / root ``pyproject.toml`` must not be copied
    onto every package chip (identical pin-conflict noise). Pass
    ``include_project_level=True`` for archive-wide analysis only.
    """
    roots_to_check: List[str] = []
    if include_project_level and project_root:
        roots_to_check.append(project_root)
    if group_root and group_root not in roots_to_check:
        roots_to_check.append(group_root)

    if include_project_level:
        parent = PurePosixPath(group_root.rstrip("/")).parent.as_posix()
        if parent and parent != ".":
            roots_to_check.append(f"{parent}/")

    archive_set = set(archive_paths)
    found: List[str] = []
    seen: Set[str] = set()

    for root in roots_to_check:
        normalized = root if root.endswith("/") or not root else f"{root}/"
        for name in DEPENDENCY_FILE_NAMES:
            candidate = f"{normalized}{name}" if normalized else name
            if candidate in archive_set and candidate not in seen:
                seen.add(candidate)
                found.append(candidate)

    if include_project_level and not any(path.endswith("requirements.txt") for path in found):
        pyproject_path = next((path for path in found if path.endswith("pyproject.toml")), None)
        pyproject_empty = True
        if pyproject_path and file_contents:
            content = file_contents.get(pyproject_path, "")
            if content and parse_pyproject_dependency_specs(content):
                pyproject_empty = False
        if pyproject_empty:
            fallback = find_requirements_fallback(archive_paths, group_root, project_root)
            if fallback and fallback not in seen:
                found.append(fallback)

    return sorted(found)


def find_project_dependency_files(
    archive_paths: List[str],
    project_roots: List[str],
    file_contents: Optional[Dict[str, str]] = None,
) -> List[str]:
    """
    Collect unique project-level dependency manifests once per archive.
    """
    found: List[str] = []
    seen: Set[str] = set()
    for project_root in project_roots:
        for path in find_dependency_files_for_group(
            archive_paths,
            group_root=project_root,
            project_root=project_root,
            file_contents=file_contents,
            include_project_level=True,
        ):
            if path not in seen:
                seen.add(path)
                found.append(path)
    return found


def parse_requirements_preview(content: str, limit: int = 12) -> List[str]:
    """
    Extract package names from requirements.txt-like content.
    """
    packages: List[str] = []
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("-"):
            continue
        token = stripped.split("==")[0].split(">=")[0].split("<=")[0].split("[")[0].strip()
        if token:
            packages.append(token)
        if len(packages) >= limit:
            break
    return packages


def _split_pyproject_dependency(raw: str) -> tuple[str, str]:
    token = raw.strip().split(";")[0].strip()
    match = re.match(
        r"^([a-zA-Z0-9][a-zA-Z0-9._-]*(?:\[[^\]]+\])?)\s*(.*)$",
        token,
    )
    if not match:
        return "", ""
    name = match.group(1).split("[")[0].strip().lower()
    spec = match.group(2).strip()
    return name, spec


def _normalize_pyproject_dependency(raw: str) -> str:
    name, _spec = _split_pyproject_dependency(raw)
    return name


def parse_pyproject_dependencies(content: str, limit: int = 12) -> List[str]:
    """
    Extract package names from [project.dependencies] in pyproject.toml.
    """
    packages: List[str] = []
    try:
        import tomllib

        data = tomllib.loads(content)
        raw_deps = data.get("project", {}).get("dependencies", [])
        for item in raw_deps:
            if not isinstance(item, str):
                continue
            name = _normalize_pyproject_dependency(item)
            if name:
                packages.append(name)
            if len(packages) >= limit:
                return packages
        return packages
    except Exception:
        pass

    # Regex fallback when tomllib unavailable or TOML is invalid
    section_match = re.search(
        r"\[project\](.*?)(?:\n\[|\Z)",
        content,
        re.DOTALL,
    )
    if not section_match:
        return packages

    deps_match = re.search(
        r"dependencies\s*=\s*\[(.*?)\]",
        section_match.group(1),
        re.DOTALL,
    )
    if not deps_match:
        return packages

    for match in _PYPROJECT_DEP_RE.finditer(deps_match.group(1)):
        name = _normalize_pyproject_dependency(match.group(1))
        if name:
            packages.append(name)
        if len(packages) >= limit:
            break
    return packages


def parse_pyproject_dependency_specs(content: str, limit: int = 500) -> Dict[str, str]:
    """
    Extract package name → version spec from [project.dependencies] in pyproject.toml.
    """
    specs: Dict[str, str] = {}
    try:
        import tomllib

        data = tomllib.loads(content)
        raw_deps = data.get("project", {}).get("dependencies", [])
        for item in raw_deps:
            if not isinstance(item, str):
                continue
            name, spec = _split_pyproject_dependency(item)
            if name:
                specs[name] = spec
            if len(specs) >= limit:
                return specs
        return specs
    except Exception:
        pass

    section_match = re.search(
        r"\[project\](.*?)(?:\n\[|\Z)",
        content,
        re.DOTALL,
    )
    if not section_match:
        return specs

    deps_match = re.search(
        r"dependencies\s*=\s*\[(.*?)\]",
        section_match.group(1),
        re.DOTALL,
    )
    if not deps_match:
        return specs

    for match in _PYPROJECT_DEP_RE.finditer(deps_match.group(1)):
        name, spec = _split_pyproject_dependency(match.group(1))
        if name:
            specs[name] = spec
        if len(specs) >= limit:
            break
    return specs


def merge_packages_from_dependency_files(
    dependency_files: Optional[List[Dict[str, str]]],
    limit: int = 200,
) -> List[str]:
    """
    Merge unique package names from requirements.txt and pyproject.toml manifests.
    """
    if not dependency_files:
        return []

    merged: List[str] = []
    seen: Set[str] = set()

    for file in dependency_files:
        path = str(file.get("path", ""))
        content = str(file.get("content", ""))
        if not content:
            continue
        packages: List[str] = []
        if path.endswith("requirements.txt") or path.endswith("requirements-dev.txt"):
            packages = parse_requirements_preview(content, limit=limit)
        elif path.endswith("pyproject.toml"):
            packages = list(parse_pyproject_dependency_specs(content, limit=limit).keys())
        else:
            continue
        for package in packages:
            normalized = package.lower()
            if normalized in seen:
                continue
            seen.add(normalized)
            merged.append(package)
        if len(merged) >= limit:
            break
    return merged


def load_dependency_preview(
    dependency_paths: List[str],
    file_contents: Dict[str, str],
) -> Dict[str, List[str]]:
    """
    Build a preview map of dependency files to package names.
    """
    preview: Dict[str, List[str]] = {}
    for path in dependency_paths:
        content = file_contents.get(path, "")
        if not content:
            continue
        if path.endswith("requirements.txt") or path.endswith("requirements-dev.txt"):
            preview[path] = parse_requirements_preview(content)
        elif path.endswith("pyproject.toml"):
            packages = parse_pyproject_dependencies(content)
            preview[path] = packages if packages else ["pyproject.toml"]
        else:
            preview[path] = [PurePosixPath(path).name]
    return preview
