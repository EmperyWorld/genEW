/** Control Center ops surface via ECC BFF (:8006) — health mesh + registry. */

import { eccApiBase, getEccToken } from "./eccAuth";

export type ServiceHealthItem = {
  name: string;
  health: string;
  checked_at: string;
  detail?: string | null;
};

export type ServiceHealthListResponse = {
  services: ServiceHealthItem[];
  ok_count: number;
  degraded_count: number;
  down_count: number;
  unknown_count: number;
  alert: boolean;
};

export type RegistryService = {
  name: string;
  version: string;
  features: string[];
};

export type RegistrySnapshotResponse = {
  snapshot: {
    generated_at: string;
    services: RegistryService[];
  };
};

async function eccFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const url = new URL(`${eccApiBase()}/api/v1${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const headers = new Headers(rest.headers);
  if (!headers.has("Content-Type") && rest.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getEccToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url.toString(), { ...rest, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} → ${res.status} ${text.slice(0, 240)}`);
  }
  return res.json() as Promise<T>;
}

export const controlCenterClient = {
  getServiceHealth(): Promise<ServiceHealthListResponse> {
    return eccFetch("/health/services");
  },

  getRegistry(): Promise<RegistrySnapshotResponse> {
    return eccFetch("/registry");
  },

  refreshRegistry(): Promise<RegistrySnapshotResponse> {
    return eccFetch("/registry/refresh", { method: "POST" });
  },
};
