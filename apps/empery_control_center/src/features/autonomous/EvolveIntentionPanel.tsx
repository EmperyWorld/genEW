import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import { orchestrationClient } from "@/api/orchestrationClient";
import type { EvolveOptionDTO } from "@/api/types";

const SERVICE_NAME_RE = /^[a-z][a-z0-9_]{1,62}$/;

export interface EvolveSubmitPayload {
  intention: string;
  serviceName: string;
  metadata: {
    kind: "evolve";
    selected_option?: EvolveOptionDTO;
    selected_option_id?: string;
    evolve_skip_propose?: boolean;
    evolve_proposal_id?: string;
  };
}

export interface EvolveIntentionPanelProps {
  busy?: boolean;
  disabled?: boolean;
  onSubmit: (payload: EvolveSubmitPayload) => Promise<unknown>;
}

export function EvolveIntentionPanel({
  busy = false,
  disabled = false,
  onSubmit,
}: EvolveIntentionPanelProps) {
  const { t } = useTranslation();
  const [serviceName, setServiceName] = useState("");
  const [intent, setIntent] = useState("");
  const [options, setOptions] = useState<EvolveOptionDTO[]>([]);
  const [proposalId, setProposalId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [skipPropose, setSkipPropose] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  const nameOk = SERVICE_NAME_RE.test(serviceName.trim());
  const canPropose =
    !busy && !proposing && !disabled && nameOk && Boolean(intent.trim());
  const selected = options.find((o) => o.id === selectedId);
  const canSubmit =
    !busy &&
    !disabled &&
    nameOk &&
    Boolean(intent.trim()) &&
    (skipPropose || Boolean(selected));

  async function propose() {
    setProposeError(null);
    setProposing(true);
    try {
      const res = await orchestrationClient.evolvePropose({
        service_name: serviceName.trim(),
        intent: intent.trim(),
        option_count: 3,
      });
      setOptions(res.options);
      setProposalId(res.proposal_id);
      setSelectedId(res.options[0]?.id ?? "");
      setSkipPropose(false);
    } catch (err) {
      setProposeError(
        err instanceof Error ? err.message : t("wizard.evolve.proposeFailed"),
      );
    } finally {
      setProposing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-[Sora,sans-serif] text-xs tracking-wide text-[var(--ecc-ink-muted)]">
          {t("autonomous.serviceRequired")}
        </span>
        <input
          className="w-full min-w-0 rounded-[var(--ecc-radius-sm)] border border-line bg-field px-3 py-1.5 font-mono text-xs text-ink outline-none focus:border-signal"
          value={serviceName}
          disabled={disabled || busy}
          onChange={(e) => setServiceName(e.target.value)}
          placeholder={t("autonomous.servicePlaceholder")}
          pattern="^[a-z][a-z0-9_]{1,62}$"
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-[Sora,sans-serif] text-xs tracking-wide text-[var(--ecc-ink-muted)]">
          {t("wizard.evolve.intent")}
        </span>
        <textarea
          className="min-h-[96px] w-full resize-y rounded-[var(--ecc-radius-sm)] border border-line bg-field px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal"
          value={intent}
          disabled={disabled || busy || proposing}
          onChange={(e) => {
            setIntent(e.target.value);
            setOptions([]);
            setSelectedId("");
            setProposalId("");
          }}
          placeholder={t("wizard.evolve.intentPlaceholder")}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!canPropose}
          onClick={() => void propose()}
        >
          {proposing ? t("wizard.evolve.proposing") : t("wizard.evolve.propose")}
        </Button>
      </div>
      {proposeError ? (
        <p className="text-xs text-console-err">{proposeError}</p>
      ) : null}
      {options.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-ink">
            {t("wizard.evolve.pickOption")}
          </legend>
          <div className="flex flex-col gap-2">
            {options.map((opt) => {
              const isSel = selectedId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={busy || disabled}
                  onClick={() => setSelectedId(opt.id)}
                  className={[
                    "rounded-sm border px-3 py-2.5 text-left transition",
                    isSel
                      ? "border-ok bg-signal-soft"
                      : "border-line bg-field hover:border-ink-faint",
                  ].join(" ")}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{opt.title}</span>
                    <span className="font-mono text-[10px] uppercase text-ink-faint">
                      {opt.risk}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{opt.delta_summary}</p>
                  {opt.touches?.length ? (
                    <p className="mt-1 font-mono text-[10px] text-ink-faint">
                      {opt.touches.join(" · ")}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <label className="flex items-start gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={skipPropose}
          disabled={busy || disabled}
          onChange={(e) => {
            setSkipPropose(e.target.checked);
            if (e.target.checked) setSelectedId("");
          }}
        />
        <span>{t("wizard.evolve.skipPropose")}</span>
      </label>
      <Button
        type="button"
        disabled={!canSubmit}
        onClick={() => {
          if (!canSubmit) return;
          void onSubmit({
            intention: intent.trim().startsWith("evolve")
              ? intent.trim()
              : `evolve ${serviceName.trim()}: ${intent.trim()}`,
            serviceName: serviceName.trim(),
            metadata: {
              kind: "evolve",
              evolve_skip_propose: skipPropose || undefined,
              selected_option: skipPropose ? undefined : selected,
              selected_option_id: skipPropose ? undefined : selected?.id,
              evolve_proposal_id: proposalId || undefined,
            },
          });
        }}
      >
        {busy ? t("wizard.evolve.submitting") : t("wizard.evolve.submit")}
      </Button>
    </div>
  );
}
