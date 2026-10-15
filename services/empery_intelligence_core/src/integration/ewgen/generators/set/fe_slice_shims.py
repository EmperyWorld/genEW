"""
SET — inject shims for missing files in incomplete Warsmith FE slices
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

_IMPORT_FROM_RE = re.compile(
    r"""from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]""",
)

_SET_KEYCLOAK_INIT_SHIM = '''/**
 * SET runtime KeycloakInit shim — auto-injected when FE slice omits auth bootstrap.
 */
import React from 'react';

interface KeycloakInitProps {
  children: React.ReactNode;
}

export const KeycloakInit: React.FC<KeycloakInitProps> = ({ children }) => (
  <>{children}</>
);

export default KeycloakInit;
'''

_SET_API_CLIENT_SHIM = '''/**
 * SET runtime API client shim — auto-injected when FE slice omits services/api/client.
 */
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

const moduleApiBase =
  (import.meta.env.VITE_MODULE_API_BASE as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  '';

function resolveBaseURL(config?: AxiosRequestConfig): string {
  const extra = config?.baseURL?.trim() ?? '';
  if (!extra) {
    return moduleApiBase;
  }
  if (extra.startsWith('http')) {
    return extra;
  }
  const suffix = extra.startsWith('/') ? extra : `/${extra}`;
  return `${moduleApiBase.replace(/\\/$/, '')}${suffix}`;
}

function mergeConfig(config?: AxiosRequestConfig): AxiosRequestConfig {
  const { baseURL: _ignored, ...rest } = config ?? {};
  return { ...rest, baseURL: resolveBaseURL(config) };
}

export const createAPIClient = (config?: AxiosRequestConfig): AxiosInstance =>
  axios.create(mergeConfig(config));

const client = createAPIClient();

export const api = {
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await client.get<T>(url, mergeConfig(config));
    return response.data;
  },
  post: async <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await client.post<T>(url, data, mergeConfig(config));
    return response.data;
  },
  put: async <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await client.put<T>(url, data, mergeConfig(config));
    return response.data;
  },
  patch: async <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await client.patch<T>(url, data, mergeConfig(config));
    return response.data;
  },
  delete: async <T>(url:string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await client.delete<T>(url, mergeConfig(config));
    return response.data;
  },
};

export const apiClient = client;

export const buildQueryString = (params: Record<string, unknown>): string => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, String(item)));
      return;
    }
    searchParams.append(key, String(value));
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

export type APIResponse<T> = { data: T; success: boolean; message?: string };
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
};
'''


def _load_tsconfig_paths(fe_root: Path) -> Dict[str, str]:
    tsconfig_path = fe_root / "tsconfig.json"
    if not tsconfig_path.is_file():
        return {}
    try:
        data = json.loads(tsconfig_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    paths = (data.get("compilerOptions") or {}).get("paths") if isinstance(data, dict) else None
    if not isinstance(paths, dict):
        return {}
    result: Dict[str, str] = {}
    for key, targets in paths.items():
        if not isinstance(targets, list) or not targets:
            continue
        prefix = key.rstrip("*").rstrip("/")
        target = str(targets[0]).replace("/*", "").lstrip("./")
        result[prefix] = target
    return result


def _resolve_import_to_file(
    fe_root: Path,
    importer: Path,
    spec: str,
    alias_roots: Dict[str, str],
) -> Optional[Path]:
    if spec.startswith("."):
        base = (importer.parent / spec).resolve()
    else:
        matched_prefix = None
        for prefix in sorted(alias_roots, key=len, reverse=True):
            if spec == prefix or spec.startswith(f"{prefix}/"):
                matched_prefix = prefix
                break
        if not matched_prefix:
            return None
        suffix = spec[len(matched_prefix) :].lstrip("/")
        base = (fe_root / alias_roots[matched_prefix] / suffix).resolve()

    for candidate in (base, Path(f"{base}.ts"), Path(f"{base}.tsx"), base / "index.ts", base / "index.tsx"):
        if candidate.is_file():
            return candidate
    return Path(f"{base}.ts")


def _collect_import_specs(content: str) -> List[str]:
    specs: List[str] = []
    for match in _IMPORT_FROM_RE.finditer(content):
        spec = match.group(1) or match.group(2)
        if spec and (spec.startswith(".") or spec.startswith("@")):
            specs.append(spec)
    return specs


def scan_missing_local_imports(fe_root: Path, entry_point: str) -> List[str]:
    """Return unresolved local import specs reachable from entry_point."""
    alias_roots = _load_tsconfig_paths(fe_root)
    entry_file = fe_root / entry_point.replace("\\", "/").lstrip("/")
    if not entry_file.is_file():
        return []

    missing: List[str] = []
    seen_files: Set[Path] = set()
    queue: List[Path] = [entry_file]

    while queue:
        current = queue.pop(0)
        if current in seen_files:
            continue
        seen_files.add(current)
        try:
            content = current.read_text(encoding="utf-8")
        except OSError:
            continue

        for spec in _collect_import_specs(content):
            resolved = _resolve_import_to_file(fe_root, current, spec, alias_roots)
            if resolved is None:
                continue
            if resolved.is_file():
                if resolved.suffix in {".ts", ".tsx"}:
                    queue.append(resolved)
                continue
            missing.append(spec)

    return sorted(set(missing))


def _is_api_client_spec(spec: str) -> bool:
    normalized = spec.replace("\\", "/").rstrip("/")
    return normalized.endswith("services/api/client") or normalized.endswith("/services/api/client")


def _is_keycloak_init_spec(spec: str) -> bool:
    normalized = spec.replace("\\", "/").rstrip("/")
    return (
        normalized.endswith("components/KeycloakInit")
        or normalized.endswith("/components/KeycloakInit")
        or normalized.endswith("KeycloakInit")
    )


def _spec_to_shim_path(fe_root: Path, spec: str, alias_roots: Dict[str, str]) -> Optional[Path]:
    for prefix, target in alias_roots.items():
        if spec == prefix or spec.startswith(f"{prefix}/"):
            suffix = spec[len(prefix) :].lstrip("/")
            return fe_root / target / suffix
    if spec.startswith("."):
        return None
    return None


def _known_relative_shim_target(fe_root: Path, spec: str) -> Optional[tuple[Path, str]]:
    if not spec.startswith("."):
        return None
    normalized = spec.replace("\\", "/").rstrip("/")
    if normalized.endswith("services/api/client") or "/services/api/client" in normalized:
        return fe_root / "src" / "services" / "api" / "client.ts", _SET_API_CLIENT_SHIM
    if normalized.endswith("services/api/config") or "/services/api/config" in normalized:
        config_shim = """/** SET runtime API config shim */
export const API_CONFIG = {
  baseURL: import.meta.env.VITE_MODULE_API_BASE ?? import.meta.env.VITE_API_URL ?? '',
  timeout: 30000,
  cache: { staleTime: { list: 30_000, detail: 60_000 } },
};
"""
        return fe_root / "src" / "services" / "api" / "config.ts", config_shim
    if normalized.endswith("services/api/error-handler") or "/services/api/error-handler" in normalized:
        error_shim = """/** SET runtime error-handler shim */
export const showSuccess = (_message: string): void => undefined;
export const showError = (message: string): void => {
  console.error(message);
};
"""
        return fe_root / "src" / "services" / "api" / "error-handler.ts", error_shim
    return None


def apply_fe_slice_shims(fe_root: Path, entry_point: str) -> Dict[str, Any]:
    """
    Inject SET shims for known missing imports before vite build.
    """
    alias_roots = _load_tsconfig_paths(fe_root)
    missing = scan_missing_local_imports(fe_root, entry_point)
    injected: List[str] = []
    still_missing: List[str] = []

    for spec in missing:
        target = _spec_to_shim_path(fe_root, spec, alias_roots)
        if target is not None:
            shim_content: Optional[str] = None
            if _is_api_client_spec(spec):
                shim_content = _SET_API_CLIENT_SHIM
            elif _is_keycloak_init_spec(spec):
                shim_content = _SET_KEYCLOAK_INIT_SHIM

            if shim_content is not None:
                target.parent.mkdir(parents=True, exist_ok=True)
                extension = ".tsx" if _is_keycloak_init_spec(spec) else ".ts"
                shim_path = target if target.suffix in {".ts", ".tsx"} else Path(f"{target}{extension}")
                shim_path.write_text(shim_content, encoding="utf-8")
                injected.append(shim_path.relative_to(fe_root).as_posix())
                continue

        relative_known = _known_relative_shim_target(fe_root, spec)
        if relative_known is not None:
            target, shim_content = relative_known
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(shim_content, encoding="utf-8")
            injected.append(target.relative_to(fe_root).as_posix())
            continue

        if target is None:
            still_missing.append(spec)
            continue

        still_missing.append(spec)

    return {
        "injected": injected,
        "missing": still_missing,
        "missingCount": len(still_missing),
    }
