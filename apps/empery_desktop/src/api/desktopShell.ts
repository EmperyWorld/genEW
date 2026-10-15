import type { ShellBootstrap } from "@/shell/types";
import { peerApiBase } from "./peerBase";

export type { DesktopItem, ShellBootstrap } from "@/shell/types";

const base = peerApiBase(8020, import.meta.env.VITE_DESKTOP_SHELL_API_BASE);

export async function fetchShellBootstrap(): Promise<ShellBootstrap> {
  const res = await fetch(`${base}/api/v1/shell-bootstrap`);
  if (!res.ok) {
    throw new Error(`shell-bootstrap failed: ${res.status}`);
  }
  return res.json() as Promise<ShellBootstrap>;
}
