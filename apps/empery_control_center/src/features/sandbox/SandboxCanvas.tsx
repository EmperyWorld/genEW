import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { humanizeServiceName } from "../../lib/format";
import type { SandboxProbeResponse } from "../../api/types";
import type { SandboxFormState } from "./useSandboxSession";

export interface SandboxCanvasProps {
  form: SandboxFormState;
  lastProbe: SandboxProbeResponse | null;
}

export function SandboxCanvas({ form, lastProbe }: SandboxCanvasProps) {
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-[200px] flex-1 flex-col justify-center overflow-hidden rounded-[var(--ecc-radius-md)] border border-[var(--ecc-line)] bg-[var(--ecc-field)] p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 30% 40%, var(--ecc-signal-soft), transparent 55%), radial-gradient(ellipse at 70% 60%, rgba(176,141,87,0.08), transparent 50%)",
        }}
      />
      <div className="relative z-[1] flex flex-wrap items-center justify-center gap-4">
        <NodeChip
          label={form.publisher || t("sandbox.publisherPlaceholder")}
          sub={t("sandbox.publish")}
          accent="var(--ecc-signal)"
        />
        <div className="flex flex-col items-center gap-1">
          <ArrowRight
            className="h-5 w-5 text-[var(--ecc-ink-faint)]"
            strokeWidth={1.5}
          />
          <span className="max-w-[140px] truncate font-[IBM_Plex_Mono,monospace] text-[10px] text-[var(--ecc-metal)]">
            {form.topic || t("sandbox.topicPlaceholder")}
          </span>
        </div>
        <NodeChip
          label={form.subscriber || t("sandbox.subscribersPlaceholder")}
          sub={t("sandbox.observe")}
          accent="var(--ecc-busy)"
        />
      </div>

      {lastProbe ? (
        <div className="relative z-[1] mt-6 rounded-[var(--ecc-radius-sm)] border border-[var(--ecc-line)] bg-[var(--ecc-panel)]/90 px-3 py-2 text-center">
          <p className="text-xs text-[var(--ecc-ink-muted)]">
            {t("sandbox.lastProbe")}{" "}
            <span
              className={
                lastProbe.status === "failed" || lastProbe.accepted === false
                  ? "text-[var(--ecc-down)]"
                  : "text-[var(--ecc-signal)]"
              }
            >
              {lastProbe.status ?? (lastProbe.accepted ? "accepted" : "failed")}
            </span>
          </p>
          <p className="mt-1 font-[IBM_Plex_Mono,monospace] text-[11px] text-[var(--ecc-ink-faint)]">
            {lastProbe.probe_id}
          </p>
        </div>
      ) : (
        <p className="relative z-[1] mt-6 text-center text-xs text-[var(--ecc-ink-faint)]">
          {t("sandbox.canvasIdle")}
        </p>
      )}
    </div>
  );
}

function NodeChip({
  label,
  sub,
  accent,
}: {
  label: string;
  sub: string;
  accent: string;
}) {
  const display = label.includes("_") ? humanizeServiceName(label) : label;
  return (
    <div className="min-w-[140px] rounded-[var(--ecc-radius-md)] border border-[var(--ecc-line)] bg-[var(--ecc-panel)] px-3 py-2 text-center">
      <p className="truncate font-[Sora,sans-serif] text-sm font-semibold text-[var(--ecc-ink)]">
        {display}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider" style={{ color: accent }}>
        {sub}
      </p>
    </div>
  );
}
