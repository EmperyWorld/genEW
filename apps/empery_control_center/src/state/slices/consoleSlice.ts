import type { StateCreator } from "zustand";
import type { ConsoleLineDTO, ConsoleLineLevel } from "@/api/types";
import type { EccStore } from "@/state/store";

const CONSOLE_CAP = 2000;

export interface ConsoleSlice {
  lines: ConsoleLineDTO[];
  stickToBottom: boolean;
  levelFilter: ConsoleLineLevel | "all";
  serviceFilter: string | null;
  appendConsoleLine: (line: ConsoleLineDTO) => void;
  setStickToBottom: (value: boolean) => void;
  setLevelFilter: (level: ConsoleLineLevel | "all") => void;
  setServiceFilter: (service: string | null) => void;
  clearConsole: () => void;
}

export const createConsoleSlice: StateCreator<
  EccStore,
  [],
  [],
  ConsoleSlice
> = (set) => ({
  lines: [],
  stickToBottom: true,
  levelFilter: "all",
  serviceFilter: null,
  appendConsoleLine: (line) =>
    set((s) => {
      const next = [...s.lines, line];
      if (next.length > CONSOLE_CAP) {
        return { lines: next.slice(next.length - CONSOLE_CAP) };
      }
      return { lines: next };
    }),
  setStickToBottom: (value) => set({ stickToBottom: value }),
  setLevelFilter: (level) => set({ levelFilter: level }),
  setServiceFilter: (service) => set({ serviceFilter: service }),
  clearConsole: () => set({ lines: [] }),
});
