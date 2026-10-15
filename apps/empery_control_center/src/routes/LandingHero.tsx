import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/features/shell/BrandMark";
import { brandReveal } from "@/theme/motion";
import { PATHS } from "@/routes/paths";
import { useEccTheme } from "@/features/shell/ThemeProvider";
import { useEccStore } from "@/state/store";

/**
 * Brand-first first viewport: Empery, one headline, one line, one CTA.
 * Full-bleed atmospheric field — no card grid, no stats strip.
 */
export function LandingHero() {
  const { t } = useTranslation();
  const { reducedMotion } = useEccTheme();
  const accessToken = useEccStore((s) => s.accessToken);
  const authRequired = useEccStore((s) => s.authRequired);
  const variants = reducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
      }
    : brandReveal;

  const authed = Boolean(accessToken);
  const labMode = authRequired === false;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 40%, rgba(61,220,151,0.08), transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(176,141,87,0.06), transparent 45%)",
        }}
      />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-10 text-center">
        <motion.div
          initial="initial"
          animate="animate"
          variants={variants}
          className="flex flex-col items-center gap-8"
        >
          <BrandMark size="hero" />
          <div className="max-w-xl space-y-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
              {t("landing.headline")}
            </h1>
            <p className="font-body text-base text-ink-muted">
              {t("landing.support")}
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            {authed ? (
              <Link
                to={PATHS.ops}
                className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-panel px-5 py-2.5 font-body text-sm font-medium text-signal transition-colors hover:border-signal hover:bg-signal-soft"
              >
                {t("landing.cta")}
                <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
              </Link>
            ) : (
              <>
                <Link
                  to={PATHS.register}
                  className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-panel px-5 py-2.5 font-body text-sm font-medium text-signal transition-colors hover:border-signal hover:bg-signal-soft"
                >
                  {t("landing.ctaRegister")}
                  <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
                </Link>
                {labMode ? (
                  <Link
                    to={PATHS.ops}
                    className="font-body text-sm text-ink-muted underline-offset-2 hover:text-signal hover:underline"
                  >
                    {t("landing.ctaOpsLab")}
                  </Link>
                ) : null}
                <Link
                  to={PATHS.login}
                  className="font-body text-sm text-ink-muted underline-offset-2 hover:text-signal hover:underline"
                >
                  {t("landing.loginSecondary")}
                </Link>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
