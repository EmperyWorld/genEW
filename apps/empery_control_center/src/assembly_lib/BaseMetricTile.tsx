import { cn } from "@/lib/cn";

export type BaseMetricTileProps = {
  title: string;
  value?: string | number | null;
  unit?: string | null;
  className?: string;
};

export function BaseMetricTile(props: BaseMetricTileProps) {
  return (
    <div data-assembly-component="MetricTile" data-assembly-title={props.title}>
      <article
        className={cn(
          "rounded-[var(--ecc-radius-md)] border border-signal/40 bg-signal/5 px-4 py-3",
          props.className,
        )}
      >
        <p className="text-xs uppercase tracking-wide text-ink-muted">{props.title}</p>
        {props.value != null && props.value !== "" ? (
          <p className="mt-2 font-display text-2xl font-semibold text-signal">
            {props.value}
            {props.unit ? (
              <span className="ml-1 text-sm font-normal text-ink-muted">
                {props.unit}
              </span>
            ) : null}
          </p>
        ) : null}
      </article>
    </div>
  );
}
