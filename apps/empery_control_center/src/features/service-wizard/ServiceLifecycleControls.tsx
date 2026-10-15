import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { orchestrationClient } from "../../api/orchestrationClient";

export interface ServiceLifecycleControlsProps {
  serviceName: string;
  disabled?: boolean;
  /** Called after a successful delete so parents can drop job rows / refresh. */
  onDeleted?: (serviceName: string) => void;
}

export function ServiceLifecycleControls({
  serviceName,
  disabled = false,
  onDeleted,
}: ServiceLifecycleControlsProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<"enable" | "disable" | "delete" | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletable, setDeletable] = useState<boolean | null>(null);
  const [userCreated, setUserCreated] = useState<boolean | null>(null);
  const [ghost, setGhost] = useState<boolean | null>(null);
  const [gone, setGone] = useState(false);
  const name = serviceName.trim();
  const blocked = disabled || !name || busy !== null || gone;
  const deleteBlocked = deletable === false;

  useEffect(() => {
    if (!name) {
      setDeletable(null);
      setUserCreated(null);
      setGhost(null);
      return;
    }
    let cancelled = false;
    void orchestrationClient
      .lifecycleMeta(name)
      .then((meta) => {
        if (cancelled) return;
        setDeletable(meta.deletable);
        setUserCreated(meta.user_created);
        setGhost(meta.ghost ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setDeletable(null);
        setUserCreated(null);
        setGhost(null);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  async function run(action: "enable" | "disable" | "delete") {
    if (!name) return;
    if (action === "delete" && deleteBlocked) return;
    if (action === "delete") {
      const ok = window.confirm(
        t("wizard.lifecycle.deleteConfirm", { name }),
      );
      if (!ok) return;
    }
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const res = await orchestrationClient.lifecycle(name, action);
      if (!res.ok) {
        setError(res.error || t("wizard.lifecycle.failed"));
      } else {
        setMessage(t(`wizard.lifecycle.${action}Ok`, { name }));
        if (action === "delete") {
          setGone(true);
          onDeleted?.(name);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wizard.lifecycle.failed"));
    } finally {
      setBusy(null);
    }
  }

  if (gone) {
    return null;
  }

  return (
    <section className="space-y-3 border-t border-line pt-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-ink">
          {t("wizard.lifecycle.title")}
        </h4>
        <p className="text-xs text-ink-muted">{t("wizard.lifecycle.support")}</p>
        {userCreated === true ? (
          <p className="text-[11px] font-medium text-ok">
            {t("wizard.lifecycle.userCreatedBadge")}
          </p>
        ) : null}
        {ghost === true && deletable === true ? (
          <p className="text-[11px] text-ink-muted">
            {t("wizard.lifecycle.ghostCleanup")}
          </p>
        ) : null}
        {deleteBlocked ? (
          <p className="text-[11px] text-ink-muted">
            {t("wizard.lifecycle.deleteBlocked")}
          </p>
        ) : null}
      </header>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={blocked}
          onClick={() => void run("enable")}
        >
          {busy === "enable"
            ? t("wizard.lifecycle.working")
            : t("wizard.lifecycle.enable")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={blocked}
          onClick={() => void run("disable")}
        >
          {busy === "disable"
            ? t("wizard.lifecycle.working")
            : t("wizard.lifecycle.disable")}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={blocked || deleteBlocked}
          onClick={() => void run("delete")}
        >
          {busy === "delete"
            ? t("wizard.lifecycle.working")
            : t("wizard.lifecycle.delete")}
        </Button>
      </div>
      {message ? (
        <p className="text-xs text-ok">{message}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-console-err">{error}</p>
      ) : null}
    </section>
  );
}
