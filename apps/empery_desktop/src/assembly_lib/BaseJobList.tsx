import { cn } from "@/lib/cn";

export type StudioJobView = {
  id: string;
  prompt: string;
  status: string;
  result_url?: string | null;
};

export type BaseJobListProps = {
  title: string;
  emptyHint?: string | null;
  jobs?: StudioJobView[] | null;
  className?: string;
  "data-assembly-data-source"?: string;
};

/** Dumb studio job list — no fetch. */
export function BaseJobList({
  title,
  emptyHint,
  jobs,
  className,
  "data-assembly-data-source": dataSource,
}: BaseJobListProps) {
  const list = jobs ?? [];
  return (
    <section
      data-assembly-component="JobList"
      data-assembly-title={title}
      data-assembly-data-source={dataSource}
      className={cn("min-h-0 flex-1 space-y-2 overflow-auto text-sm", className)}
    >
      <p className="text-[10px] uppercase tracking-wide text-ink-muted">{title}</p>
      {list.length === 0 ? (
        <p className="text-xs text-ink-muted">{emptyHint ?? "No jobs yet."}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((j) => (
            <li
              key={j.id}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
            >
              <p className="text-[10px] uppercase text-ink-muted">
                {j.status} · {j.id}
              </p>
              <p className="whitespace-pre-wrap">{j.prompt}</p>
              {j.result_url ? (
                <a
                  className="text-xs text-signal underline"
                  href={j.result_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open result
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
