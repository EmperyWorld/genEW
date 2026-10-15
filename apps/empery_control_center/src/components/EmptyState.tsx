import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      {icon ? <div className="mb-1 text-ink-faint">{icon}</div> : null}
      <p className="font-display text-sm font-medium text-ink-muted">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-ink-faint">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
