import { Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import type { RegistryServiceEntry } from "../../api/types";
import type { SandboxFormState } from "./useSandboxSession";
import { getTopicTemplates } from "./useSandboxSession";

export interface InteractionProbeProps {
  services: RegistryServiceEntry[];
  form: SandboxFormState;
  setForm: React.Dispatch<React.SetStateAction<SandboxFormState>>;
  probing: boolean;
  onFire: () => void;
}

export function InteractionProbe({
  services,
  form,
  setForm,
  probing,
  onFire,
}: InteractionProbeProps) {
  const { t } = useTranslation();
  const topics = Object.keys(getTopicTemplates());

  return (
    <div className="flex flex-col gap-3 rounded-[var(--ecc-radius-md)] border border-[var(--ecc-line)] bg-[var(--ecc-panel-raised)] p-3">
      <header className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-[var(--ecc-signal)]" strokeWidth={1.5} />
        <h3 className="font-[Sora,sans-serif] text-sm font-semibold text-[var(--ecc-ink)]">
          {t("sandbox.probeTitle")}
        </h3>
      </header>
      <p className="text-xs text-[var(--ecc-ink-muted)]">
        {t("sandbox.probeSupport")}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--ecc-ink-muted)]">
          {t("sandbox.publisher")}
          <select
            value={form.publisher}
            onChange={(e) =>
              setForm((f) => ({ ...f, publisher: e.target.value }))
            }
            className="rounded-[var(--ecc-radius-sm)] border border-[var(--ecc-line)] bg-[var(--ecc-field)] px-2 py-1.5 font-[IBM_Plex_Mono,monospace] text-sm text-[var(--ecc-ink)]"
          >
            <option value="">{t("sandbox.select")}</option>
            {services.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--ecc-ink-muted)]">
          {t("sandbox.subscriber")}
          <select
            value={form.subscriber}
            onChange={(e) =>
              setForm((f) => ({ ...f, subscriber: e.target.value }))
            }
            className="rounded-[var(--ecc-radius-sm)] border border-[var(--ecc-line)] bg-[var(--ecc-field)] px-2 py-1.5 font-[IBM_Plex_Mono,monospace] text-sm text-[var(--ecc-ink)]"
          >
            <option value="">{t("sandbox.anyBroadcast")}</option>
            {services.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-[var(--ecc-ink-muted)]">
        {t("sandbox.topic")}
        <select
          value={form.topic}
          onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
          className="rounded-[var(--ecc-radius-sm)] border border-[var(--ecc-line)] bg-[var(--ecc-field)] px-2 py-1.5 font-[IBM_Plex_Mono,monospace] text-sm text-[var(--ecc-ink)]"
        >
          {topics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
          <option value="custom.topic">custom.topic</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-[var(--ecc-ink-muted)]">
        {t("sandbox.payload")}
        <textarea
          rows={8}
          value={form.payloadText}
          onChange={(e) =>
            setForm((f) => ({ ...f, payloadText: e.target.value }))
          }
          className="resize-y rounded-[var(--ecc-radius-sm)] border border-[var(--ecc-line)] bg-[var(--ecc-console-bg)] px-2.5 py-1.5 font-[IBM_Plex_Mono,monospace] text-[12px] text-[var(--ecc-console-fg)]"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-[var(--ecc-ink-muted)]">
        <input
          type="checkbox"
          checked={form.confirmDestructive}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              confirmDestructive: e.target.checked,
            }))
          }
          className="accent-[var(--ecc-signal)]"
        />
        {t("sandbox.confirmDestructive")}
      </label>

      <Button
        onClick={onFire}
        disabled={probing || !form.publisher || !form.topic}
      >
        {probing ? t("sandbox.probing") : t("sandbox.fire")}
      </Button>
    </div>
  );
}
