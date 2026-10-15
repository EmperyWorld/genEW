import { Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PATHS } from "@/routes/paths";

export interface WizardAgentWaitingPanelProps {
  jobId: string;
  pickupHint?: string | null;
  intent?: string;
  serviceName?: string;
}

export function WizardAgentWaitingPanel({
  jobId,
  pickupHint,
  intent = "",
  serviceName = "",
}: WizardAgentWaitingPanelProps) {
  const { t } = useTranslation();

  const autonomousParams = new URLSearchParams();
  autonomousParams.set("ecc_job_id", jobId);
  if (intent.trim()) autonomousParams.set("intent", intent.trim());
  if (serviceName.trim()) autonomousParams.set("service", serviceName.trim());
  const autonomousHref = `${PATHS.opsAutonomous}?${autonomousParams.toString()}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-sm border border-signal/30 bg-signal-soft/60 px-4 py-3 text-sm text-ink"
    >
      <div className="flex items-start gap-2">
        <Clock
          className="mt-0.5 h-4 w-4 shrink-0 text-signal"
          strokeWidth={1.5}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-medium text-signal">
              {t("wizard.agentWaiting.title")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {t("wizard.agentWaiting.body")}
            </p>
          </div>

          {pickupHint ? (
            <div className="rounded-sm border border-line bg-panel px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                {t("wizard.agentWaiting.pickupHintLabel")}
              </p>
              <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink">
                {pickupHint}
              </p>
            </div>
          ) : null}

          <Link
            to={autonomousHref}
            className="inline-flex items-center justify-center rounded-md border border-signal/50 bg-signal-soft px-4 py-2 text-xs font-medium text-signal transition-colors hover:border-signal"
          >
            {t("wizard.agentWaiting.handoffAutonomous")}
          </Link>

          <ol className="list-decimal space-y-1 pl-4 text-xs text-ink-muted">
            <li>{t("wizard.agentWaiting.stepPreferred")}</li>
            <li>{t("wizard.agentWaiting.stepClaim", { id: jobId })}</li>
            {import.meta.env.VITE_EMPERY_CURSOR_SALVAGE === "1" ? (
              <li>{t("wizard.agentWaiting.stepCursor", { id: jobId })}</li>
            ) : null}
          </ol>
        </div>
      </div>
    </div>
  );
}
