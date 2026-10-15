import { eccFetch } from "./http";
import type { HealthResponse, ServiceHealthListResponse } from "./types";

export const healthClient = {
  getGatewayHealth(signal?: AbortSignal): Promise<HealthResponse> {
    return eccFetch<HealthResponse>("/health", { signal });
  },

  /**
   * Optional batch health — gateway may not expose this in v0.1.
   * Callers should catch and fall back to `unknown`.
   */
  getServiceHealth(signal?: AbortSignal): Promise<ServiceHealthListResponse> {
    return eccFetch<ServiceHealthListResponse>("/health/services", { signal });
  },
};
