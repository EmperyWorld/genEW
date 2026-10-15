/**
 * EliteEW-adapted kanban column body atom (Empery extract target).
 * Presentational only — wire via task_board scaffold + peerApiBase.
 */
import type { ReactNode } from "react";

export type TaskColumnBodyProps = {
  title: string;
  count?: number;
  children?: ReactNode;
};

export function TaskColumnBody({
  title,
  count,
  children,
}: TaskColumnBodyProps) {
  return (
    <section className="flex min-w-[12rem] flex-col gap-2">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-body text-sm font-semibold">{title}</h3>
        {typeof count === "number" ? (
          <span className="font-mono text-[11px] opacity-70">{count}</span>
        ) : null}
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
