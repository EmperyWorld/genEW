import { useTranslation } from "react-i18next";
import type { ProviderConfigResponse, ProviderId } from "@/api/types";

export interface ProviderSelectProps {
  providers: ProviderConfigResponse | null;
  busy?: boolean;
  disabled?: boolean;
  onChange: (providerId: ProviderId) => void;
}

export function ProviderSelect({
  providers,
  busy = false,
  disabled = false,
  onChange,
}: ProviderSelectProps) {
  const { t } = useTranslation();
  const active = providers?.active_provider_id ?? "local";
  const options = providers?.available ?? [];

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-[Sora,sans-serif] text-xs tracking-wide text-[var(--ecc-ink-muted)]">
        {t("autonomous.provider")}
      </span>
      <select
        className="rounded-[var(--ecc-radius-sm)] border border-[var(--ecc-line)] bg-[var(--ecc-panel-raised)] px-2 py-1 font-mono text-xs text-[var(--ecc-ink)]"
        value={active}
        disabled={disabled || busy || options.length === 0}
        onChange={(e) => onChange(e.target.value as ProviderId)}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id} disabled={!opt.configured}>
            {opt.label}
            {!opt.configured ? ` ${t("autonomous.unconfigured")}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
