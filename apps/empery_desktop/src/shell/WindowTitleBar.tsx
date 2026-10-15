import { Minus, Square, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  icon?: ReactNode;
  isMaximized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onDragStart: (e: React.PointerEvent) => void;
};

/** OS-style chrome — adapted from EliteEW WindowTitleBar contracts. */
export function WindowTitleBar({
  title,
  icon,
  isMaximized,
  onClose,
  onMinimize,
  onMaximize,
  onDragStart,
}: Props) {
  const { t } = useTranslation("desktopChrome");
  return (
    <header
      className={cn(
        "flex h-10 shrink-0 select-none items-center gap-2 border-b border-white/10",
        "bg-[rgb(10_16_26/0.92)] px-2",
      )}
      onPointerDown={onDragStart}
      data-desktop-window-titlebar=""
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
        {icon ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            {icon}
          </span>
        ) : null}
        <h2 className="truncate font-display text-sm text-ink" title={title}>
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={t("window.minimize")}
          title={t("window.minimize")}
          data-desktop-window-control="min"
          className="flex h-7 w-8 items-center justify-center rounded-md text-ink-muted transition hover:bg-white/10 hover:text-ink"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onMinimize();
          }}
        >
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={isMaximized ? t("window.restore") : t("window.maximize")}
          title={isMaximized ? t("window.restore") : t("window.maximize")}
          data-desktop-window-control="max"
          className="flex h-7 w-8 items-center justify-center rounded-md text-ink-muted transition hover:bg-white/10 hover:text-ink"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onMaximize();
          }}
        >
          <Square size={12} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={t("window.close")}
          title={t("window.close")}
          data-desktop-window-control="close"
          className="flex h-7 w-8 items-center justify-center rounded-md text-ink-muted transition hover:bg-rose-500/25 hover:text-rose-100"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}
