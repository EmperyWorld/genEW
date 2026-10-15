import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import { orchestrationClient } from "@/api/orchestrationClient";
import { registryClient } from "@/api/registryClient";
import { humanizeServiceName } from "@/lib/format";
import { classifyServiceOrigin } from "@/lib/serviceOrigin";

/**
 * List Hands capsules from registry with one-click lifecycle delete.
 * Platform/seed stay out of this list (EIC delete gate still enforces).
 */
export function HandsCapsuleCleanup({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const snap = await registryClient.getSnapshot();
      const hands = snap.snapshot.services
        .filter((s) => classifyServiceOrigin(s.name, s.features ?? []) === "hands")
        .map((s) => s.name)
        .sort();
      setNames(hands);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("autonomous.handsCleanup.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const empty = useMemo(() => names.length === 0, [names]);

  async function removeOne(name: string) {
    if (disabled) return;
    const ok = window.confirm(t("wizard.lifecycle.deleteConfirm", { name }));
    if (!ok) return;
    setBusy(name);
    setError(null);
    setNote(null);
    try {
      const res = await orchestrationClient.lifecycle(name, "delete");
      if (!res.ok) {
        setError(res.error || t("wizard.lifecycle.failed"));
      } else {
        setNote(t("wizard.lifecycle.deleteOk", { name }));
        setNames((prev) => prev.filter((n) => n !== name));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wizard.lifecycle.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-line bg-panel p-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold text-ink">
            {t("autonomous.handsCleanup.title")}
          </h3>
          <p className="text-xs text-ink-muted">
            {t("autonomous.handsCleanup.support")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || busy !== null}
          onClick={() => void load()}
        >
          {t("autonomous.handsCleanup.refresh")}
        </Button>
      </header>
      {empty ? (
        <p className="text-xs text-ink-faint">{t("autonomous.handsCleanup.empty")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {names.map((name) => (
            <li
              key={name}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">
                  {humanizeServiceName(name)}
                </p>
                <p className="truncate font-mono text-[10px] text-ink-faint">
                  {name}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={disabled || busy !== null}
                onClick={() => void removeOne(name)}
              >
                {busy === name
                  ? t("wizard.lifecycle.working")
                  : t("wizard.lifecycle.delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {note ? <p className="text-xs text-ok">{note}</p> : null}
      {error ? <p className="text-xs text-console-err">{error}</p> : null}
    </section>
  );
}
