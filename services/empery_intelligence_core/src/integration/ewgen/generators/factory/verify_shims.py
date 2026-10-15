# ---
# EWGen · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Inject minimal API client shims into factory TS sandboxes before VERIFY tsc.
# Invariants:
# - Shims are sandbox-safe (no import.meta / Vite env).
# Related:
# - generators/factory/artifacts.py
# - generators/set/fe_slice_shims.py
# ---

from __future__ import annotations

from pathlib import Path

FACTORY_API_CLIENT_SHIM = """/**
 * Factory verify shim — API client for generated CRUD modules.
 */
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

type RequestConfig = Record<string, unknown>;

const noopClient = {
  get: async <T>(_url: string, _config?: RequestConfig): Promise<{ data: T }> => ({ data: {} as T }),
  post: async <T>(_url: string, _data?: unknown, _config?: RequestConfig): Promise<{ data: T }> => ({ data: {} as T }),
  put: async <T>(_url: string, _data?: unknown, _config?: RequestConfig): Promise<{ data: T }> => ({ data: {} as T }),
  patch: async <T>(_url: string, _data?: unknown, _config?: RequestConfig): Promise<{ data: T }> => ({ data: {} as T }),
  delete: async <T>(_url: string, _config?: RequestConfig): Promise<{ data: T }> => ({ data: {} as T }),
};

export const api = {
  get: async <T>(url: string, config?: RequestConfig): Promise<T> => {
    const response = await noopClient.get<T>(url, config);
    return response.data;
  },
  post: async <T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> => {
    const response = await noopClient.post<T>(url, data, config);
    return response.data;
  },
  put: async <T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> => {
    const response = await noopClient.put<T>(url, data, config);
    return response.data;
  },
  patch: async <T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> => {
    const response = await noopClient.patch<T>(url, data, config);
    return response.data;
  },
  delete: async <T>(url: string, config?: RequestConfig): Promise<T> => {
    const response = await noopClient.delete<T>(url, config);
    return response.data;
  },
};

export const buildQueryString = (params: Record<string, unknown> | object): string => {
  const record = params as Record<string, unknown>;
  const searchParams = new URLSearchParams();
  Object.entries(record).forEach(([key, value]) => {
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
"""

FACTORY_API_CONFIG_SHIM = """/** Factory verify shim — API config for generated CRUD modules. */
export const API_CONFIG = {
  baseURL: '',
  timeout: 30_000,
  cache: {
    staleTime: {
      list: 30_000,
      detail: 60_000,
    },
  },
};
"""

FACTORY_ERROR_HANDLER_SHIM = """/** Factory verify shim — toast helpers for generated CRUD modules. */
export const showSuccess = (_message: string): void => undefined;
export const showError = (message: string): void => {
  console.error(message);
};
"""

_SHIM_FILES: tuple[tuple[str, str], ...] = (
    ("src/services/api/client.ts", FACTORY_API_CLIENT_SHIM),
    ("src/services/api/config.ts", FACTORY_API_CONFIG_SHIM),
    ("src/services/api/error-handler.ts", FACTORY_ERROR_HANDLER_SHIM),
)


def ensure_factory_verify_shims(workspace: Path) -> list[str]:
    """
    Write API shims when generated CRUD hooks reference ../services/api/*.

    Returns relative paths of files written or already present.
    """
    ensured: list[str] = []
    for rel, content in _SHIM_FILES:
        target = workspace / rel
        if target.is_file():
            ensured.append(rel)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        ensured.append(rel)
    return ensured
