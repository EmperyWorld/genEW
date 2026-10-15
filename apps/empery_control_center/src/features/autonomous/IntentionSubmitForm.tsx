import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";

const CREATE_MARKERS = [
  "create_service",
  "create a service",
  "new service",
  "scaffold",
  "genesis",
  "standalone module",
  "birth",
  "создать сервис",
  "создай сервис",
  "создание сервиса",
  "новый сервис",
  "создать модуль",
] as const;

const SERVICE_NAME_RE = /^[a-z][a-z0-9_]{1,62}$/;

type ProfileChip = {
  id: string;
  scaffold_profile: string;
  intentHintEn: string;
  intentHintRu: string;
};

const PROFILE_CHIPS: ProfileChip[] = [
  {
    id: "chat",
    scaffold_profile: "companion_chat",
    intentHintEn: "companion chat with Nervas messages",
    intentHintRu: "companion чат с сообщениями Nervas",
  },
  {
    id: "studio",
    scaffold_profile: "studio_job",
    intentHintEn: "text-to-image studio jobs",
    intentHintRu: "студия text-to-image задач",
  },
  {
    id: "notes",
    scaffold_profile: "editor_local",
    intentHintEn: "notes блокнот TipTap longread editor",
    intentHintRu: "блокнот notes TipTap longread editor",
  },
  {
    id: "dashboard",
    scaffold_profile: "ops_dashboard",
    intentHintEn: "ops dashboard метрики jtbd board",
    intentHintRu: "дашборд метрики jtbd board",
  },
  {
    id: "crud",
    scaffold_profile: "generic",
    intentHintEn: "справочник CRUD entity list",
    intentHintRu: "справочник CRUD список сущностей",
  },
];

function requiresNamedService(intention: string): boolean {
  const text = intention.toLowerCase();
  return CREATE_MARKERS.some((m) => text.includes(m));
}

export interface IntentionSubmitFormProps {
  busy?: boolean;
  disabled?: boolean;
  flash?: boolean;
  onSubmit: (
    intention: string,
    serviceName?: string,
    metadata?: Record<string, unknown>,
  ) => Promise<unknown>;
}

export function IntentionSubmitForm({
  busy = false,
  disabled = false,
  flash = false,
  onSubmit,
}: IntentionSubmitFormProps) {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const handoffIntent = searchParams.get("intent")?.trim() ?? "";
  const handoffService = searchParams.get("service")?.trim() ?? "";
  const eccJobId = searchParams.get("ecc_job_id")?.trim() ?? "";
  const [intention, setIntention] = useState(handoffIntent);
  const [serviceName, setServiceName] = useState(handoffService);
  const [profileChip, setProfileChip] = useState<string | null>(null);

  const namedRequired = requiresNamedService(intention);
  const nameOk =
    !namedRequired || SERVICE_NAME_RE.test(serviceName.trim());
  const canEnqueue =
    Boolean(intention.trim()) && nameOk && !disabled && !busy;

  const applyChip = (chip: ProfileChip) => {
    setProfileChip(chip.id);
    const hint = i18n.language.startsWith("ru")
      ? chip.intentHintRu
      : chip.intentHintEn;
    setIntention((prev) => {
      const base = prev.trim();
      const prefix = "create_service";
      if (!base) return `${prefix} ${hint}`;
      if (base.toLowerCase().includes(chip.scaffold_profile.replace("_", " "))) {
        return base;
      }
      return `${base} ${hint}`;
    });
  };

  return (
    <form
      className={[
        "flex flex-col gap-3 transition-colors duration-300",
        flash ? "bg-[var(--ecc-signal-soft)]" : "",
      ].join(" ")}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canEnqueue) return;
        const chip = PROFILE_CHIPS.find((c) => c.id === profileChip);
        const metadata = chip
          ? { scaffold_profile: chip.scaffold_profile }
          : undefined;
        void onSubmit(
          intention.trim(),
          serviceName.trim() || undefined,
          metadata,
        ).then((ok) => {
          if (ok) {
            setIntention("");
            setProfileChip(null);
          }
        });
      }}
    >
      {eccJobId || handoffIntent ? (
        <p className="font-body text-xs text-[var(--ecc-ink-muted)]">
          {t("autonomous.wizardHandoff", { id: eccJobId || "—" })}
        </p>
      ) : null}
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={t("autonomous.profileHintsAria")}
      >
        {PROFILE_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            disabled={disabled || busy}
            className={[
              "rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-wide transition",
              profileChip === chip.id
                ? "border-signal bg-signal-soft text-ink"
                : "border-line text-ink-muted hover:border-signal/40",
            ].join(" ")}
            onClick={() => applyChip(chip)}
          >
            {t(`autonomous.profileChip.${chip.id}`)}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-[Sora,sans-serif] text-xs tracking-wide text-[var(--ecc-ink-muted)]">
          {t("autonomous.intention")}
        </span>
        <textarea
          className="min-h-[96px] w-full min-w-0 resize-y rounded-[var(--ecc-radius-sm)] border border-line bg-field px-3 py-2 font-body text-sm text-ink placeholder:text-ink-faint outline-none focus:border-signal"
          value={intention}
          disabled={disabled || busy}
          onChange={(e) => setIntention(e.target.value)}
          placeholder={t("autonomous.intentionPlaceholder")}
        />
      </label>
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1">
          <span className="font-[Sora,sans-serif] text-xs tracking-wide text-[var(--ecc-ink-muted)]">
            {namedRequired
              ? t("autonomous.serviceRequired")
              : t("autonomous.serviceOptional")}
          </span>
          <input
            className="w-full min-w-0 rounded-[var(--ecc-radius-sm)] border border-line bg-field px-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint outline-none focus:border-signal"
            value={serviceName}
            disabled={disabled || busy}
            onChange={(e) => setServiceName(e.target.value)}
            placeholder={t("autonomous.servicePlaceholder")}
            pattern="^[a-z][a-z0-9_]{1,62}$"
            required={namedRequired}
            aria-required={namedRequired}
          />
        </label>
        <Button type="submit" disabled={!canEnqueue}>
          {t("autonomous.enqueue")}
        </Button>
      </div>
    </form>
  );
}
