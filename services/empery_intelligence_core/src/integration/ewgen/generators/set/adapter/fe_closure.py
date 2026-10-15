"""
SET Adapter — expand incomplete FE slices from source archive import closure
"""

from __future__ import annotations

import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional, Set, Tuple

from generators.importer.import_graph import CODE_EXTENSIONS, IMPORT_SPEC_RE
from generators.importer.naming import to_kebab
from generators.importer.path_rewriter import detect_src_alias_prefix, rewrite_import_paths
from generators.importer.slice_completeness import scan_fe_slice_missing
from generators.importer.source_import_graph import resolve_source_import
from generators.set.paths import project_root

_MAX_CLOSURE_FILES = 250
_MAX_CLOSURE_ITERATIONS = 12


def _detect_language(path: str) -> str:
    if path.endswith(".tsx"):
        return "typescript"
    if path.endswith((".ts", ".mts")):
        return "typescript"
    if path.endswith((".jsx", ".js", ".mjs", ".cjs")):
        return "javascript"
    return "typescript"


def load_archive_contents(source_ref: str) -> Dict[str, str]:
    """
    Load text file contents from a zip archive referenced by Fortune Seaker sourceRef.
    """
    ref = source_ref.strip().replace("\\", "/")
    candidates = [
        project_root() / ref,
        Path(ref),
    ]
    zip_path: Optional[Path] = None
    for candidate in candidates:
        if candidate.is_file() and candidate.suffix.lower() == ".zip":
            zip_path = candidate
            break
    if zip_path is None:
        return {}

    contents: Dict[str, str] = {}
    with zipfile.ZipFile(zip_path, "r") as archive:
        for name in archive.namelist():
            if name.endswith("/"):
                continue
            suffix = PurePosixPath(name).suffix.lower()
            if suffix not in CODE_EXTENSIONS and suffix not in {".json", ".css", ".scss", ".svg"}:
                continue
            try:
                raw = archive.read(name)
            except (KeyError, RuntimeError):
                continue
            try:
                contents[name.replace("\\", "/")] = raw.decode("utf-8")
            except UnicodeDecodeError:
                continue
    return contents


def _bundle_marker(kebab: str) -> str:
    return f"src/imported/{kebab}/"


def bundle_path_to_archive(bundle_path: str, kebab: str) -> Optional[str]:
    marker = _bundle_marker(kebab)
    normalized = bundle_path.replace("\\", "/").lstrip("/")
    if marker in normalized:
        return normalized.split(marker, 1)[1]
    if normalized.startswith(marker):
        return normalized[len(marker):]
    return None


def archive_path_to_bundle(
    archive_path: str,
    kebab: str,
    archive_fe_prefix: str = "",
) -> str:
    normalized = archive_path.replace("\\", "/").lstrip("/")
    prefix = archive_fe_prefix.replace("\\", "/").lstrip("/")
    if prefix and not prefix.endswith("/"):
        prefix = f"{prefix}/"
    if prefix and normalized.startswith(prefix):
        normalized = normalized[len(prefix):]
    if normalized.startswith("src/"):
        normalized = normalized[4:]
    return f"{_bundle_marker(kebab)}{normalized}"


def _path_exists_in_index(target: str, indexed: Set[str]) -> Optional[str]:
    normalized = PurePosixPath(target).as_posix()
    candidates = [
        normalized,
        f"{normalized}.ts",
        f"{normalized}.tsx",
        f"{normalized}.js",
        f"{normalized}.jsx",
        f"{normalized}/index.ts",
        f"{normalized}/index.tsx",
        f"{normalized}/index.js",
    ]
    for candidate in candidates:
        if candidate in indexed:
            return candidate
    return None


def _resolve_spec_to_archive_path(
    importer_bundle_path: str,
    spec: str,
    kebab: str,
) -> Optional[str]:
    imported_prefix = f"@imported/{kebab}/"
    archive_importer = bundle_path_to_archive(importer_bundle_path, kebab)
    if not archive_importer:
        return None

    if spec.startswith(imported_prefix):
        return spec[len(imported_prefix):].lstrip("/")

    if spec.startswith("."):
        base = PurePosixPath(archive_importer).parent
        target = (base / spec).as_posix()
        parts: List[str] = []
        for segment in target.split("/"):
            if segment in ("", "."):
                continue
            if segment == "..":
                if parts:
                    parts.pop()
                continue
            parts.append(segment)
        return "/".join(parts)

    resolution = resolve_source_import(spec, archive_importer, set())
    if resolution is False:
        base = detect_src_alias_prefix(archive_importer)
        if spec.startswith("@/"):
            return f"{base}/{spec[2:].lstrip('/')}"
    if resolution is True:
        return None
    return None


def _index_bundle_paths(files: List[Dict[str, str]]) -> Set[str]:
    indexed: Set[str] = set()
    for item in files:
        path = str(item.get("path", "")).replace("\\", "/")
        if path:
            indexed.add(path)
    return indexed


def _index_archive_paths(archive: Dict[str, str]) -> Set[str]:
    return set(archive.keys())


def _infer_bundle_kebab(files: List[Dict[str, str]]) -> Optional[str]:
    for item in files:
        path = str(item.get("path", "")).replace("\\", "/").lstrip("/")
        marker = "src/imported/"
        if path.startswith(marker):
            suffix = path[len(marker):]
            kebab = suffix.split("/", 1)[0]
            if kebab:
                return kebab
    return None


def _detect_archive_fe_prefix(archive: Dict[str, str]) -> str:
    for key in archive:
        normalized = key.replace("\\", "/")
        marker = "/frontend/src/"
        if marker in normalized:
            return normalized.split(marker, 1)[0] + "/frontend/"
    return ""


def _find_archive_file(
    archive_target: str,
    archive_index: Set[str],
    archive_fe_prefix: str,
) -> Optional[str]:
    normalized = archive_target.replace("\\", "/").lstrip("/")
    candidates = [
        f"{archive_fe_prefix}{normalized}",
        f"{archive_fe_prefix}src/{normalized}",
        normalized,
        f"src/{normalized}",
    ]
    if archive_fe_prefix and not normalized.startswith("src/"):
        candidates.insert(0, f"{archive_fe_prefix}src/{normalized}")
    for candidate in candidates:
        resolved = _path_exists_in_index(candidate, archive_index)
        if resolved:
            return resolved
    return None


def expand_fe_closure(
    fe_files: List[Dict[str, str]],
    module_name: str,
    source_ref: Optional[str],
    *,
    entry_point: Optional[str] = None,
    archive_fe_prefix: Optional[str] = None,
    max_files: int = _MAX_CLOSURE_FILES,
) -> Dict[str, Any]:
    """
    Pull missing local imports into the FE bundle from the original zip archive.
    """
    kebab = _infer_bundle_kebab(fe_files) or to_kebab(module_name)
    archive = load_archive_contents(source_ref) if source_ref else {}
    fe_prefix = (archive_fe_prefix or _detect_archive_fe_prefix(archive)).replace("\\", "/")
    if fe_prefix and not fe_prefix.endswith("/"):
        fe_prefix = f"{fe_prefix}/"
    if not archive:
        return {
            "expanded": False,
            "reason": "archive_unavailable",
            "sourceRef": source_ref,
            "addedFiles": [],
            "addedCount": 0,
            "files": fe_files,
            "sliceScan": scan_fe_slice_missing(fe_files, entry_path=entry_point, module_name=module_name),
        }

    files = [dict(item) for item in fe_files]
    bundle_index = _index_bundle_paths(files)
    archive_index = _index_archive_paths(archive)
    added: List[str] = []
    iterations = 0

    while iterations < _MAX_CLOSURE_ITERATIONS and len(added) < max_files:
        iterations += 1
        slice_scan = scan_fe_slice_missing(
            files,
            entry_path=entry_point,
            module_name=module_name,
        )
        missing_specs = list(slice_scan.get("criticalMissing") or slice_scan.get("missing") or [])
        if not missing_specs:
            break

        entry = slice_scan.get("entryPoint") or entry_point
        if not entry:
            break

        pulled_this_round = 0
        for spec in missing_specs:
            archive_target = _resolve_spec_to_archive_path(str(entry), spec, kebab)
            if not archive_target:
                for path in sorted(bundle_index):
                    if not path.endswith((".ts", ".tsx", ".js", ".jsx")):
                        continue
                    archive_target = _resolve_spec_to_archive_path(path, spec, kebab)
                    if archive_target:
                        break
            if not archive_target:
                continue

            resolved_archive = _find_archive_file(
                archive_target,
                archive_index,
                fe_prefix,
            )
            if not resolved_archive:
                continue

            bundle_path = archive_path_to_bundle(resolved_archive, kebab, fe_prefix)
            if bundle_path in bundle_index:
                continue

            content = archive.get(resolved_archive, "")
            if not content:
                continue

            rel_archive = resolved_archive
            if fe_prefix and rel_archive.startswith(fe_prefix):
                rel_archive = rel_archive[len(fe_prefix):]
            rewritten = rewrite_import_paths(
                content,
                rel_archive,
                module_name,
                target_base=f"@imported/{kebab}",
            )
            rewritten = rewritten.replace(
                f"@imported/{kebab}/src/",
                f"@imported/{kebab}/",
            )
            files.append({
                "path": bundle_path,
                "content": rewritten,
                "language": _detect_language(bundle_path),
            })
            bundle_index.add(bundle_path)
            added.append(bundle_path)
            pulled_this_round += 1
            if len(added) >= max_files:
                break

        if pulled_this_round == 0:
            break

    final_scan = scan_fe_slice_missing(
        files,
        entry_path=entry_point or slice_scan.get("entryPoint"),
        module_name=module_name,
    )

    return {
        "expanded": len(added) > 0,
        "sourceRef": source_ref,
        "addedFiles": added,
        "addedCount": len(added),
        "iterations": iterations,
        "files": files,
        "sliceScan": final_scan,
        "archiveFileCount": len(archive),
        "bundleKebab": kebab,
        "archiveFePrefix": fe_prefix or None,
    }
