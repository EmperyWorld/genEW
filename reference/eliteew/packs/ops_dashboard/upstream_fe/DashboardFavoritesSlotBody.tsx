/**
 * Empery-adapted ops_dashboard favorites slot (extract corpus).
 * Presentational stub — EliteEW upstream had @/utils/cn + heroicons peers;
 * those must not enter the Desktop Vite graph. Wire via eic:extract-wire marker.
 */
import type { ReactNode } from "react";

export type DashboardFavoritesSlotBodyProps = {
  compact?: boolean;
  title?: string;
  children?: ReactNode;
};

export function DashboardFavoritesSlotBody({
  compact = false,
  title = "Favorites",
  children,
}: DashboardFavoritesSlotBodyProps) {
  return (
    <section
      className={
        compact
          ? "flex flex-col gap-1 text-xs"
          : "flex flex-col gap-2 text-sm"
      }
      data-eic-atom="DashboardFavoritesSlotBody"
    >
      <header className="font-semibold opacity-90">{title}</header>
      {children ? <div className="opacity-80">{children}</div> : null}
    </section>
  );
}
