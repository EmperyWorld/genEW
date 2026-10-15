import type { StateCreator } from "zustand";
import type { EventBusBackend, WsConnectionStatus } from "@/api/types";
import type { EccStore } from "@/state/store";

export interface FabricHealthSnapshot {
  event_bus_backend: EventBusBackend;
  event_bus_ok: boolean;
  redis_configured: boolean;
  llm_ready: boolean | null;
  checked_at: string;
}

export interface ConnectionSlice {
  connectionStatus: WsConnectionStatus;
  lastPingAt: string | null;
  reconnectAttempts: number;
  fabricHealth: FabricHealthSnapshot | null;
  /** From ECC /health auth_required — null until first poll. */
  authRequired: boolean | null;
  setConnectionStatus: (status: WsConnectionStatus) => void;
  setLastPingAt: (iso: string | null) => void;
  bumpReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setFabricHealth: (snapshot: FabricHealthSnapshot | null) => void;
  setAuthRequired: (value: boolean | null) => void;
}

export const createConnectionSlice: StateCreator<
  EccStore,
  [],
  [],
  ConnectionSlice
> = (set) => ({
  connectionStatus: "idle",
  lastPingAt: null,
  reconnectAttempts: 0,
  fabricHealth: null,
  authRequired: null,
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setLastPingAt: (iso) => set({ lastPingAt: iso }),
  bumpReconnectAttempts: () =>
    set((s) => ({ reconnectAttempts: s.reconnectAttempts + 1 })),
  resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),
  setFabricHealth: (snapshot) => set({ fabricHealth: snapshot }),
  setAuthRequired: (value) => set({ authRequired: value }),
});
