import { apiUrl, config } from "@/config";
import type { StandardizedErrorResponse } from "@/api/types";
import { getStoredAccessToken } from "@/features/auth/authStorage";
import { PATHS } from "@/routes/paths";

export class EccHttpError extends Error {
  readonly status: number;
  readonly body: StandardizedErrorResponse | null;
  readonly errorCode: string;

  constructor(
    message: string,
    status: number,
    body: StandardizedErrorResponse | null = null,
  ) {
    super(message);
    this.name = "EccHttpError";
    this.status = status;
    this.body = body;
    this.errorCode = body?.error_code ?? `http_${status}`;
  }
}

/** Alias used by feature clients (Implementer 3). */
export class EccApiError extends EccHttpError {
  constructor(
    message: string,
    status: number,
    body: StandardizedErrorResponse | null = null,
  ) {
    super(message, status, body);
    this.name = "EccApiError";
  }
}

function isStandardizedError(value: unknown): value is StandardizedErrorResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.error_code === "string" && typeof record.message === "string";
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Query string params (omitted keys skipped). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query?: Record<string, any> | object;
  /** Bearer token when Identity JWT flow is wired. */
  token?: string | null;
}

/** Alias for feature clients. */
export type RequestOptions = HttpRequestOptions;

function withQuery(
  path: string,
  query?: HttpRequestOptions["query"],
): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(
    query as Record<string, unknown>,
  )) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  if (!qs) return path;
  return path.includes("?") ? `${path}&${qs}` : `${path}?${qs}`;
}

export async function http<T>(
  path: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, headers = {}, signal, token, query } = options;
  const pathWithQuery = withQuery(path, query);
  const url = pathWithQuery.startsWith("http")
    ? pathWithQuery
    : apiUrl(pathWithQuery);

  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const bearer =
    token !== undefined && token !== null
      ? token
      : token === null
        ? null
        : getStoredAccessToken();
  if (bearer) {
    requestHeaders.Authorization = `Bearer ${bearer}`;
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const errBody = isStandardizedError(parsed) ? parsed : null;

    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !pathWithQuery.startsWith("/auth/login") &&
      !pathWithQuery.startsWith("/auth/register") &&
      !pathWithQuery.startsWith("/auth/password-reset/") &&
      !window.location.pathname.startsWith(PATHS.login)
    ) {
      const next = encodeURIComponent(
        `${window.location.pathname}${window.location.search}`,
      );
      window.location.assign(`${PATHS.login}?next=${next}`);
    }

    throw new EccApiError(
      errBody?.message ?? `ECC API ${response.status} for ${url}`,
      response.status,
      errBody,
    );
  }

  return parsed as T;
}

/** Primary fetch helper for typed API clients. */
export const eccFetch = http;

export function getApiBase(): string {
  return config.apiBase;
}
