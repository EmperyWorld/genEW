import { cn } from "@/lib/cn";

export type ChartPoint = { label: string; value: number };

export type BaseChartProps = {
  title?: string;
  chartType?: "area_line" | "bar" | "pie" | "line";
  series?: ChartPoint[];
  className?: string;
  "data-assembly-data-source"?: string;
};

/** Dumb chart placeholder — renders series as a simple bar strip (no fetch). */
export function BaseChart({
  title,
  chartType = "area_line",
  series = [],
  className,
  "data-assembly-data-source": dataSource,
}: BaseChartProps) {
  const max = Math.max(1, ...series.map((p) => p.value));
  return (
    <section
      data-assembly-component="Chart"
      data-assembly-title={title || "chart"}
      data-assembly-data-source={dataSource}
      data-chart-type={chartType}
      className={cn(
        "rounded-md border border-white/10 bg-black/20 px-3 py-2",
        className,
      )}
    >
      {title ? (
        <p className="mb-2 text-[10px] uppercase text-ink-muted">{title}</p>
      ) : null}
      {series.length === 0 ? (
        <p className="text-sm text-ink-muted">No series</p>
      ) : (
        <ul className="flex h-24 items-end gap-1">
          {series.map((p) => (
            <li key={p.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-signal/70"
                style={{ height: `${Math.round((p.value / max) * 100)}%` }}
                title={`${p.label}: ${p.value}`}
              />
              <span className="truncate text-[9px] text-ink-muted">{p.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
