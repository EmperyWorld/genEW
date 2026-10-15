import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  /** Metal hairline accent under title (e.g. Live connected). */
  accent?: boolean;
}

/** Interactive surface — Signal Obsidian panel chrome. */
export function Panel({
  title,
  actions,
  children,
  flush = false,
  accent = false,
  className,
  ...rest
}: PanelProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-md border border-line bg-panel",
        className,
      )}
      {...rest}
    >
      {(title || actions) && (
        <div
          className={cn(
            "relative flex shrink-0 items-center justify-between gap-3 border-b border-line px-3 py-2",
            accent &&
              "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-metal after:to-transparent",
          )}
        >
          {title ? (
            <h2 className="font-display text-sm font-semibold tracking-wide text-ink">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions ? (
            <div className="flex items-center gap-1">{actions}</div>
          ) : null}
        </div>
      )}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          !flush && "p-3",
        )}
      >
        {children}
      </div>
    </div>
  );
}
