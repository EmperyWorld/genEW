import type { StateCreator } from "zustand";
import type {
  AutonomousJob,
  AutonomousModeResponse,
  LlmHealthResponse,
  ProviderConfigResponse,
} from "@/api/types";
import type { EccStore } from "@/state/store";

export interface AutonomousSlice {
  autonomousMode: AutonomousModeResponse | null;
  autonomousJobs: AutonomousJob[];
  autonomousProviders: ProviderConfigResponse | null;
  llmHealth: LlmHealthResponse | null;
  setAutonomousMode: (mode: AutonomousModeResponse | null) => void;
  setAutonomousJobs: (jobs: AutonomousJob[]) => void;
  setAutonomousProviders: (providers: ProviderConfigResponse | null) => void;
  setLlmHealth: (health: LlmHealthResponse | null) => void;
}

export const createAutonomousSlice: StateCreator<
  EccStore,
  [],
  [],
  AutonomousSlice
> = (set) => ({
  autonomousMode: null,
  autonomousJobs: [],
  autonomousProviders: null,
  llmHealth: null,
  setAutonomousMode: (mode) => set({ autonomousMode: mode }),
  setAutonomousJobs: (jobs) => set({ autonomousJobs: jobs }),
  setAutonomousProviders: (providers) =>
    set({ autonomousProviders: providers }),
  setLlmHealth: (health) => set({ llmHealth: health }),
});
