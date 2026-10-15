import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BaseLayoutProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Dumb shell layout — props only; Assembler owns composition. */
export function BaseLayout({
  title,
  subtitle,
  actions,
  children,
  className,
}: BaseLayoutProps) {
  return (
    <div className={cn("flex h-full flex-col gap-3 p-4 text-ink", className)}>
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-body text-lg font-semibold">{title}</h2>
          {subtitle ? (
            <p className="text-xs text-ink-muted">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
