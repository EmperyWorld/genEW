import { AnimatePresence, motion } from "framer-motion";
import { Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { factoryClient } from "@/api/factoryClient";
import { displayAppTitle } from "@/i18n/displayAppTitle";
import { cn } from "@/lib/cn";
import { DesktopAppSymbol } from "./icons";
import type { CatalogApp, DesktopItem } from "./types";

type Props = {
  open: boolean;
  items: DesktopItem[];
  catalog: CatalogApp[];
  onClose: () => void;
  onLaunch: (item: DesktopItem) => void;
  /** Called after a successful user_created delete so shell can re-bootstrap. */
  onCatalogChanged?: () => void;
};

function catalogAsItems(catalog: CatalogApp[]): DesktopItem[] {
  return catalog.map((c, idx) => ({
    id: `catalog-${c.app_id}`,
    name: c.title,
    type: "app" as const,
    position: { x: 0, y: idx },
    app_component: c.app_component,
    category: c.category,
  }));
}

export function StartMenu({
  open,
  items,
  catalog,
  onClose,
  onLaunch,
  onCatalogChanged,
}: Props) {
  const { t } = useTranslation("desktopChrome");
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const apps = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromIcons = items.filter((i) => i.type === "app" || i.type === "folder");
    const fromCatalog = catalogAsItems(catalog).filter(
      (c) => !fromIcons.some((i) => i.app_component === c.app_component),
    );
    return [...fromIcons, ...fromCatalog].filter((i) => {
      if (!q) return true;
      const title = displayAppTitle(i.app_component, i.name).toLowerCase();
      return (
        title.includes(q) ||
        i.name.toLowerCase().includes(q) ||
        (i.app_component || "").toLowerCase().includes(q)
      );
    });
  }, [items, catalog, query]);

  const deleteUserApp = async (appId: string, label: string) => {
    const ok = window.confirm(t("startMenu.deleteConfirm", { name: label }));
    if (!ok) return;
    setDeletingId(appId);
    setDeleteError(null);
    try {
      const meta = await factoryClient.lifecycleMeta(appId);
      if (!meta.deletable) {
        setDeleteError(t("startMenu.deleteDenied"));
        return;
      }
      const res = await factoryClient.lifecycle(appId, "delete");
      if (!res.ok) {
        setDeleteError(res.error || t("startMenu.deleteFailed"));
        return;
      }
      onCatalogChanged?.();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : t("startMenu.deleteFailed"),
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <button
            type="button"
            aria-label={t("startMenu.closeAria")}
            className="absolute inset-0 z-40 cursor-default bg-black/25"
            onClick={onClose}
          />
          <motion.aside
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.16 }}
            className={cn(
              "absolute bottom-16 left-3 z-50 flex w-[min(420px,calc(100vw-1.5rem))] flex-col",
              "overflow-hidden rounded-2xl border border-white/12 bg-[rgb(10_16_26/0.96)] shadow-2xl backdrop-blur-md",
            )}
            role="dialog"
            aria-label={t("startMenu.aria")}
          >
            <div className="border-b border-white/10 px-4 py-3">
              <p className="font-display text-base text-ink">{t("startMenu.title")}</p>
              <p className="text-xs text-ink-muted">{t("startMenu.subtitle")}</p>
              <label className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <Search size={14} className="text-ink-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("startMenu.searchPlaceholder")}
                  className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
                  autoFocus
                />
              </label>
              {deleteError ? (
                <p className="mt-2 text-[11px] text-rose-300">{deleteError}</p>
              ) : null}
            </div>
            <div className="max-h-80 overflow-auto p-3">
              {apps.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-ink-muted">
                  {t("startMenu.empty")}
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2">
                  {apps.map((item) => {
                    const catalogHit = catalog.find(
                      (c) => c.app_component === item.app_component,
                    );
                    const label = displayAppTitle(
                      item.app_component,
                      catalogHit?.title || item.name,
                    );
                    const canDelete = Boolean(catalogHit?.user_created);
                    const appId = catalogHit?.app_id || item.app_component || "";
                    return (
                      <li key={item.id} className="relative">
                        <button
                          type="button"
                          className={cn(
                            "flex w-full flex-col items-center gap-2 rounded-xl border border-white/8",
                            "bg-white/[0.03] px-2 py-3 text-center transition hover:border-white/14 hover:bg-white/[0.06]",
                          )}
                          onClick={() => {
                            onLaunch(item);
                            onClose();
                            setQuery("");
                          }}
                        >
                          <DesktopAppSymbol
                            item={item}
                            size="lg"
                            iconUrl={catalogHit?.icon}
                          />
                          <span className="line-clamp-2 w-full text-[11px] font-medium leading-tight text-ink">
                            {label}
                          </span>
                        </button>
                        {canDelete && appId ? (
                          <button
                            type="button"
                            title={t("startMenu.deleteApp")}
                            aria-label={t("startMenu.deleteApp")}
                            disabled={deletingId === appId}
                            className="absolute right-1 top-1 rounded-md p-1 text-ink-muted transition hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteUserApp(appId, label);
                            }}
                          >
                            <Trash2 size={12} strokeWidth={1.75} />
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
