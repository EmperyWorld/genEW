"""
SET — per-module Vite frontend build pipeline
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import textwrap
from pathlib import Path
from typing import Any, Dict, Optional

from .fe_provider_wrap import (
    detect_context_providers,
    provider_import_lines,
    wrap_jsx_with_providers,
)
from .fe_slice_shims import apply_fe_slice_shims
from .integration_apply import apply_local_tsconfig_merges
from .paths import runtime_modules_root, runtime_root
from .react_runtime import default_fe_dependencies, default_fe_dev_dependencies

_SET_DIR = ".set"


def _merge_package_json(fe_root: Path, module_id: str) -> None:
    """Merge package.imported.json into module-local package.json for npm build."""
    package_path = fe_root / "package.json"
    base: Dict[str, Any] = {
        "name": f"set-module-{module_id}",
        "private": True,
        "type": "module",
        "scripts": {
            "build": "npx vite build --config .set/vite.config.set.ts",
        },
        "dependencies": default_fe_dependencies(),
        "devDependencies": default_fe_dev_dependencies(),
    }

    if package_path.is_file():
        try:
            existing = json.loads(package_path.read_text(encoding="utf-8"))
            if isinstance(existing, dict):
                base.update({key: value for key, value in existing.items() if key != "dependencies"})
                base_deps = dict(base.get("dependencies") or {})
                base_deps.update(existing.get("dependencies") or {})
                base["dependencies"] = base_deps
                base_dev = dict(base.get("devDependencies") or {})
                base_dev.update(existing.get("devDependencies") or {})
                base["devDependencies"] = base_dev
        except json.JSONDecodeError:
            pass

    for imported_path in sorted(fe_root.glob("package.imported*.json")):
        try:
            imported = json.loads(imported_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if not isinstance(imported, dict):
            continue
        base_deps = dict(base.get("dependencies") or {})
        base_deps.update(imported.get("dependencies") or {})
        base["dependencies"] = base_deps
        base_dev = dict(base.get("devDependencies") or {})
        base_dev.update(imported.get("devDependencies") or {})
        base["devDependencies"] = base_dev

    scripts = dict(base.get("scripts") or {})
    scripts.setdefault("build", "npx vite build --config .set/vite.config.set.ts")
    base["scripts"] = scripts
    package_path.write_text(json.dumps(base, indent=2, ensure_ascii=False), encoding="utf-8")


def _vite_aliases_from_tsconfig(fe_root: Path) -> Dict[str, str]:
    tsconfig_path = fe_root / "tsconfig.json"
    if not tsconfig_path.is_file():
        return {"@": "path.resolve(__dirname, '..', 'src')"}
    try:
        data = json.loads(tsconfig_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"@": "path.resolve(__dirname, '..', 'src')"}
    paths = (data.get("compilerOptions") or {}).get("paths") if isinstance(data, dict) else None
    if not isinstance(paths, dict):
        return {"@": "path.resolve(__dirname, '..', 'src')"}
    aliases: Dict[str, str] = {
        "@": "path.resolve(__dirname, '..', 'src')",
    }
    for key, targets in paths.items():
        if not isinstance(targets, list) or not targets:
            continue
        first = str(targets[0]).replace("\\", "/")
        clean_key = key.rstrip("/*")
        alias_target = first.replace("/*", "").replace("./", "")
        aliases[clean_key] = f"path.resolve(__dirname, '..', '{alias_target}')"
    return aliases


def _format_vite_aliases(aliases: Dict[str, str]) -> str:
    lines = []
    for key, value in aliases.items():
        lines.append(f"            '{key}': {value},")
    return "\n".join(lines)


def _relative_import_path(entry_point: str) -> str:
    normalized = entry_point.replace("\\", "/").lstrip("/")
    if normalized.endswith((".tsx", ".ts", ".jsx", ".js")):
        normalized = normalized.rsplit(".", 1)[0]
    return f"../{normalized}"


def _ensure_index_css(fe_root: Path) -> None:
    """Tailwind entry stylesheet for generated modules using utility classes."""
    css_path = fe_root / "src" / "index.css"
    if css_path.is_file():
        return
    css_path.parent.mkdir(parents=True, exist_ok=True)
    css_path.write_text("@import 'tailwindcss';\nbody { margin: 0; }\n", encoding="utf-8")


def _write_postcss_config(fe_root: Path) -> None:
    postcss_config = textwrap.dedent(
        """
        export default {
          plugins: {
            '@tailwindcss/postcss': {},
          },
        };
        """,
    ).strip() + "\n"
    (fe_root / "postcss.config.js").write_text(postcss_config, encoding="utf-8")


def _is_reveal_presentation(fe_root: Path, entry_point: str) -> bool:
    """Reveal decks break under StrictMode double-mount and need a minimal shell."""
    normalized = entry_point.replace("\\", "/").lstrip("/")
    candidates = [fe_root / normalized]
    if normalized.startswith("src/"):
        candidates.append(fe_root / normalized[4:])
    for candidate in candidates:
        if not candidate.is_file():
            continue
        try:
            content = candidate.read_text(encoding="utf-8")
        except OSError:
            continue
        if "reveal.js" in content:
            return True
    return False


def _write_axios_defaults(set_dir: Path, api_base: str) -> None:
    """Configure axios before imported slice modules load (module is served from :8100 static)."""
    normalized_base = api_base.rstrip("/")
    axios_defaults = textwrap.dedent(
        f"""
        import axios from 'axios';

        const moduleApiBase =
          import.meta.env.VITE_MODULE_API_BASE ??
          import.meta.env.VITE_API_URL ??
          '{normalized_base}';

        if (moduleApiBase) {{
          axios.defaults.baseURL = String(moduleApiBase).replace(/\\/$/, '');
        }}
        """,
    ).strip() + "\n"
    (set_dir / "axios-defaults.ts").write_text(axios_defaults, encoding="utf-8")


def _write_build_shell(
    fe_root: Path,
    module_id: str,
    entry_point: str,
    api_base: str,
) -> None:
    set_dir = fe_root / _SET_DIR
    set_dir.mkdir(parents=True, exist_ok=True)
    _write_axios_defaults(set_dir, api_base)
    apply_local_tsconfig_merges(fe_root)
    vite_aliases = _format_vite_aliases(_vite_aliases_from_tsconfig(fe_root))

    import_path = _relative_import_path(entry_point)
    is_presentation = _is_reveal_presentation(fe_root, entry_point)
    if not is_presentation:
        _ensure_index_css(fe_root)
        _write_postcss_config(fe_root)

    if is_presentation:
        entry_tsx = textwrap.dedent(
            f"""
            import React from 'react';
            import {{ createRoot }} from 'react-dom/client';
            import ImportedApp from '{import_path}';

            window.addEventListener('message', (event) => {{
              if (event.data?.type === 'set-module-layout') {{
                window.dispatchEvent(new Event('resize'));
              }}
            }});

            const root = document.getElementById('root');
            if (root) {{
              createRoot(root).render(<ImportedApp />);
            }}
            """,
        ).strip() + "\n"
    else:
        context_providers = detect_context_providers(fe_root, entry_point)
        provider_imports = "\n".join(provider_import_lines(context_providers))
        if provider_imports:
            provider_imports = f"{provider_imports}\n"
        app_jsx = wrap_jsx_with_providers("<ImportedApp />", context_providers)
        entry_tsx = textwrap.dedent(
            f"""
            import './axios-defaults';
            import '../src/index.css';
            import React from 'react';
            import {{ createRoot }} from 'react-dom/client';
            import {{ QueryClient, QueryClientProvider }} from '@tanstack/react-query';
            import {{ BrowserRouter }} from 'react-router-dom';
            import ImportedApp from '{import_path}';
            {provider_imports}
            const queryClient = new QueryClient();
            const basename = '/app/{module_id}';

            function SetModuleShell() {{
              return (
                <QueryClientProvider client={{queryClient}}>
                  <BrowserRouter basename={{basename}}>
                    {app_jsx}
                  </BrowserRouter>
                </QueryClientProvider>
              );
            }}

            const root = document.getElementById('root');
            if (root) {{
              createRoot(root).render(<SetModuleShell />);
            }}
            """,
        ).strip() + "\n"
    (set_dir / "entry.tsx").write_text(entry_tsx, encoding="utf-8")

    vite_config = textwrap.dedent(
        f"""
        import {{ defineConfig }} from 'vite';
        import react from '@vitejs/plugin-react';
        import path from 'path';

        export default defineConfig({{
          root: path.resolve(__dirname, '..'),
          base: '/app/{module_id}/',
          plugins: [react()],
          build: {{
            outDir: 'dist',
            emptyOutDir: true,
            rollupOptions: {{
              input: path.resolve(__dirname, '..', 'index.html'),
            }},
          }},
          define: {{
            'import.meta.env.VITE_API_URL': JSON.stringify('{api_base}'),
            'import.meta.env.VITE_MODULE_API_BASE': JSON.stringify('{api_base}'),
          }},
          resolve: {{
            alias: {{
{vite_aliases}
            }},
          }},
        }});
        """,
    ).strip() + "\n"
    (set_dir / "vite.config.set.ts").write_text(vite_config, encoding="utf-8")

    index_html = textwrap.dedent(
        f"""
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>{module_id}</title>
          </head>
          <body>
            <div id="root"></div>
            <script type="module" src="./.set/entry.tsx"></script>
          </body>
        </html>
        """,
    ).strip() + "\n"
    (fe_root / "index.html").write_text(index_html, encoding="utf-8")

    _merge_package_json(fe_root, module_id)


def _run_npm_in_podman(fe_root: Path, env: Dict[str, str]) -> subprocess.CompletedProcess[str]:
    podman = shutil.which("podman")
    if not podman:
        raise RuntimeError("podman not found for SET_FE_BUILD_DOCKER")

    resolved_fe = fe_root.resolve()
    modules_root = runtime_modules_root().resolve()
    env_args = []
    for key, value in env.items():
        env_args.extend(["-e", f"{key}={value}"])

    try:
        module_rel = resolved_fe.relative_to(modules_root).as_posix()
        runtime_dir = runtime_root().resolve()
        compose_file = runtime_dir / "compose.yaml"
        if not compose_file.is_file():
            raise FileNotFoundError(f"SET compose.yaml not found: {compose_file}")
        volume_mount = f"{modules_root}:/modules:Z"
        workdir = f"/modules/{module_rel}"
    except ValueError:
        volume_mount = f"{resolved_fe}:/fe:Z"
        workdir = "/fe"

    build_script = (
        "export PATH=/bin:/usr/bin:/usr/local/bin:${PATH:-} && "
        f"cd {workdir} && "
        "rm -rf node_modules && "
        "npm install --no-audit --no-fund --legacy-peer-deps && "
        "npx vite build --config .set/vite.config.set.ts"
    )
    command = [
        podman,
        "run",
        "--rm",
        "--entrypoint",
        "/bin/sh",
        "-v",
        volume_mount,
        "-v",
        "set-npm-cache:/root/.npm",
        *env_args,
        "docker.io/library/node:20-alpine",
        "-c",
        build_script,
    ]
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=900,
        check=False,
    )


def build_module_frontend(
    module_id: str,
    fe_root: Path,
    *,
    entry_point: Optional[str] = None,
    api_base: Optional[str] = None,
    skip_npm: bool = False,
) -> Dict[str, Any]:
    """
    Build module frontend into modules/{id}/frontend/dist.
    """
    log_path = fe_root.parent / _SET_DIR / "fe-build.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    dist_dir = fe_root / "dist"

    if not entry_point:
        return {
            "buildStatus": "failed",
            "buildError": "No frontend entry point detected",
            "buildLogPath": str(log_path),
        }

    entry_file = fe_root / entry_point.replace("\\", "/").lstrip("/")
    if not entry_file.is_file():
        return {
            "buildStatus": "failed",
            "buildError": f"Entry point not found: {entry_point}",
            "buildLogPath": str(log_path),
        }

    public_base = api_base or f"/api/modules/{module_id}/proxy"
    _write_build_shell(fe_root, module_id, entry_point, public_base)
    shim_result = apply_fe_slice_shims(fe_root, entry_point)
    if shim_result.get("missing"):
        missing_preview = ", ".join(shim_result["missing"][:5])
        return {
            "buildStatus": "failed",
            "buildError": f"Incomplete FE slice — missing imports: {missing_preview}",
            "buildLogPath": str(log_path),
            "sliceShims": shim_result,
        }

    if skip_npm or os.getenv("SET_SKIP_FE_BUILD") == "1":
        return {
            "buildStatus": "pending",
            "buildError": "npm build skipped (SET_SKIP_FE_BUILD or skip_npm)",
            "buildLogPath": str(log_path),
        }

    npm_bin = shutil.which("npm")
    use_docker = os.getenv("SET_FE_BUILD_DOCKER", "").strip() in {"1", "true", "yes"}
    if not npm_bin and not use_docker:
        return {
            "buildStatus": "failed",
            "buildError": "npm not found in PATH (set SET_FE_BUILD_DOCKER=1 for Podman build)",
            "buildLogPath": str(log_path),
        }

    npm_command = npm_bin or "npm"
    log_lines: list[str] = []
    build_env = {
        **os.environ,
        "VITE_API_URL": public_base,
        "VITE_MODULE_API_BASE": public_base,
    }
    try:
        if use_docker:
            install = _run_npm_in_podman(fe_root, build_env)
            log_lines.append(install.stdout)
            log_lines.append(install.stderr)
            build = install
        else:
            install = subprocess.run(
                [npm_command, "install", "--no-audit", "--no-fund", "--legacy-peer-deps"],
                cwd=fe_root,
                capture_output=True,
                text=True,
                timeout=600,
                check=False,
            )
            log_lines.append(install.stdout)
            log_lines.append(install.stderr)
            if install.returncode != 0:
                log_path.write_text("\n".join(log_lines), encoding="utf-8")
                tail = "\n".join(log_lines)[-1200:]
                return {
                    "buildStatus": "failed",
                    "buildError": f"npm install failed: {tail.splitlines()[-1] if tail else 'unknown'}",
                    "buildLogPath": str(log_path),
                }

            build = subprocess.run(
                [npm_command, "exec", "vite", "build", "--config", ".set/vite.config.set.ts"],
                cwd=fe_root,
                capture_output=True,
                text=True,
                timeout=600,
                check=False,
                env=build_env,
            )
        log_lines.append(build.stdout)
        log_lines.append(build.stderr)
        log_path.write_text("\n".join(log_lines), encoding="utf-8")

        dist_ready = (dist_dir / "index.html").is_file() or any(dist_dir.glob("assets/*.js"))
        if build.returncode != 0 or not dist_ready:
            tail = "\n".join(log_lines)[-2000:]
            detail = "vite build failed"
            for line in reversed(tail.splitlines()):
                stripped = line.strip()
                if stripped.startswith("error during build:") or "ENOENT" in stripped or "Could not load" in stripped:
                    detail = stripped
                    break
            return {
                "buildStatus": "failed",
                "buildError": detail,
                "buildLogPath": str(log_path),
                "sliceShims": shim_result,
            }

        return {
            "buildStatus": "ready",
            "buildOutput": str(dist_dir),
            "buildLogPath": str(log_path),
            "sliceShims": shim_result,
        }
    except (OSError, subprocess.TimeoutExpired) as error:
        log_lines.append(str(error))
        log_path.write_text("\n".join(log_lines), encoding="utf-8")
        return {
            "buildStatus": "failed",
            "buildError": str(error),
            "buildLogPath": str(log_path),
        }


def read_build_log(module_root: Path, log_type: str = "fe") -> str:
    """Read FE or BE build log from module .set directory."""
    if log_type == "be":
        path = module_root / _SET_DIR / "be-build.log"
    else:
        path = module_root / _SET_DIR / "fe-build.log"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return ""
