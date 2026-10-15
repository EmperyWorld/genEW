import { useEccStore } from "@/state/store";

/**
 * True when market auth is on (or unknown) and the operator has no session.
 * Lab mode (`authRequired === false`) allows guest mutate paths.
 */
export function useNeedsLogin(): boolean {
  const authHydrated = useEccStore((s) => s.authHydrated);
  const accessToken = useEccStore((s) => s.accessToken);
  const authRequired = useEccStore((s) => s.authRequired);

  if (!authHydrated) {
    return false;
  }
  if (authRequired === false) {
    return false;
  }
  return !accessToken;
}
