import { create } from "zustand";
import {
  createConnectionSlice,
  type ConnectionSlice,
} from "@/state/slices/connectionSlice";
import {
  createRegistrySlice,
  type RegistrySlice,
} from "@/state/slices/registrySlice";
import {
  createConsoleSlice,
  type ConsoleSlice,
} from "@/state/slices/consoleSlice";
import { createFeedSlice, type FeedSlice } from "@/state/slices/feedSlice";
import {
  createWizardSlice,
  type WizardSlice,
} from "@/state/slices/wizardSlice";
import {
  createSandboxSlice,
  type SandboxSlice,
} from "@/state/slices/sandboxSlice";
import {
  createAutonomousSlice,
  type AutonomousSlice,
} from "@/state/slices/autonomousSlice";
import {
  createAuthSlice,
  type AuthSlice,
} from "@/state/slices/authSlice";
import { createUiSlice, type UiSlice } from "@/state/slices/uiSlice";

export type EccStore = ConnectionSlice &
  RegistrySlice &
  ConsoleSlice &
  FeedSlice &
  WizardSlice &
  SandboxSlice &
  AutonomousSlice &
  AuthSlice &
  UiSlice;

export const useEccStore = create<EccStore>()((...args) => ({
  ...createConnectionSlice(...args),
  ...createRegistrySlice(...args),
  ...createConsoleSlice(...args),
  ...createFeedSlice(...args),
  ...createWizardSlice(...args),
  ...createSandboxSlice(...args),
  ...createAutonomousSlice(...args),
  ...createAuthSlice(...args),
  ...createUiSlice(...args),
}));
