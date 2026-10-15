import type { StateCreator } from "zustand";
import type { WizardSessionResponse } from "@/api/types";
import type { EccStore } from "@/state/store";

export interface WizardSlice {
  session: WizardSessionResponse | null;
  setWizardSession: (session: WizardSessionResponse | null) => void;
}

export const createWizardSlice: StateCreator<EccStore, [], [], WizardSlice> = (
  set,
) => ({
  session: null,
  setWizardSession: (session) => set({ session }),
});
