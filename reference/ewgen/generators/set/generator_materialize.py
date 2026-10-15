"""
Materialize EWGen TypeScript generator output into SET module frontend slots.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from generators.generator_wrapper import GeneratorWrapper

from .entry_detect import _find_fe_entry
from .fe_build import build_module_frontend
from .generator_defaults import build_generator_config
from .react_runtime import default_fe_dependencies, default_fe_dev_dependencies
from .fe_slice_shims import _SET_API_CLIENT_SHIM
from .install import _write_files

logger = logging.getLogger(__name__)

_GENERATOR_CALLS = {
    "crud": "generate_crud",
    "dashboard": "generate_dashboard",
    "chat": "generate_chat",
    "report": "generate_report",
    "kanban": "generate_kanban",
    "presentation": "generate_presentation",
}

_EXTRA_NPM_DEPS: Dict[str, Dict[str, str]] = {
    "crud": {
        "@tanstack/react-query": "^5.62.0",
        "axios": "^1.7.9",
        "framer-motion": "^11.15.0",
        "lucide-react": "^0.468.0",
    },
    "dashboard": {
        "@tanstack/react-query": "^5.62.0",
        "recharts": "^2.15.0",
        "react-grid-layout": "^1.5.0",
        "html2canvas": "^1.4.1",
        "jspdf": "^2.5.2",
        "framer-motion": "^11.15.0",
        "lucide-react": "^0.468.0",
    },
    "chat": {
        "@tanstack/react-query": "^5.62.0",
        "zustand": "^5.0.2",
        "framer-motion": "^11.15.0",
        "lucide-react": "^0.468.0",
        "date-fns": "^4.1.0",
    },
    "report": {
        "@dnd-kit/core": "^6.3.1",
        "@dnd-kit/sortable": "^10.0.0",
        "@dnd-kit/utilities": "^3.2.2",
        "recharts": "^2.15.0",
        "html2canvas": "^1.4.1",
        "jspdf": "^2.5.2",
        "jspdf-autotable": "^3.8.4",
        "xlsx": "^0.18.5",
        "lucide-react": "^0.468.0",
    },
    "kanban": {
        "@dnd-kit/core": "^6.3.1",
        "@dnd-kit/sortable": "^10.0.0",
        "@dnd-kit/utilities": "^3.2.2",
        "zustand": "^5.0.2",
        "framer-motion": "^11.15.0",
        "lucide-react": "^0.468.0",
    },
    "presentation": {
        "reveal.js": "^5.1.0",
        "highlight.js": "^11.10.0",
    },
}

_SET_API_CONFIG_SHIM = """/** SET runtime API config shim */
export const API_CONFIG = {
  baseURL: import.meta.env.VITE_MODULE_API_BASE ?? import.meta.env.VITE_API_URL ?? '',
  timeout: 30000,
  cache: { staleTime: { list: 30_000, detail: 60_000 } },
};
"""

_SET_ERROR_HANDLER_SHIM = """/** SET runtime error-handler shim */
export const showSuccess = (_message: string): void => undefined;
export const showError = (message: string): void => {
  console.error(message);
};
"""

_INDEX_HTML = """<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/.set/entry.tsx"></script>
  </body>
</html>
"""

_MAIN_TSX = """import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
"""

_TSCONFIG = {
    "compilerOptions": {
        "target": "ES2022",
        "lib": ["ES2022", "DOM", "DOM.Iterable"],
        "module": "ESNext",
        "moduleResolution": "bundler",
        "jsx": "react-jsx",
        "strict": True,
        "skipLibCheck": True,
        "baseUrl": ".",
        "paths": {"@/*": ["src/*"]},
    },
    "include": ["src", ".set"],
}


def _pascal(name: str) -> str:
    parts = re.split(r"[-_\s]+", name)
    return "".join(part[:1].upper() + part[1:] for part in parts if part)


def _run_generator(template_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    wrapper = GeneratorWrapper()
    method_name = _GENERATOR_CALLS.get(template_id)
    if not method_name:
        raise ValueError(f"No generator mapping for template: {template_id}")
    method = getattr(wrapper, method_name)
    return method(config)


def _normalize_files(result: Dict[str, Any]) -> List[Dict[str, str]]:
    files = result.get("files") or []
    normalized: List[Dict[str, str]] = []
    for item in files:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path", "")).replace("\\", "/")
        if not path:
            continue
        normalized.append({
            "path": path,
            "content": str(item.get("content", "")),
            "language": str(item.get("language", "typescript")),
        })
    return normalized


def _strip_src_prefix(path: str) -> str:
    normalized = path.replace("\\", "/").removesuffix(".tsx").removesuffix(".ts")
    if normalized.startswith("src/"):
        return normalized[4:]
    return normalized


def _find_root_component(files: List[Dict[str, str]], template_id: str) -> Optional[Tuple[str, str]]:
    paths = [item["path"] for item in files]
    if template_id == "presentation":
        for path in paths:
            if path.endswith("src/App.tsx"):
                return _strip_src_prefix(path), "default"
        return None
    if template_id == "crud":
        for path in paths:
            if path.endswith("List.tsx"):
                return _strip_src_prefix(path), "default"
    if template_id == "dashboard":
        for path in paths:
            if path.endswith("Dashboard.tsx") and "/components/" in path:
                return _strip_src_prefix(path), "default"
    if template_id == "chat":
        for path in paths:
            if path.endswith("Container.tsx"):
                module = _strip_src_prefix(path)
                export_name = Path(path).stem
                return module, export_name
    if template_id == "kanban":
        for path in paths:
            if path.endswith("KanbanBoard.tsx"):
                return _strip_src_prefix(path), "default"
    if template_id == "report":
        for path in paths:
            if path.endswith("ReportModule.tsx"):
                return _strip_src_prefix(path), "ReportModule"
    return None


def _build_app_tsx(
    template_id: str,
    import_path: str,
    display_name: str,
    *,
    export_name: str = "default",
) -> str:
    if export_name == "default":
        import_line = f"import Root from './{import_path}';"
    else:
        import_line = f"import {{ {export_name} as Root }} from './{import_path}';"

    if template_id == "crud":
        return f"""{import_line}

export default function App() {{
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4">
      <h1 className="text-xl font-semibold mb-4">{display_name}</h1>
      <Root />
    </div>
  );
}}
"""
    if template_id == "kanban":
        return f"""import {{ useEffect, useRef }} from 'react';
{import_line}
import {{ useKanbanStore }} from './components/Kanban/store/useKanbanStore';

const DEMO_BOARD_ID = 'set-default-board';

const DEMO_COLUMNS = [
  {{ id: 'todo', title: 'To do', boardId: DEMO_BOARD_ID, order: 0, cards: [] }},
  {{ id: 'in_progress', title: 'In progress', boardId: DEMO_BOARD_ID, order: 1, cards: [] }},
  {{ id: 'done', title: 'Done', boardId: DEMO_BOARD_ID, order: 2, cards: [] }},
];

export default function App() {{
  const setBoard = useKanbanStore((state) => state.setBoard);
  const setColumns = useKanbanStore((state) => state.setColumns);
  const initializedRef = useRef(false);

  useEffect(() => {{
    if (initializedRef.current) {{
      return;
    }}
    initializedRef.current = true;
    setBoard({{
      id: DEMO_BOARD_ID,
      name: '{display_name}',
      description: 'SET runtime demo board',
    }});
    setColumns(DEMO_COLUMNS);
  }}, [setBoard, setColumns]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Root boardId={{DEMO_BOARD_ID}} />
    </div>
  );
}}
"""
    return f"""{import_line}

export default function App() {{
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4">
      <Root />
    </div>
  );
}}
"""


def _inject_set_shims(files: List[Dict[str, str]]) -> None:
    shim_paths = {item["path"] for item in files}
    if "src/services/api/client.ts" not in shim_paths:
        files.append({
            "path": "src/services/api/client.ts",
            "content": _SET_API_CLIENT_SHIM,
            "language": "typescript",
        })
    if "src/services/api/config.ts" not in shim_paths:
        files.append({
            "path": "src/services/api/config.ts",
            "content": _SET_API_CONFIG_SHIM,
            "language": "typescript",
        })
    if "src/services/api/error-handler.ts" not in shim_paths:
        files.append({
            "path": "src/services/api/error-handler.ts",
            "content": _SET_ERROR_HANDLER_SHIM,
            "language": "typescript",
        })


def _ensure_scaffold(
    files: List[Dict[str, str]],
    *,
    template_id: str,
    module_name: str,
) -> None:
    paths = {item["path"] for item in files}
    if template_id == "presentation":
        if "index.html" not in paths:
            files.append({
                "path": "index.html",
                "content": _INDEX_HTML.format(title=module_name),
                "language": "html",
            })
        if "tsconfig.node.json" not in paths:
            files.append({
                "path": "tsconfig.node.json",
                "content": json.dumps({
                    "compilerOptions": {
                        "composite": True,
                        "skipLibCheck": True,
                        "module": "ESNext",
                        "moduleResolution": "bundler",
                    },
                    "include": [],
                }, indent=2),
                "language": "json",
            })
        return

    root = _find_root_component(files, template_id)
    if root and "src/App.tsx" not in paths:
        import_path, export_name = root
        app_content = _build_app_tsx(
            template_id,
            import_path,
            module_name,
            export_name=export_name,
        )
        files.append({"path": "src/App.tsx", "content": app_content, "language": "typescript"})
    if "index.html" not in paths:
        files.append({
            "path": "index.html",
            "content": _INDEX_HTML.format(title=module_name),
            "language": "html",
        })
    if "tsconfig.json" not in paths:
        files.append({
            "path": "tsconfig.json",
            "content": json.dumps(_TSCONFIG, indent=2),
            "language": "json",
        })
    if "src/index.css" not in paths:
        files.append({
            "path": "src/index.css",
            "content": "@import 'tailwindcss';\nbody { margin: 0; }\n",
            "language": "css",
        })


def _write_package_json(fe_root: Path, template_id: str, generated_files: List[Dict[str, str]]) -> None:
    deps = dict(_EXTRA_NPM_DEPS.get(template_id) or {})
    for item in generated_files:
        if item["path"] == "package.json":
            try:
                data = json.loads(item["content"])
                if isinstance(data, dict):
                    deps.update(data.get("dependencies") or {})
            except json.JSONDecodeError:
                pass
            break
    package = {
        "name": f"set-{template_id}",
        "private": True,
        "type": "module",
        "scripts": {"build": "vite build --config .set/vite.config.set.ts"},
        "dependencies": {
            **default_fe_dependencies(),
            **deps,
        },
        "devDependencies": default_fe_dev_dependencies(),
    }
    (fe_root / "package.json").write_text(
        json.dumps(package, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def materialize_generator_frontend(
    *,
    module_id: str,
    template_id: str,
    module_name: str,
    fe_root: Path,
    entity_name: Optional[str] = None,
    skip_build: bool = False,
) -> Dict[str, Any]:
    """
    Run EWGen TS generator and write frontend sources + optional Vite build.
    """
    config = build_generator_config(template_id, module_name, entity_name=entity_name)
    result = _run_generator(template_id, config)
    if not result.get("success"):
        return {
            "buildStatus": "failed",
            "buildError": result.get("error") or "Generator failed",
            "generatorStats": result.get("stats") or {},
        }

    files = _normalize_files(result)
    if not files:
        return {"buildStatus": "failed", "buildError": "Generator returned no files"}

    _inject_set_shims(files)
    _ensure_scaffold(files, template_id=template_id, module_name=module_name)

    fe_root.mkdir(parents=True, exist_ok=True)
    written = _write_files(fe_root, files)
    _write_package_json(fe_root, template_id, files)

    entry_point = _find_fe_entry(files)
    if any(item["path"] == "src/App.tsx" for item in files):
        entry_point = "src/App.tsx"
    elif template_id == "presentation" and any(item["path"] == "src/App.tsx" for item in files):
        entry_point = "src/App.tsx"

    detection: Dict[str, Any] = {
        "frontend": {
            "entryPoint": entry_point,
            "framework": "react-vite",
            "generatedFileCount": written,
        },
        "runtimeGrade": "A" if entry_point else "C",
    }

    if not entry_point:
        return {
            **detection,
            "buildStatus": "failed",
            "buildError": "No frontend entry point after generator materialize",
            "generatorStats": result.get("stats") or {},
        }

    if skip_build:
        return {
            **detection,
            "buildStatus": "pending",
            "buildError": "Build skipped",
            "generatorStats": result.get("stats") or {},
        }

    api_base = f"/api/modules/{module_id}/proxy"
    fe_build = build_module_frontend(
        module_id,
        fe_root,
        entry_point=entry_point,
        api_base=api_base,
    )
    return {
        **detection,
        **fe_build,
        "generatorStats": result.get("stats") or {},
        "generatedFileCount": written,
    }
