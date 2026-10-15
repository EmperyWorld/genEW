/** Factory lifecycle via ECC BFF — delete only when user_created / deletable. */

import { eccApiBase, getEccToken } from "./eccAuth";

export type LifecycleMeta = {
  service_name: string;
  user_created: boolean;
  seed_product: boolean;
  deletable: boolean;
  force_delete_env?: boolean;
};

async function eccFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${eccApiBase()}/api/v1${path}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getEccToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} → ${res.status} ${text.slice(0, 240)}`);
  }
  return res.json() as Promise<T>;
}

export const factoryClient = {
  lifecycleMeta(serviceName: string): Promise<LifecycleMeta> {
    return eccFetch(
      `/factory/services/${encodeURIComponent(serviceName)}/lifecycle-meta`,
    );
  },

  lifecycle(
    serviceName: string,
    action: "enable" | "disable" | "delete",
  ): Promise<{
    ok: boolean;
    service_name: string;
    action: string;
    result: Record<string, unknown>;
    error?: string | null;
  }> {
    return eccFetch(
      `/factory/services/${encodeURIComponent(serviceName)}/lifecycle`,
      {
        method: "POST",
        body: JSON.stringify({ action }),
      },
    );
  },
};
