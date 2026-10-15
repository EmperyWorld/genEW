import { useEffect } from "react";
import { authClient, toAuthUser } from "@/api/authClient";
import { useEccStore } from "@/state/store";

/** Restore session token from sessionStorage and optionally load /auth/me. */
export function AuthBootstrap() {
  const hydrateAuth = useEccStore((s) => s.hydrateAuth);
  const accessToken = useEccStore((s) => s.accessToken);
  const authHydrated = useEccStore((s) => s.authHydrated);
  const setSession = useEccStore((s) => s.setSession);
  const clearSession = useEccStore((s) => s.clearSession);

  useEffect(() => {
    hydrateAuth();
  }, [hydrateAuth]);

  useEffect(() => {
    if (!authHydrated || !accessToken) return;

    let cancelled = false;
    void authClient
      .me(accessToken)
      .then((user) => {
        if (!cancelled) {
          setSession(accessToken, toAuthUser(user));
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearSession();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authHydrated, accessToken, setSession, clearSession]);

  return null;
}
