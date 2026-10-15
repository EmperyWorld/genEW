import { cn } from "@/lib/cn";

export type BaseCardProps = {
  title: string;
  value?: string | number | null;
  unit?: string | null;
  icon?: string | null;
  className?: string;
  "data-assembly-data-source"?: string;
};

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
        "rounded-[var(--ecc-radius-md)] border border-line bg-canvas px-4 py-3",
        className,
      )}
    >
      <p className="font-[Sora,sans-serif] text-xs uppercase tracking-wide text-ink-muted">
        {icon ? <span className="mr-1">{icon}</span> : null}
        {title}
      </p>
      {value != null && value !== "" ? (
        <p className="mt-2 font-display text-2xl font-semibold text-ink">
          {value}
          {unit ? (
            <span className="ml-1 text-sm font-normal text-ink-muted">{unit}</span>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
