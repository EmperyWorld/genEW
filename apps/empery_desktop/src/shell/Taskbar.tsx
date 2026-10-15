import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { displayAppTitle } from "@/i18n/displayAppTitle";
import type { AppLocale } from "@/i18n";
import { LOCALE_STORAGE_KEY } from "@/i18n";
import { DesktopAppSymbol } from "./icons";
import type { DesktopItem, WindowState } from "./types";

type Props = {
  items: DesktopItem[];
  windows: WindowState[];
  startOpen: boolean;
  onToggleStart: () => void;
  onFocusOrRestore: (windowId: string) => void;
  onLaunch: (item: DesktopItem) => void;
};

function Clock() {
  const { t, i18n } = useTranslation("desktopChrome");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  const locale = i18n.language.startsWith("ru") ? "ru-RU" : "en-US";
  return (
    <time
      className="min-w-[3.25rem] text-right font-[Sora,sans-serif] text-[11px] tabular-nums tracking-wide text-ink-muted"
      dateTime={now.toISOString()}
      aria-label={t("taskbar.clockAria")}
    >
      {now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

function LangToggle() {
  const { t, i18n } = useTranslation("desktopChrome");
  const current: AppLocale = i18n.language.startsWith("ru") ? "ru" : "en";
  const setLang = (lng: AppLocale) => {
    void i18n.changeLanguage(lng);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, lng);
    } catch {
      /* ignore */
    }
  };
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/25 p-0.5"
      role="group"
      aria-label={t("lang.switchAria")}
    >
      {(["ru", "en"] as const).map((lng) => (
        <button
          key={lng}
          type="button"
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition",
            current === lng
              ? "bg-signal/20 text-signal"
              : "text-ink-muted hover:text-ink",
          )}
          aria-pressed={current === lng}
          onClick={() => setLang(lng)}
        >
          {t(`lang.${lng}`)}
        </button>
      ))}
    </div>
  );
}

export function Taskbar({
  items,
  windows,
  startOpen,
  onToggleStart,
  onFocusOrRestore,
  onLaunch,
}: Props) {
  const { t } = useTranslation("desktopChrome");
  const pinned = items.filter((i) => i.type === "app");
  const focusedId = windows
    .filter((w) => !w.isMinimized)
    .sort((a, b) => b.zIndex - a.zIndex)[0]?.id;

  return (
    <footer
      className={cn(
        "absolute inset-x-0 bottom-0 z-[60] flex h-14 items-center gap-2 px-3",
        "border-t border-white/[0.08]",
        "bg-[linear-gradient(180deg,rgb(12_18_28/0.78),rgb(6_10_18/0.94))]",
        "shadow-[0_-12px_40px_rgb(0_0_0/0.35)] backdrop-blur-xl",
      )}
      data-desktop-taskbar=""
      aria-label={t("taskbar.aria")}
    >
      <button
        type="button"
        aria-label={t("taskbar.startAria")}
        title={t("taskbar.start")}
        aria-expanded={startOpen}
        className={cn(
          "group flex h-10 items-center gap-2 rounded-xl border px-2.5",
          "font-display text-sm tracking-tight transition duration-150",
          startOpen
            ? "border-signal/45 bg-signal/18 text-signal shadow-[inset_0_0_0_1px_rgb(var(--desktop-accent)/0.2)]"
            : "border-white/10 bg-white/[0.04] text-ink hover:border-white/18 hover:bg-white/[0.07]",
        )}
        onClick={onToggleStart}
      >
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg font-display text-[11px] font-bold",
            "bg-gradient-to-br from-signal/80 to-teal-600/90 text-[#04110c]",
          )}
          aria-hidden
        >
          E
        </span>
        <span className="pr-1">{t("taskbar.start")}</span>
      </button>

      <div
        className="mx-0.5 h-7 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent"
        aria-hidden
      />

      <div
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={t("taskbar.pinnedAria")}
      >
        {pinned.map((item) => {
          const related = windows.filter((w) => w.itemId === item.id);
          const active = related.some((w) => !w.isMinimized);
          const focused = related.some((w) => w.id === focusedId);
          const label = displayAppTitle(item.app_component, item.name);
          return (
            <button
              key={item.id}
              type="button"
              title={label}
              aria-label={label}
              className={cn(
                "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition duration-150",
                focused
                  ? "border-signal/40 bg-signal/14"
                  : active
                    ? "border-white/12 bg-white/[0.06]"
                    : "border-transparent hover:border-white/10 hover:bg-white/[0.05]",
              )}
              onClick={() => {
                const focusedWin = related.find((w) => !w.isMinimized);
                if (focusedWin) {
                  onFocusOrRestore(focusedWin.id);
                  return;
                }
                const minimized = related.find((w) => w.isMinimized);
                if (minimized) {
                  onFocusOrRestore(minimized.id);
                  return;
                }
                onLaunch(item);
              }}
            >
              <DesktopAppSymbol item={item} size="sm" />
              {related.length > 0 ? (
                <span
                  className={cn(
                    "absolute bottom-1 h-0.5 rounded-full transition-all",
                    focused ? "w-5 bg-signal" : "w-3 bg-signal/70",
                  )}
                />
              ) : null}
            </button>
          );
        })}

        {windows
          .filter((w) => !pinned.some((p) => p.id === w.itemId))
          .map((w) => (
            <button
              key={w.id}
              type="button"
              title={displayAppTitle(w.appComponent, w.title)}
              className={cn(
                "flex h-11 max-w-[12rem] items-center gap-2 truncate rounded-xl border px-2.5 text-xs transition",
                w.id === focusedId
                  ? "border-signal/35 bg-signal/12 text-ink"
                  : w.isMinimized
                    ? "border-transparent text-ink-muted hover:bg-white/5"
                    : "border-white/10 bg-white/[0.05] text-ink",
              )}
              onClick={() => onFocusOrRestore(w.id)}
            >
              <DesktopAppSymbol
                item={{
                  type: "app",
                  app_component: w.appComponent,
                }}
                size="sm"
              />
              <span className="truncate">
                {displayAppTitle(w.appComponent, w.title)}
              </span>
            </button>
          ))}
      </div>

      <div className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-2.5">
        <LangToggle />
        <Clock />
      </div>
    </footer>
  );
}
