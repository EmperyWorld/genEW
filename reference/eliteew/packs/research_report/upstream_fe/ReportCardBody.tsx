/**
 * EliteEW-adapted research report card atom (Empery extract target).
 * Presentational only — wire via research_report scaffold + peerApiBase.
 */
import type { ReactNode } from "react";

export type ReportCardBodyProps = {
  topic: string;
  status?: string;
  children?: ReactNode;
};

export function ReportCardBody({
  topic,
  status,
  children,
}: ReportCardBodyProps) {
  return (
    <article className="flex flex-col gap-1 rounded-md border border-white/10 px-3 py-2">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-body text-sm font-semibold">{topic}</h3>
        {status ? (
          <span className="font-mono text-[10px] uppercase opacity-70">
            {status}
          </span>
        ) : null}
      </header>
      {children ? <div className="text-xs opacity-80">{children}</div> : null}
    </article>
  );
}
