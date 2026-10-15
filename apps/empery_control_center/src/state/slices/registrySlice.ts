import type { StateCreator } from "zustand";
import type { ServiceNodeDTO } from "@/api/types";
import type { EccStore } from "@/state/store";

export interface RegistrySlice {
  services: ServiceNodeDTO[];
  selectedServiceId: string | null;
  generatedAt: string | null;
  setRegistry: (services: ServiceNodeDTO[], generatedAt?: string) => void;
  selectService: (id: string | null) => void;
  upsertService: (node: ServiceNodeDTO) => void;
  removeService: (name: string) => void;
}

export const createRegistrySlice: StateCreator<
  EccStore,
  [],
  [],
  RegistrySlice
> = (set) => ({
  services: [],
  selectedServiceId: null,
  generatedAt: null,
  setRegistry: (services, generatedAt) =>
    set({
      services,
      generatedAt: generatedAt ?? new Date().toISOString(),
    }),
  selectService: (id) => set({ selectedServiceId: id }),
  upsertService: (node) =>
    set((s) => {
      const name = node.manifest.name;
      const idx = s.services.findIndex((n) => n.manifest.name === name);
      if (idx === -1) return { services: [...s.services, node] };
      const next = s.services.slice();
      next[idx] = node;
      return { services: next };
    }),
  removeService: (name) =>
    set((s) => ({
      services: s.services.filter((n) => n.manifest.name !== name),
      selectedServiceId:
        s.selectedServiceId === name ? null : s.selectedServiceId,
    })),
});
