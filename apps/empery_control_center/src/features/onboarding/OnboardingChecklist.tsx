import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { PATHS } from "@/routes/paths";
import { useEccStore } from "@/state/store";
import { cn } from "@/lib/cn";

const DISMISS_KEY = "ecc.onboarding.dismissed.v2";
const MAP_KEY = "ecc.onboarding.mapVisited.v2";
const AUTONOMOUS_KEY = "ecc.onboarding.autonomousVisited.v2";
const HEALTH_KEY = "ecc.onboarding.healthVisited.v2";
const WIZARD_KEY = "ecc.onboarding.wizardVisited.v2";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function OnboardingChecklist() {
  const { t } = useTranslation();
  const accessToken = useEccStore((s) => s.accessToken);
  const [dismissed, setDismissed] = useState(() => readFlag(DISMISS_KEY));
  const [mapVisited, setMapVisited] = useState(() => readFlag(MAP_KEY));
  const [autonomousVisited, setAutonomousVisited] = useState(() =>
    readFlag(AUTONOMOUS_KEY),
  );
  const [healthVisited, setHealthVisited] = useState(() => readFlag(HEALTH_KEY));
  const [wizardVisited, setWizardVisited] = useState(() => readFlag(WIZARD_KEY));

  const identityDone = Boolean(accessToken);

  const steps = useMemo(
    () => [
      {
        id: "identity",
        label: t("onboarding.stepIdentity"),
        done: identityDone,
        href: PATHS.login,
        onVisit: undefined,
      },
      {
        id: "map",
        label: t("onboarding.stepMap"),
        done: mapVisited,
        href: PATHS.opsMap,
        onVisit: () => {
          writeFlag(MAP_KEY);
          setMapVisited(true);
        },
      },
      {
        id: "health",
        label: t("onboarding.stepHealth"),
        done: healthVisited,
        href: PATHS.opsHealth,
        onVisit: () => {
          writeFlag(HEALTH_KEY);
          setHealthVisited(true);
        },
      },
      {
        id: "autonomous",
        label: t("onboarding.stepAutonomous"),
        done: autonomousVisited,
        href: PATHS.opsAutonomous,
        onVisit: () => {
          writeFlag(AUTONOMOUS_KEY);
          setAutonomousVisited(true);
        },
      },
      {
        id: "wizard",
        label: t("onboarding.stepTask"),
        done: wizardVisited,
        href: PATHS.wizard,
        onVisit: () => {
          writeFlag(WIZARD_KEY);
          setWizardVisited(true);
        },
      },
    ],
    [
      t,
      identityDone,
      mapVisited,
      healthVisited,
      autonomousVisited,
      wizardVisited,
    ],
  );

  const allDone = steps.every((step) => step.done);

  const dismiss = useCallback(() => {
    writeFlag(DISMISS_KEY);
    setDismissed(true);
  }, []);

  if (dismissed || allDone) {
    return null;
  }

  if (!identityDone) {
    return null;
  }

  return (
    <aside
      className="mx-2 mt-2 rounded-lg border border-signal/25 bg-panel/95 px-4 py-3 shadow-sm backdrop-blur-sm"
      aria-labelledby="onboarding-heading"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2
            id="onboarding-heading"
            className="font-display text-sm font-semibold text-ink"
          >
            {t("onboarding.title")}
          </h2>
          <p className="mt-0.5 font-body text-xs text-ink-muted">
            {t("onboarding.subtitle")}
          </p>
          <p className="mt-1 font-body text-xs text-ink-faint">
            {t("onboarding.valueProp")}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md p-1 text-ink-muted transition-colors hover:bg-line hover:text-ink"
          aria-label={t("common.dismiss")}
        >
          <X size={14} strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      <nav
        className="mb-3 flex flex-wrap gap-2"
        aria-label={t("onboarding.opsLinksAria")}
      >
        <Link
          to={PATHS.opsMap}
          className="rounded-md border border-line px-2 py-1 font-body text-[11px] text-signal hover:bg-signal-soft"
        >
          {t("onboarding.linkMap")}
        </Link>
        <Link
          to={PATHS.opsAutonomous}
          className="rounded-md border border-line px-2 py-1 font-body text-[11px] text-signal hover:bg-signal-soft"
        >
          {t("onboarding.linkAutonomous")}
        </Link>
        <Link
          to={PATHS.opsHealth}
          className="rounded-md border border-line px-2 py-1 font-body text-[11px] text-signal hover:bg-signal-soft"
        >
          {t("onboarding.linkHealth")}
        </Link>
      </nav>

      <ol className="space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              to={step.href}
              onClick={step.onVisit}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 font-body text-sm transition-colors",
                step.done
                  ? "text-ink-muted"
                  : "text-ink hover:bg-signal-soft hover:text-signal",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  step.done
                    ? "border-ok/50 bg-signal-soft text-ok"
                    : "border-line text-ink-faint",
                )}
                aria-hidden
              >
                {step.done ? <Check size={12} strokeWidth={2} /> : null}
              </span>
              <span className={step.done ? "line-through opacity-80" : undefined}>
                {step.label}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </aside>
  );
}
