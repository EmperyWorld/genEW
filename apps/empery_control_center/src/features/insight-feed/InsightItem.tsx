import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { FeedItemDTO } from "../../api/types";
import { formatTimestamp, truncate } from "../../lib/format";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { feedIngress, reducedMotionVariants } from "../../theme/motion";
import { cn } from "@/lib/cn";

export interface InsightItemProps {
  item: FeedItemDTO;
  active?: boolean;
  /** Skip ingress/layout motion (bulk audit hydrate must not push the page). */
  quietMotion?: boolean;
  onSelect?: (item: FeedItemDTO) => void;
}

function isInsight(topic: string): boolean {
  return topic === "task.insight.generated";
}

export function InsightItem({
  item,
  active,
  quietMotion = false,
  onSelect,
}: InsightItemProps) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const insight = isInsight(item.topic);
  const confidence = item.payload.confidence;
  const priority = item.payload.suggested_priority;
  const skipMotion = reduced || quietMotion;

  return (
    <motion.button
      type="button"
      variants={
        skipMotion ? reducedMotionVariants.feedIngress : feedIngress
      }
      initial={skipMotion ? false : "hidden"}
      animate="visible"
      exit="exit"
      layout={false}
      onClick={() => onSelect?.(item)}
      className={cn(
        "w-full border-b border-line px-3 py-2.5 text-left transition-colors",
        active ? "bg-signal-soft" : "hover:bg-panel-raised",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-wide",
            insight ? "text-signal" : "text-metal",
          )}
        >
          {item.topic}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-ink-faint">
          {formatTimestamp(item.timestamp)}
        </span>
      </div>
      <p className="mt-1 text-sm leading-snug text-ink">
        {truncate(item.summary, 160)}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-muted">
        {item.service_name ? <span>{item.service_name}</span> : null}
        {insight && confidence !== undefined ? (
          <span>{t("feed.confidence", { value: String(confidence) })}</span>
        ) : null}
        {insight && priority !== undefined ? (
          <span>{t("feed.priority", { value: String(priority) })}</span>
        ) : null}
        {item.correlation_id ? (
          <span className="font-mono text-ink-faint">
            {item.correlation_id}
          </span>
        ) : null}
      </div>
    </motion.button>
  );
}
