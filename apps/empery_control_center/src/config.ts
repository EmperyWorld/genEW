/**
 * Env-driven FE config (Vite).
 * Defaults point at empery_control_center_api on port 8006.
 * When the page is opened via a LAN IP/hostname but the baked env still
 * points at localhost, API/WS follow the page host so LAN clients work.
 */
function readEnv(key: string, fallback: string): string {
  const value = import.meta.env[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isLoopbackUrl(url: string): boolean {
  try {
    return isLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

function pageHost(): string | null {
  if (typeof window === "undefined" || !window.location?.hostname) {
    return null;
  }
  const host = window.location.hostname;
  return isLoopbackHost(host) ? null : host;
}

function resolveApiBase(): string {
  const fromEnv = readEnv("VITE_ECC_API_BASE", "http://localhost:8006");
  const host = pageHost();
  if (host && isLoopbackUrl(fromEnv)) {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${host}:8006`;
  }
  return fromEnv;
}

function resolveWsUrl(): string {
  const fromEnv = readEnv(
    "VITE_ECC_WS_URL",
    "ws://localhost:8006/api/v1/ws/events",
  );
  const host = pageHost();
  if (host && isLoopbackUrl(fromEnv)) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${host}:8006/api/v1/ws/events`;
  }
  return fromEnv;
}

export const config = {
  apiBase: resolveApiBase(),
  wsUrl: resolveWsUrl(),
  apiPrefix: "/api/v1",
  appName: "Empery Control Center",
  version: "0.1.0",
} as const;

export function apiUrl(path: string): string {
  const base = config.apiBase.replace(/\/$/, "");
  const prefix = config.apiPrefix;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.startsWith(prefix)) {
    return `${base}${normalized}`;
  }
  return `${base}${prefix}${normalized}`;
}
