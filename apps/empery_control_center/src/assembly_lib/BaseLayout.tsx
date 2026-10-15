import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BaseLayoutProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Dumb ECC shell layout — props only. */
export function BaseLayout({
  title,
  subtitle,
  actions,
  children,
  className,
}: BaseLayoutProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-4 p-4", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          {subtitle ? (
            <p className="font-body text-sm text-ink-muted">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
