import { useTranslation } from "react-i18next";
import type { LlmHealthResponse } from "@/api/types";

export interface LlmHealthBeaconProps {
  health: LlmHealthResponse | null;
}

function tone(status: LlmHealthResponse["status"] | undefined): string {
  switch (status) {
    case "ok":
      return "bg-[var(--ecc-ok)]";
    case "degraded":
      return "bg-[var(--ecc-degraded)]";
    case "down":
      return "bg-[var(--ecc-down)]";
    default:
      return "bg-[var(--ecc-unknown)]";
  }
}

export function LlmHealthBeacon({ health }: LlmHealthBeaconProps) {
  const { t } = useTranslation();
  const label = health
    ? `${health.status}${health.latency_ms != null ? ` ${health.latency_ms}ms` : ""}`
    : t("autonomous.unknown");

  return (
    <div
      className="inline-flex items-center gap-2 text-xs text-[var(--ecc-ink-muted)]"
      role="status"
      aria-live="polite"
      title={health?.detail ?? health?.base_url ?? t("autonomous.llmHealth")}
    >
      <span className="font-[Sora,sans-serif] tracking-wide">
        {t("autonomous.llm")}
      </span>
      <span
        className={`inline-block h-2 w-2 rounded-sm ${tone(health?.status)}`}
        aria-hidden
      />
      <span className="font-mono">{label}</span>
    </div>
  );
}
