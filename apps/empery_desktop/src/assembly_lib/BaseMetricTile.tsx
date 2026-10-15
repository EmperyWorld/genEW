import { cn } from "@/lib/cn";

export type BaseMetricTileProps = {
  title: string;
  value?: string | number | null;
  unit?: string | null;
  className?: string;
};

/** Alias-shaped metric tile for Manifest component=MetricTile. */
export function BaseMetricTile(props: BaseMetricTileProps) {
  return (
    <div data-assembly-component="MetricTile" data-assembly-title={props.title}>
      <article
        className={cn(
          "rounded-md border border-signal/30 bg-signal/5 px-3 py-2",
          props.className,
        )}
      >
        <p className="text-[10px] uppercase text-ink-muted">{props.title}</p>
        {props.value != null && props.value !== "" ? (
          <p className="font-mono text-xl font-semibold text-signal">
            {props.value}
            {props.unit ? (
              <span className="ml-1 text-xs font-normal text-ink-muted">
                {props.unit}
              </span>
            ) : null}
          </p>
        ) : null}
      </article>
    </div>
  );
}
