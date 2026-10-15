import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, LogIn } from "lucide-react";
import { BrandMark } from "@/features/shell/BrandMark";
import { Button } from "@/components/Button";
import { PATHS } from "@/routes/paths";

export interface LoginGatePanelProps {
  /** i18n key for the headline (default: auth.guest.loginToBirth). */
  messageKey?: string;
  /** Optional support line i18n key. */
  supportKey?: string;
  /** Override next path after login; defaults to current location. */
  nextPath?: string;
  /** Compact strip for embedding above forms. */
  compact?: boolean;
  className?: string;
}

/** Full-bleed or compact CTA when guest must sign in to mutate. */
export function LoginGatePanel({
  messageKey = "auth.guest.loginToBirth",
  supportKey = "auth.guest.mutateRequiresLogin",
  nextPath,
  compact = false,
  className = "",
}: LoginGatePanelProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const next = encodeURIComponent(
    nextPath ?? `${location.pathname}${location.search}`,
  );
  const loginHref = `${PATHS.login}?next=${next}`;

  if (compact) {
    return (
      <div
        className={[
          "flex flex-col gap-3 rounded-lg border border-signal/40 bg-signal-soft/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
          className,
        ].join(" ")}
        role="region"
        aria-label={t(messageKey)}
      >
        <div className="min-w-0 space-y-1">
          <p className="font-display text-sm font-semibold text-ink">
            {t(messageKey)}
          </p>
          <p className="font-body text-xs text-ink-muted">{t(supportKey)}</p>
        </div>
        <Button asChild className="shrink-0">
          <Link to={loginHref}>
            <LogIn size={16} strokeWidth={1.5} aria-hidden className="mr-1.5" />
            {t("auth.login.cta")}
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden className="ml-1" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={[
        "relative overflow-hidden rounded-lg border border-line bg-panel/80 px-6 py-10",
        className,
      ].join(" ")}
      role="region"
      aria-label={t(messageKey)}
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 35%, rgba(61,220,151,0.10), transparent 60%)",
        }}
      />
      <div className="relative z-10 mx-auto flex max-w-md flex-col items-center gap-5 text-center">
        <BrandMark size="compact" />
        <div className="space-y-2">
          <h2 className="font-display text-xl font-semibold text-ink">
            {t(messageKey)}
          </h2>
          <p className="font-body text-sm text-ink-muted">{t(supportKey)}</p>
        </div>
        <Button asChild>
          <Link to={loginHref}>
            {t("auth.login.cta")}
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden className="ml-1.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
