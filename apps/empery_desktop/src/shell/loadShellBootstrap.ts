import { fetchShellBootstrap } from "@/api/desktopShell";
import type { ShellBootstrap } from "./types";

export async function loadShellBootstrap(
  isCancelled: () => boolean,
  setBoot: (boot: ShellBootstrap) => void,
  setError: (error: string | null) => void,
): Promise<void> {
  try {
    const data = await fetchShellBootstrap();
    if (!isCancelled()) {
      setBoot(data);
      setError(null);
    }
  } catch (err: unknown) {
    if (!isCancelled()) {
      setError(err instanceof Error ? err.message : "bootstrap failed");
    }
  }
}
