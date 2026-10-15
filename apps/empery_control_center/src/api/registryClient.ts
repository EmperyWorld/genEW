import { eccFetch } from "./http";
import type { RegistrySnapshotResponse } from "./types";

export const registryClient = {
  getSnapshot(signal?: AbortSignal): Promise<RegistrySnapshotResponse> {
    return eccFetch<RegistrySnapshotResponse>("/registry", { signal });
  },

  refresh(signal?: AbortSignal): Promise<RegistrySnapshotResponse> {
    return eccFetch<RegistrySnapshotResponse>("/registry/refresh", {
      method: "POST",
      signal,
    });
  },
};
