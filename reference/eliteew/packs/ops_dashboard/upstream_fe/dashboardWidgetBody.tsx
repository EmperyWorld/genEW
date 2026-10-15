/**
 * Empery-adapted ops_dashboard widget body (extract corpus).
 * Presentational stub — EliteEW marketing-cabinet peers stay out of Desktop bake.
 * Wire via eic:extract-wire marker on the service mount.
 */
import type { ReactNode } from "react";

export type DashboardWidgetBodyProps = {
  title?: string;
  metricLabel?: string;
  metricValue?: string | number;
  children?: ReactNode;
};

/** Named export matches stem used by extract_wire markers. */
export function dashboardWidgetBody({
  title = "Metric",
  metricLabel = "value",
  metricValue = "—",
  children,
}: DashboardWidgetBodyProps) {
  return (
    <article
      className="flex flex-col gap-1 rounded-md border border-white/10 px-3 py-2"
      data-eic-atom="dashboardWidgetBody"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-body text-sm font-semibold">{title}</h3>
        <span className="font-mono text-[10px] uppercase opacity-70">
          {metricLabel}: {metricValue}
        </span>
      </header>
      {children ? <div className="text-xs opacity-80">{children}</div> : null}
    </article>
  );
}

export const MemoDashboardWidgetBody = dashboardWidgetBody;
