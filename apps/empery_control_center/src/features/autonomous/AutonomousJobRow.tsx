import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/Button";
import type { AutonomousJob } from "@/api/types";
import { cn } from "@/lib/cn";
import { ServiceLifecycleControls } from "@/features/service-wizard/ServiceLifecycleControls";
import {
  primaryJobStatusLabel,
  resolveVerifyStatus,
} from "./autonomousJobDisplay";
import {
  jobHasVisibleOutcome,
  parseJobAssemblyOutcome,
} from "./jobOutcome";

export interface AutonomousJobRowProps {
  job: AutonomousJob;
  busy?: boolean;
  writeDisabled?: boolean;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onServiceDeleted?: (serviceName: string) => void;
}

function verifyBadgeClass(status: string): string {
  switch (status.toUpperCase()) {
    case "PASSED":
      return "border-ok/40 bg-signal-soft text-ok";
    case "FAILED":
      return "border-red-500/40 bg-red-500/10 text-red-400";
    case "UNKNOWN":
    case "PENDING":
      return "border-degraded/40 bg-degraded/10 text-degraded";
    default:
      return "border-line text-ink-muted";
  }
}

function formatUpdated(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AutonomousJobRow({
  job,
  busy = false,
  writeDisabled = false,
  onPause,
  onResume,
  onCancel,
  onServiceDeleted,
}: AutonomousJobRowProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const terminal = ["completed", "failed", "cancelled"].includes(job.status);
  const verifyStatus = resolveVerifyStatus(job);
  const primaryStatus = primaryJobStatusLabel(job);
  const outcome = parseJobAssemblyOutcome(job);
  const showOutcome = jobHasVisibleOutcome(outcome);

  const statusLabel = (status: string) =>
    t(`jobs.status.${status}`, { defaultValue: status });
  const stageLabel = (stage: string) =>
    t(`jobs.stage.${stage}`, { defaultValue: stage });
  const verifyLabel = (status: string) =>
    t(`jobs.verify.${status}`, { defaultValue: status });

  return (
    <>
      <tr
        className={cn(
          "border-b border-line align-middle transition-colors",
          open ? "bg-field/60" : "hover:bg-field/40",
        )}
      >
        <td className="px-1 py-1.5">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-muted hover:bg-panel-raised hover:text-ink"
            aria-expanded={open}
            aria-label={t("autonomous.table.toggleDetails")}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                open && "rotate-90",
              )}
              strokeWidth={1.75}
            />
          </button>
        </td>
        <td className="max-w-70 px-2 py-1.5">
          <button
            type="button"
            className="block w-full truncate text-left font-body text-xs text-ink hover:text-signal"
            title={job.intention_text}
            onClick={() => setOpen((v) => !v)}
          >
            {job.intention_text}
          </button>
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-ink-muted">
          {job.service_name || "—"}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5">
          {verifyStatus ? (
            <span
              className={cn(
                "inline-block rounded border px-1.5 py-0.5 font-body text-[10px] font-medium uppercase tracking-wide",
                verifyBadgeClass(verifyStatus),
              )}
              title={t("autonomous.verifyBadgeHint")}
            >
              {verifyLabel(verifyStatus)}
            </span>
          ) : (
            <span className="font-mono text-[11px] text-ink-muted">
              {statusLabel(primaryStatus)}
            </span>
          )}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-ink-muted">
          {stageLabel(job.stage)}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-ink-muted">
          {job.provider_id}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-ink-faint">
          {formatUpdated(job.updated_at, i18n.language)}
        </td>
        <td className="px-2 py-1.5">
          <div className="flex flex-nowrap items-center gap-1">
            {job.status === "paused" ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || writeDisabled}
                onClick={() => onResume(job.id)}
              >
                {t("autonomous.resume")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || terminal || writeDisabled}
                onClick={() => onPause(job.id)}
              >
                {t("autonomous.pause")}
              </Button>
            )}
            <Button
              size="sm"
              variant="danger"
              disabled={busy || terminal || writeDisabled}
              onClick={() => onCancel(job.id)}
            >
              {t("autonomous.cancel")}
            </Button>
          </div>
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-line bg-field/30">
          <td colSpan={8} className="px-3 py-3">
            <div className="space-y-3">
              <p className="whitespace-pre-wrap wrap-break-word font-body text-sm text-ink">
                {job.intention_text}
              </p>
              {verifyStatus && primaryStatus !== verifyStatus ? (
                <p className="font-mono text-[11px] text-ink-faint">
                  {statusLabel(job.status)}
                </p>
              ) : null}
              {showOutcome ? (
                <div
                  className="space-y-1.5 rounded-md border border-line/80 bg-panel/40 px-3 py-2"
                  data-testid="autonomous-job-outcome"
                >
                  {outcome.selectedOption?.title ||
                  outcome.selectedOption?.delta_summary ? (
                    <div>
                      <p className="font-body text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                        {t("autonomous.outcome.evolvePick")}
                      </p>
                      {outcome.selectedOption?.title ? (
                        <p className="font-body text-xs font-medium text-ink">
                          {outcome.selectedOption.title}
                        </p>
                      ) : null}
                      {outcome.selectedOption?.delta_summary ? (
                        <p className="mt-0.5 font-body text-xs text-ink-muted">
                          {outcome.selectedOption.delta_summary}
                        </p>
                      ) : null}
                      {outcome.selectedOption?.touches?.length ? (
                        <p className="mt-0.5 font-mono text-[10px] text-ink-faint">
                          {outcome.selectedOption.touches.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {outcome.resultSummary ? (
                    <p className="font-body text-xs text-ink-muted">
                      <span className="font-semibold text-ink-faint">
                        {t("autonomous.outcome.summary")}:{" "}
                      </span>
                      {outcome.resultSummary}
                    </p>
                  ) : null}
                  {(outcome.scaffoldProfile ||
                    outcome.recipePacks.length > 0 ||
                    outcome.extractAdaptCount > 0 ||
                    outcome.scaffoldCount > 0 ||
                    outcome.atomFileCount > 0) && (
                    <p
                      className="font-mono text-[10px] text-ink-faint"
                      data-testid="autonomous-job-factory"
                    >
                      {[
                        outcome.scaffoldProfile
                          ? t("autonomous.outcome.profile", {
                              profile: outcome.scaffoldProfile,
                            })
                          : null,
                        outcome.packCount > 0
                          ? t("autonomous.outcome.packCount", {
                              count: outcome.packCount,
                            })
                          : null,
                        outcome.recipePacks.length
                          ? t("autonomous.outcome.packs", {
                              packs: outcome.recipePacks
                                .slice(0, 4)
                                .join(", "),
                            })
                          : null,
                        outcome.atomFileCount > 0
                          ? t("autonomous.outcome.atomFiles", {
                              count: outcome.atomFileCount,
                            })
                          : null,
                        outcome.atomFilesUnwired.length > 0
                          ? t("autonomous.outcome.atomUnwired", {
                              count: outcome.atomFilesUnwired.length,
                            })
                          : null,
                        outcome.extractAdaptCount > 0
                          ? t("autonomous.outcome.extractAdapt", {
                              count: outcome.extractAdaptCount,
                            })
                          : null,
                        outcome.scaffoldCount > 0
                          ? t("autonomous.outcome.scaffold", {
                              count: outcome.scaffoldCount,
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {outcome.genericWarned ? (
                    <p className="font-body text-[11px] text-degraded">
                      {t("autonomous.outcome.genericWarn")}
                    </p>
                  ) : null}
                  {outcome.artifactTail.length ? (
                    <div>
                      <p className="font-body text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                        {t("autonomous.outcome.artifacts")}
                      </p>
                      <ul className="mt-0.5 space-y-0.5 font-mono text-[10px] text-ink-muted">
                        {outcome.artifactTail.map((path) => (
                          <li key={path} className="truncate" title={path}>
                            {path}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {job.service_name ? (
                <ServiceLifecycleControls
                  serviceName={job.service_name}
                  disabled={writeDisabled}
                  onDeleted={onServiceDeleted}
                />
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
