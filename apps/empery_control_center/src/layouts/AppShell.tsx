import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogIn, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/features/shell/BrandMark";
import { LanguageSwitcher } from "@/features/shell/LanguageSwitcher";
import { NavPrimary } from "@/features/shell/NavPrimary";
import { StatusBeacon } from "@/features/shell/StatusBeacon";
import { IconButton } from "@/components/IconButton";
import { authClient } from "@/api/authClient";
import { PATHS } from "@/routes/paths";
import { useNeedsLogin } from "@/features/auth/useNeedsLogin";
import { useEccStore } from "@/state/store";

/**
 * Brand rail + primary nav + stage outlet.
 * Guest chrome shows Login + read-only banner when market auth is on.
 * Live WS is owned solely by SocketBridge in App — do not mount useEccSocket here.
 */
export function AppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const authUser = useEccStore((s) => s.authUser);
  const accessToken = useEccStore((s) => s.accessToken);
  const clearSession = useEccStore((s) => s.clearSession);
  const signedIn = Boolean(accessToken);
  const needsLogin = useNeedsLogin();
  const loginNext = encodeURIComponent(
    `${location.pathname}${location.search}`,
  );

  async function onLogout() {
    try {
      await authClient.logout();
    } catch {
      /* stateless JWT — clear locally even if BFF unreachable */
    }
    clearSession();
    navigate(PATHS.login, { replace: true });
  }

  return (
    <div className="flex h-full min-h-0 w-full max-w-full min-w-0 flex-col overflow-x-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-field/80 px-4 py-3 backdrop-blur-sm md:px-6">
        <BrandMark size="compact" />
        <div className="flex flex-1 items-center justify-end gap-4 md:justify-between md:pl-8">
          <div className="hidden md:block">
            <NavPrimary />
          </div>
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <NavPrimary />
            </div>
            {signedIn && authUser ? (
              <span
                className="hidden max-w-[12rem] truncate font-body text-xs text-ink-muted lg:inline"
                title={authUser.email}
              >
                {authUser.email}
              </span>
            ) : null}
            {signedIn ? (
              <IconButton
                label={t("auth.logout")}
                onClick={() => void onLogout()}
              >
                <LogOut size={16} strokeWidth={1.5} aria-hidden />
              </IconButton>
            ) : (
              <Link
                to={`${PATHS.login}?next=${loginNext}`}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 font-body text-xs text-ink-muted transition-colors hover:text-signal"
                aria-label={t("auth.login.submit")}
              >
                <LogIn size={16} strokeWidth={1.5} aria-hidden />
                <span className="hidden sm:inline">{t("auth.login.submit")}</span>
              </Link>
            )}
            <LanguageSwitcher />
            <StatusBeacon />
          </div>
        </div>
      </header>
      {needsLogin ? (
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-signal/25 bg-signal-soft/30 px-4 py-2 md:px-6"
          role="status"
        >
          <p className="font-body text-xs text-ink-muted">
            {t("auth.guest.readOnlyChrome")}
          </p>
          <Link
            to={`${PATHS.login}?next=${loginNext}`}
            className="font-body text-xs font-medium text-signal hover:underline"
          >
            {t("auth.login.cta")}
          </Link>
        </div>
      ) : null}
      <main className="ecc-stage flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
