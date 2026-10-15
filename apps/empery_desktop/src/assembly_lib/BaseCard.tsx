import { cn } from "@/lib/cn";

export type BaseCardProps = {
  title: string;
  value?: string | number | null;
  unit?: string | null;
  icon?: string | null;
  className?: string;
  "data-assembly-data-source"?: string;
};

/** Dumb metric/card tile — no data fetching. */
export function BaseCard({
  title,
  value,
  unit,
  icon,
  className,
  "data-assembly-data-source": dataSource,
}: BaseCardProps) {
  return (
    <article
      data-assembly-component="Card"
      data-assembly-title={title}
      data-assembly-data-source={dataSource}
      className={cn(
        "rounded-md border border-white/10 bg-black/20 px-3 py-2",
        className,
      )}
    >
      <p className="text-[10px] uppercase text-ink-muted">
        {icon ? <span className="mr-1">{icon}</span> : null}
        {title}
      </p>
      {value != null && value !== "" ? (
        <p className="font-mono text-lg font-semibold">
          {value}
          {unit ? (
            <span className="ml-1 text-xs font-normal text-ink-muted">{unit}</span>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
