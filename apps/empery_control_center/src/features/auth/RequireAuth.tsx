import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useEccStore } from "@/state/store";
import { PATHS } from "@/routes/paths";

export interface RequireAuthProps {
  children: ReactNode;
}

/** Redirect to login when no session token is present. */
export function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();
  const authHydrated = useEccStore((s) => s.authHydrated);
  const accessToken = useEccStore((s) => s.accessToken);

  if (!authHydrated) {
    return null;
  }

  if (!accessToken) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`${PATHS.login}?next=${next}`} replace />;
  }

  return <>{children}</>;
}

/** Optional hook for pages that need redirect side-effect without wrapper. */
export function useRequireAuthRedirect(): boolean {
  const authHydrated = useEccStore((s) => s.authHydrated);
  const accessToken = useEccStore((s) => s.accessToken);

  useEffect(() => {
    if (!authHydrated || accessToken) return;
    const next = encodeURIComponent(
      `${window.location.pathname}${window.location.search}`,
    );
    window.location.assign(`${PATHS.login}?next=${next}`);
  }, [authHydrated, accessToken]);

  return authHydrated && Boolean(accessToken);
}
