import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemorySearchHit } from "@/api/types";

export interface MemorySearchLightProps {
  hits: MemorySearchHit[];
  query: string;
  serviceName: string;
  onSearch: (q: string, serviceName?: string) => void;
}

export function MemorySearchLight({
  hits,
  query,
  serviceName,
  onSearch,
}: MemorySearchLightProps) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(query);
  const [localService, setLocalService] = useState(serviceName);

  useEffect(() => {
    setLocal(query);
  }, [query]);

  useEffect(() => {
    setLocalService(serviceName);
  }, [serviceName]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (local !== query || localService !== serviceName) {
        onSearch(local, localService.trim() || undefined);
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [local, localService, onSearch, query, serviceName]);

  return (
    <div className="flex flex-col gap-2">
      <input
        className="w-full min-w-0 rounded-[var(--ecc-radius-sm)] border border-line bg-field px-3 py-1.5 font-body text-sm text-ink placeholder:text-ink-faint outline-none focus:border-signal"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={t("autonomous.memoryPlaceholder")}
        data-testid="autonomous-memory-query"
      />
      <input
        className="w-full min-w-0 rounded-[var(--ecc-radius-sm)] border border-line bg-field px-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint outline-none focus:border-signal"
        value={localService}
        onChange={(e) => setLocalService(e.target.value)}
        placeholder={t("autonomous.memoryServicePlaceholder")}
        aria-label={t("autonomous.memoryServiceFilter")}
        data-testid="autonomous-memory-service"
      />
      <ul
        className="m-0 max-h-40 min-w-0 list-none space-y-2 overflow-x-hidden overflow-y-auto p-0"
        data-testid="autonomous-memory-hits"
      >
        {hits.map((hit) => (
          <li
            key={hit.atom_id}
            className="min-w-0 border-b border-[var(--ecc-line)] pb-2 last:border-b-0"
          >
            <div className="break-words font-[Sora,sans-serif] text-xs text-[var(--ecc-ink)]">
              {hit.title}
            </div>
            <div className="break-all font-mono text-[11px] text-[var(--ecc-ink-muted)]">
              {hit.kind}
              {hit.service_name ? ` · ${hit.service_name}` : ""}
            </div>
            <p className="mt-0.5 break-words text-xs text-[var(--ecc-ink-muted)]">
              {hit.snippet}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
