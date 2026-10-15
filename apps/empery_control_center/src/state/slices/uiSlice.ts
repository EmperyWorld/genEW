import type { StateCreator } from "zustand";
import type { EccStore } from "@/state/store";

export type OpsFocusPanel = "map" | "console" | "feed" | "balanced";

export interface UiSlice {
  opsFocus: OpsFocusPanel;
  consoleCollapsed: boolean;
  feedCollapsed: boolean;
  reducedMotion: boolean;
  mapFitLocked: boolean;
  setOpsFocus: (focus: OpsFocusPanel) => void;
  setConsoleCollapsed: (collapsed: boolean) => void;
  setFeedCollapsed: (collapsed: boolean) => void;
  setReducedMotion: (value: boolean) => void;
  setMapFitLocked: (locked: boolean) => void;
}

export const createUiSlice: StateCreator<EccStore, [], [], UiSlice> = (
  set,
) => ({
  opsFocus: "balanced",
  consoleCollapsed: false,
  feedCollapsed: false,
  reducedMotion: false,
  mapFitLocked: false,
  setOpsFocus: (focus) => set({ opsFocus: focus }),
  setConsoleCollapsed: (collapsed) => set({ consoleCollapsed: collapsed }),
  setFeedCollapsed: (collapsed) => set({ feedCollapsed: collapsed }),
  setReducedMotion: (value) => set({ reducedMotion: value }),
  setMapFitLocked: (locked) => set({ mapFitLocked: locked }),
});
