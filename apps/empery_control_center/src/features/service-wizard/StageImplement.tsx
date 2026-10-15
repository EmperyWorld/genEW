import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { Input } from "../../components/ui/input";
import type { OrchestrationJob } from "../../api/types";
import type { WizardFormState, WizardUiStatus } from "./useWizardSession";

export interface StageImplementProps {
  form: WizardFormState;
  setForm: React.Dispatch<React.SetStateAction<WizardFormState>>;
  status: WizardUiStatus;
  planJob?: OrchestrationJob;
  onSubmit: () => void;
}

export function StageImplement({
  form,
  setForm,
  status,
  planJob,
  onSubmit,
}: StageImplementProps) {
  const { t } = useTranslation();
  const busy = status === "running";
  const defaultPath =
    form.design_path ||
    planJob?.design_path ||
    (form.service_name
      ? `.cursor/orchestration/designs/${form.service_name}_design.md`
      : "");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="space-y-2">
        <h3 className="font-display text-lg font-semibold tracking-tight text-ink md:text-xl">
          {t("wizard.implement.headline")}
        </h3>
        <p className="text-sm text-ink-muted">
          {t("wizard.implement.support")}
        </p>
      </header>

      <p className="font-mono text-xs text-ink-faint">
        {t("wizard.target", {
          name: form.service_name || t("common.dash"),
        })}
      </p>

      <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
        {t("wizard.implement.designPath")}
        <Input
          mono
          value={form.design_path || defaultPath}
          disabled={busy}
          onChange={(e) =>
            setForm((f) => ({ ...f, design_path: e.target.value }))
          }
        />
      </label>

      <Button
        onClick={onSubmit}
        disabled={busy || !form.service_name.trim()}
      >
        {busy
          ? t("wizard.implement.submitting")
          : t("wizard.implement.submit")}
      </Button>
    </div>
  );
}
