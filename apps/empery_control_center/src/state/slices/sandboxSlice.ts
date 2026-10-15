import type { StateCreator } from "zustand";
import type {
  SandboxProbeResponse,
  SandboxSessionResponse,
} from "@/api/types";
import type { EccStore } from "@/state/store";

export interface SandboxSlice {
  sandboxSession: SandboxSessionResponse | null;
  lastProbe: SandboxProbeResponse | null;
  setSandboxSession: (session: SandboxSessionResponse | null) => void;
  setLastProbe: (probe: SandboxProbeResponse | null) => void;
}

export const createSandboxSlice: StateCreator<
  EccStore,
  [],
  [],
  SandboxSlice
> = (set) => ({
  sandboxSession: null,
  lastProbe: null,
  setSandboxSession: (session) => set({ sandboxSession: session }),
  setLastProbe: (probe) => set({ lastProbe: probe }),
});
