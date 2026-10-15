"""
EWGen — auto-generate module documentation (README, ARCHITECTURE).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _count_layer_files(files: List[Dict[str, Any]], prefix: str) -> int:
    return sum(
        1 for item in files
        if str(item.get("path", "")).replace("\\", "/").startswith(prefix)
    )


def generate_module_readme(
    *,
    module_name: str,
    module_id: str,
    frontend_file_count: int = 0,
    backend_file_count: int = 0,
    entry_point: Optional[str] = None,
    source_ref: Optional[str] = None,
) -> str:
    """Generate README.md for SET module slot."""
    entry = entry_point or "frontend/src (auto-detect)"
    source_line = f"\n- **Source:** `{source_ref}`" if source_ref else ""
    return f"""# {module_name}

SET module slot `{module_id}` — imported via EWGen (Fortune Seaker / Scavenger / Warsmith).

## Quick start

1. Run SET Adapter **Transform** to materialize staging.
2. Install into SET runtime: `POST /api/set/install-from-staging` with `moduleId={module_id}`.
3. Open UI: `/app/{module_id}`

## Layout

| Layer | Files |
|-------|------:|
| Frontend | {frontend_file_count} |
| Backend | {backend_file_count} |

- **Entry point:** `{entry}`
- **API prefix:** `/api/modules/{module_id}/`
- **FE proxy env:** `VITE_MODULE_API_BASE=/api/modules/{module_id}/proxy`{source_line}

## Commands

```bash
# Adapter pipeline (from EWGen UI or API)
POST /api/set/adapter/pipeline
{{ "warsmithCatalogId": "<catalog-id>", "runTransform": true }}
```

See `ARCHITECTURE.md` for layer map and route contract.
"""


def generate_module_architecture(
    *,
    module_name: str,
    module_id: str,
    frontend_files: Optional[List[Dict[str, Any]]] = None,
    backend_files: Optional[List[Dict[str, Any]]] = None,
    slice_completeness: Optional[Dict[str, Any]] = None,
) -> str:
    """Generate ARCHITECTURE.md with FE/BE summary."""
    fe_files = list(frontend_files or [])
    be_files = list(backend_files or [])
    fe_components = _count_layer_files(fe_files, "frontend/src/components/")
    fe_pages = _count_layer_files(fe_files, "frontend/src/pages/")
    be_routers = _count_layer_files(be_files, "backend/routers/")

    slice_info = slice_completeness or {}
    slice_passed = bool(slice_info.get("passed"))
    critical_missing = int(slice_info.get("criticalMissingCount") or 0)
    entry = slice_info.get("entryPoint") or "auto-detect"

    fe_sample = [
        str(item.get("path", "")).replace("\\", "/")
        for item in fe_files[:8]
    ]
    be_sample = [
        str(item.get("path", "")).replace("\\", "/")
        for item in be_files[:8]
    ]

    fe_list = "\n".join(f"- `{path}`" for path in fe_sample) or "- _(empty)_"
    be_list = "\n".join(f"- `{path}`" for path in be_sample) or "- _(empty)_"

    return f"""# {module_name} — Architecture

`moduleId`: `{module_id}`

## Frontend

- **Entry:** `{entry}`
- **Components:** {fe_components}
- **Pages:** {fe_pages}
- **Slice complete:** {"yes" if slice_passed else f"no ({critical_missing} critical missing)"}

Sample paths:

{fe_list}

## Backend

- **Routers:** {be_routers}
- **Mount:** `/api/modules/{module_id}/` via generated `backend/router.py`

Sample paths:

{be_list}

## Integration

- Route contract validated at SET Adapter analyze (grade A–D).
- FE calls module API through SET proxy: `/api/modules/{module_id}/proxy`.

## Pipeline

```
Warsmith compose → normalize paths → SET Adapter transform → SET install
```
"""


def generate_module_docs(
    *,
    module_name: str,
    module_id: str,
    frontend_files: Optional[List[Dict[str, Any]]] = None,
    backend_files: Optional[List[Dict[str, Any]]] = None,
    entry_point: Optional[str] = None,
    source_ref: Optional[str] = None,
    slice_completeness: Optional[Dict[str, Any]] = None,
    generate_readme: bool = True,
    generate_architecture: bool = True,
) -> Dict[str, str]:
    """Return markdown documents keyed by relative slot path."""
    fe_files = list(frontend_files or [])
    be_files = list(backend_files or [])
    docs: Dict[str, str] = {}

    if generate_readme:
        docs["README.md"] = generate_module_readme(
            module_name=module_name,
            module_id=module_id,
            frontend_file_count=len(fe_files),
            backend_file_count=len(be_files),
            entry_point=entry_point or (slice_completeness or {}).get("entryPoint"),
            source_ref=source_ref,
        )

    if generate_architecture:
        docs["ARCHITECTURE.md"] = generate_module_architecture(
            module_name=module_name,
            module_id=module_id,
            frontend_files=fe_files,
            backend_files=be_files,
            slice_completeness=slice_completeness,
        )

    return docs
