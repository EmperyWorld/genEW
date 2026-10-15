import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { Textarea } from "../../components/ui/textarea";
import { orchestrationClient } from "../../api/orchestrationClient";
import type { EvolveOptionDTO } from "../../api/types";
import type { WizardFormState, WizardUiStatus } from "./useWizardSession";

export interface StageEvolveProps {
  form: WizardFormState;
  setForm: React.Dispatch<React.SetStateAction<WizardFormState>>;
  status: WizardUiStatus;
  onSubmit: () => void;
}

export function StageEvolve({
  form,
  setForm,
  status,
  onSubmit,
}: StageEvolveProps) {
  const { t } = useTranslation();
  const busy = status === "running";
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  const canPropose =
    !busy &&
    !proposing &&
    Boolean(form.service_name.trim()) &&
    Boolean(form.evolve_intent.trim());

  const canSubmit =
    !busy &&
    Boolean(form.service_name.trim()) &&
    Boolean(form.evolve_intent.trim()) &&
    (form.evolve_skip_propose || Boolean(form.selected_option_id));

  async function propose() {
    setProposeError(null);
    setProposing(true);
    try {
      const res = await orchestrationClient.evolvePropose({
        service_name: form.service_name.trim(),
        intent: form.evolve_intent.trim(),
        option_count: 3,
      });
      setForm((f) => ({
        ...f,
        evolve_options: res.options,
        evolve_proposal_id: res.proposal_id,
        selected_option_id: res.options[0]?.id ?? "",
        evolve_skip_propose: false,
      }));
    } catch (err) {
      setProposeError(
        err instanceof Error ? err.message : t("wizard.evolve.proposeFailed"),
      );
    } finally {
      setProposing(false);
    }
  }

  function selectOption(option: EvolveOptionDTO) {
    setForm((f) => ({ ...f, selected_option_id: option.id }));
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="space-y-2">
        <h3 className="font-display text-lg font-semibold tracking-tight text-ink md:text-xl">
          {t("wizard.evolve.headline")}
        </h3>
        <p className="text-sm text-ink-muted">{t("wizard.evolve.support")}</p>
      </header>

      <p className="font-mono text-xs text-ink-faint">
        {t("wizard.target", {
          name: form.service_name || t("common.dash"),
        })}
      </p>

      <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
        {t("wizard.evolve.intent")}
        <Textarea
          rows={5}
          value={form.evolve_intent}
          disabled={busy || proposing}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              evolve_intent: e.target.value,
              evolve_options: [],
              selected_option_id: "",
              evolve_proposal_id: "",
            }))
          }
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
          {proposing
            ? t("wizard.evolve.proposing")
            : t("wizard.evolve.propose")}
        </Button>
      </div>

      {proposeError ? (
        <p className="text-xs text-console-err">{proposeError}</p>
      ) : null}

      {form.evolve_options.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-ink">
            {t("wizard.evolve.pickOption")}
          </legend>
          <div className="flex flex-col gap-2">
            {form.evolve_options.map((opt) => {
              const selected = form.selected_option_id === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={busy}
                  onClick={() => selectOption(opt)}
                  className={[
                    "rounded-sm border px-3 py-2.5 text-left transition",
                    selected
                      ? "border-ok bg-signal-soft"
                      : "border-line bg-field hover:border-ink-faint",
                  ].join(" ")}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {opt.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-ink-faint">
                      {opt.risk}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {opt.delta_summary}
                  </p>
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
          checked={form.evolve_skip_propose}
          disabled={busy}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              evolve_skip_propose: e.target.checked,
              selected_option_id: e.target.checked
                ? ""
                : f.selected_option_id,
            }))
          }
        />
        <span>{t("wizard.evolve.skipPropose")}</span>
      </label>

      <Button onClick={onSubmit} disabled={!canSubmit}>
        {busy ? t("wizard.evolve.submitting") : t("wizard.evolve.submit")}
      </Button>
    </div>
  );
}
