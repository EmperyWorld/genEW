/**
 * Workspace hub — launcher for creative + ops apps on Empery Desktop.
 * Replaces the inert folder-workspace stub.
 */
import { useEffect, useMemo, useState } from "react";
import { fetchShellBootstrap } from "@/api/desktopShell";
import { cn } from "@/lib/cn";
import { requestLaunchApp } from "@/shell/studioHandoff";
import type { CatalogApp } from "@/shell/types";
import type { MountProps } from "./registry";

const CATEGORY_ORDER = [
  "assistant",
  "creative",
  "productivity",
  "system",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  assistant: "Companion",
  creative: "Studios",
  productivity: "Docs",
  system: "Ops",
};

export function WorkspaceMount(_props: MountProps) {
  const [apps, setApps] = useState<CatalogApp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchShellBootstrap()
      .then((boot) => {
        if (cancelled) return;
        const catalog = (boot.catalog ?? []).filter(
          (app) =>
            app.app_component &&
            app.app_component !== "workspace" &&
            app.enabled !== false,
        );
        setApps(catalog);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "bootstrap failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, CatalogApp[]>();
    for (const app of apps) {
      const key = app.category || "other";
      const list = map.get(key) ?? [];
      list.push(app);
      map.set(key, list);
    }
    const ordered: { key: string; label: string; apps: CatalogApp[] }[] = [];
    for (const key of CATEGORY_ORDER) {
      const list = map.get(key);
      if (list?.length) {
        ordered.push({
          key,
          label: CATEGORY_LABEL[key] || key,
          apps: list,
        });
        map.delete(key);
      }
    }
    for (const [key, list] of map) {
      ordered.push({ key, label: key, apps: list });
    }
    return ordered;
  }, [apps]);

  const openApp = (app: CatalogApp) => {
    requestLaunchApp(app.app_component);
    setStatus(`Opening ${app.title}…`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="border-b border-white/10 pb-2">
        <p className="font-display text-ink">Workspace</p>
        <p className="text-xs text-ink-muted">
          Creative hub — launch Companion, studios, docs, and ops. Living peers
          only (no FakeAI).
        </p>
      </header>

      {error ? (
        <p className="text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="text-xs text-ink-muted" role="status">
          {status}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-auto">
        {groups.length === 0 && !error ? (
          <p className="text-sm text-ink-muted">Loading catalog…</p>
        ) : null}
        {groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {group.label}
            </h3>
            <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
              {group.apps.map((app) => (
                <li key={app.app_id}>
                  <button
                    type="button"
                    onClick={() => openApp(app)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-lg border border-white/10",
                      "bg-black/20 px-3 py-2.5 text-left hover:border-signal/40 hover:bg-white/5",
                    )}
                  >
                    <span className="font-display text-sm text-ink">
                      {app.title}
                    </span>
                    {app.description ? (
                      <span className="line-clamp-2 text-[11px] text-ink-muted">
                        {app.description}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-[11px] text-ink-muted">
        Tip: from Companion, send text into Image, Music, Doc, Site, or Video —
        then Download takeaways when ready.
      </p>
    </div>
  );
}
