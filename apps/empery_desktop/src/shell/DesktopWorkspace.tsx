import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DesktopIcon } from "./DesktopIcon";
import { DesktopWindowLayer } from "./DesktopWindowLayer";
import { loadShellBootstrap } from "./loadShellBootstrap";
import { SnapPreview } from "./SnapPreview";
import { StartMenu } from "./StartMenu";
import { onLaunchAppRequest } from "./studioHandoff";
import { Taskbar } from "./Taskbar";
import type { SnapZone } from "./snap";
import type { CatalogApp, DesktopItem, ShellBootstrap } from "./types";
import { useWindowManager } from "./useWindowManager";

const ICON_COL_WIDTH = 112;
const ICON_ROW_HEIGHT = 112;
const ICON_ORIGIN_X = 48;
const ICON_ORIGIN_Y = 48;

const ACCENT_TOKENS: Record<string, string> = {
  signal: "94 234 212",
  sky: "56 189 248",
  amber: "251 191 36",
  rose: "251 113 133",
  violet: "167 139 250",
};

/** Pack icons into columns that fit above the taskbar — backend Y can go off-screen. */
function layoutDesktopIcons(
  items: DesktopItem[],
  viewportHeight: number,
): DesktopItem[] {
  const usable = Math.max(200, viewportHeight - 56 - 24);
  const maxRows = Math.max(
    1,
    Math.floor((usable - ICON_ORIGIN_Y) / ICON_ROW_HEIGHT),
  );
  return items.map((item, index) => {
    const col = Math.floor(index / maxRows);
    const row = index % maxRows;
    return {
      ...item,
      position: {
        x: ICON_ORIGIN_X + col * ICON_COL_WIDTH,
        y: ICON_ORIGIN_Y + row * ICON_ROW_HEIGHT,
      },
    };
  });
}

function resolveAccentRgb(accent: string | undefined): string {
  const raw = (accent || "signal").trim();
  if (ACCENT_TOKENS[raw]) return ACCENT_TOKENS[raw];
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const n = Number.parseInt(hex, 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
  }
  return ACCENT_TOKENS.signal;
}

function wallpaperUrl(path: string | undefined): string {
  const value = (path || "/wallpapers/default.svg").trim();
  if (/^(https?:|data:|\/)/.test(value)) return value;
  return `/wallpapers/${value.replace(/^\/+/, "")}`;
}

export function DesktopWorkspace() {
  const { t } = useTranslation("desktopChrome");
  const [boot, setBoot] = useState<ShellBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [snapZone, setSnapZone] = useState<SnapZone>(null);
  const [viewportHeight, setViewportHeight] = useState(
    () => (typeof window !== "undefined" ? window.innerHeight : 800),
  );
  const wm = useWindowManager();

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    void loadShellBootstrap(isCancelled, setBoot, setError);

    const interval = window.setInterval(() => {
      void loadShellBootstrap(isCancelled, setBoot, setError);
    }, 15_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadShellBootstrap(isCancelled, setBoot, setError);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStartOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const cfg = boot?.desktop_config;
    if (!cfg) return;
    const root = document.documentElement;
    root.style.setProperty(
      "--desktop-accent",
      resolveAccentRgb(cfg.accent_color),
    );
  }, [boot?.desktop_config]);

  const rawItems: DesktopItem[] = boot?.items ?? [];
  const catalog: CatalogApp[] = (boot?.catalog ?? []).filter(
    (c) => c.enabled !== false,
  );
  const items = useMemo(
    () => layoutDesktopIcons(rawItems, viewportHeight),
    [rawItems, viewportHeight],
  );

  const surfaceStyle = useMemo(() => {
    const url = wallpaperUrl(boot?.desktop_config?.wallpaper);
    return {
      backgroundImage: `url("${url}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    } as const;
  }, [boot?.desktop_config?.wallpaper]);

  const launch = (item: DesktopItem) => {
    const catalogHit = catalog.find(
      (c) => c.app_component === item.app_component,
    );
    const forWindow =
      catalogHit && catalogHit.title.trim()
        ? { ...item, name: catalogHit.title.trim() }
        : item;
    wm.openWindow(forWindow);
    setStartOpen(false);
  };

  useEffect(() => {
    return onLaunchAppRequest((appComponent) => {
      const fromDesktop = items.find((item) => item.app_component === appComponent);
      const fromCatalog = catalog.find((c) => c.app_component === appComponent);
      const match =
        fromDesktop ||
        (fromCatalog
          ? ({
              id: `catalog-${fromCatalog.app_id}`,
              name: fromCatalog.title,
              type: "app" as const,
              position: { x: 48, y: 48 },
              app_component: fromCatalog.app_component,
              category: fromCatalog.category,
            } satisfies DesktopItem)
          : null);
      if (!match) return;
      wm.openWindow(match);
      setStartOpen(false);
    });
  }, [items, catalog, wm]);

  // Smoke / deep-link: ?launch=<app_component> opens a catalog window once boot is ready.
  useEffect(() => {
    if (!boot) return;
    const params = new URLSearchParams(window.location.search);
    const launchId = (params.get("launch") || "").trim();
    if (!launchId) return;
    const fromDesktop = items.find((item) => item.app_component === launchId);
    const fromCatalog = catalog.find(
      (c) => c.app_component === launchId || c.app_id === launchId,
    );
    const match =
      fromDesktop ||
      (fromCatalog
        ? ({
            id: `catalog-${fromCatalog.app_id}`,
            name: fromCatalog.title,
            type: "app" as const,
            position: { x: 48, y: 48 },
            app_component: fromCatalog.app_component,
            category: fromCatalog.category,
          } satisfies DesktopItem)
        : null);
    if (!match) return;
    wm.openWindow(match);
    params.delete("launch");
    const next = params.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", url);
  }, [boot, items, catalog, wm]);

  return (
    <div
      id="desktop-main"
      className="relative h-full w-full overflow-hidden font-body"
      style={surfaceStyle}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-desktop-icon-id]")) return;
        if ((e.target as HTMLElement).closest("[data-desktop-window-id]")) return;
        if ((e.target as HTMLElement).closest("[data-desktop-taskbar]")) return;
        setSelectedId(null);
      }}
    >
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-6 py-5">
        <div>
          <p className="font-display text-xl tracking-tight text-ink">
            {t("brand.name")}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            {t("brand.shell")}
          </p>
        </div>
        <p className="rounded-full border border-white/10 bg-black/25 px-3 py-1 font-[Sora,sans-serif] text-[11px] tabular-nums text-ink-muted backdrop-blur-sm">
          {boot
            ? t("brand.appsCount", { count: boot.installed.app_ids.length }) +
              ` · v${boot.schema_version}`
            : t("brand.booting")}
        </p>
      </header>

      <main className="absolute inset-0 z-0 pb-14 pt-16">
        {error ? (
          <div className="m-6 max-w-lg rounded-lg border border-rose-400/30 bg-panel p-4 text-sm text-rose-200">
            {error}
            <p className="mt-2 text-ink-muted">{t("errors.bootstrapHint")}</p>
          </div>
        ) : null}

        {items.map((item) => {
          const catalogHit = catalog.find(
            (c) => c.app_component === item.app_component,
          );
          const displayItem =
            catalogHit && catalogHit.title.trim()
              ? { ...item, name: catalogHit.title.trim() }
              : item;
          return (
            <DesktopIcon
              key={item.id}
              item={displayItem}
              selected={selectedId === item.id}
              iconUrl={catalogHit?.icon}
              onSelect={() => setSelectedId(item.id)}
              onOpen={() => launch(item)}
            />
          );
        })}
      </main>

      <SnapPreview zone={snapZone} />
      <DesktopWindowLayer wm={wm} onSnapPreview={setSnapZone} />

      <StartMenu
        open={startOpen}
        items={items}
        catalog={catalog}
        onClose={() => setStartOpen(false)}
        onLaunch={launch}
        onCatalogChanged={() => {
          void loadShellBootstrap(() => false, setBoot, setError);
        }}
      />

      <Taskbar
        items={items}
        windows={wm.windows}
        startOpen={startOpen}
        onToggleStart={() => setStartOpen((v) => !v)}
        onFocusOrRestore={wm.focusWindow}
        onLaunch={launch}
      />
    </div>
  );
}
