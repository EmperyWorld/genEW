import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import type { AutonomousModeResponse } from "@/api/types";

export interface AutonomousModeToggleProps {
  mode: AutonomousModeResponse | null;
  busy?: boolean;
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
}

export function AutonomousModeToggle({
  mode,
  busy = false,
  disabled = false,
  onToggle,
}: AutonomousModeToggleProps) {
  const { t } = useTranslation();
  const enabled = mode?.enabled ?? false;
  return (
    <div className="flex items-center gap-3">
      <span className="font-[Sora,sans-serif] text-xs tracking-wide text-[var(--ecc-ink-muted)]">
        {t("autonomous.mode")}
      </span>
      <Button
        size="sm"
        variant={enabled ? "primary" : "secondary"}
        disabled={disabled || busy}
        aria-pressed={enabled}
        onClick={() => onToggle(!enabled)}
      >
        {enabled ? t("autonomous.on") : t("autonomous.off")}
      </Button>
      <span className="font-mono text-xs text-[var(--ecc-ink-muted)]">
        {mode?.state ?? t("common.dash")}
      </span>
    </div>
  );
}
