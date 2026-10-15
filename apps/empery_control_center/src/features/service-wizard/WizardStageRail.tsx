import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { WizardStage } from "../../api/types";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { railUnderline, reducedMotionVariants } from "../../theme/motion";
import { cn } from "@/lib/cn";

const STAGE_IDS: WizardStage[] = ["plan", "implement", "verify", "evolve"];

export interface WizardStageRailProps {
  stage: WizardStage;
  completed: WizardStage[];
  onSelect?: (stage: WizardStage) => void;
  disabled?: boolean;
}

export function WizardStageRail({
  stage,
  completed,
  onSelect,
  disabled,
}: WizardStageRailProps) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();

  return (
    <nav
      aria-label={t("wizard.railAria")}
      className="flex w-full flex-wrap items-center gap-1 border-b border-line pb-3"
    >
      {STAGE_IDS.map((id, idx) => {
        const isActive = id === stage;
        const isDone = completed.includes(id);
        const label = t(`wizard.stages.${id}`);
        return (
          <div key={id} className="flex items-center gap-1">
            {idx > 0 ? (
              <span
                className="mx-1.5 h-px w-5 bg-line-strong sm:w-8"
                aria-hidden
              />
            ) : null}
            <button
              type="button"
              disabled={disabled || !onSelect}
              onClick={() => onSelect?.(id)}
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecc-focus-ring)]",
                isActive
                  ? "bg-signal-soft text-signal"
                  : isDone
                    ? "text-ink-muted hover:text-ink"
                    : "text-ink-faint",
              )}
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-sm border font-mono text-[10px]",
                  isActive
                    ? "border-signal text-signal"
                    : isDone
                      ? "border-metal text-metal"
                      : "border-line-strong",
                )}
              >
                {isDone && !isActive ? (
                  <Check className="h-3 w-3" strokeWidth={1.5} />
                ) : (
                  idx + 1
                )}
              </span>
              <span className="whitespace-normal font-body">{label}</span>
              <motion.span
                className="absolute inset-x-2 -bottom-px h-0.5 origin-left bg-signal"
                variants={
                  reduced
                    ? reducedMotionVariants.railUnderline
                    : railUnderline
                }
                initial="inactive"
                animate={isActive ? "active" : "inactive"}
                aria-hidden
              />
            </button>
          </div>
        );
      })}
    </nav>
  );
}

export const WIZARD_STAGES = STAGE_IDS.map((id) => ({
  id,
  label: id,
}));
