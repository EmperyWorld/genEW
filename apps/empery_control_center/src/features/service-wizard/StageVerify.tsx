import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "../../components/Button";
import { PATHS } from "@/routes/paths";
import type { OrchestrationJob } from "../../api/types";
import type { WizardFormState, WizardUiStatus } from "./useWizardSession";
import { ServiceLifecycleControls } from "./ServiceLifecycleControls";

export interface StageVerifyProps {
  form: WizardFormState;
  setForm: React.Dispatch<React.SetStateAction<WizardFormState>>;
  status: WizardUiStatus;
  job: OrchestrationJob | null;
  onSubmit: () => void;
}

export function StageVerify({
  form,
  status,
  job,
  onSubmit,
}: StageVerifyProps) {
  const { t } = useTranslation();
  const busy = status === "running";
  const passed = status === "passed" || job?.status === "completed";
  const failed = status === "failed" || job?.status === "failed";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="space-y-2">
        <h3 className="font-display text-lg font-semibold tracking-tight text-ink md:text-xl">
          {t("wizard.verify.headline")}
        </h3>
        <p className="text-sm text-ink-muted">{t("wizard.verify.support")}</p>
      </header>

      <p className="font-mono text-xs text-ink-faint">
        {t("wizard.target", {
          name: form.service_name || t("common.dash"),
        })}
      </p>

      {passed ? (
        <div className="space-y-3 rounded-sm border border-ok/40 bg-signal-soft px-3 py-2.5 text-sm text-ok">
          <p>{t("wizard.verify.pass")}</p>
          {job?.report_path ? (
            <p className="font-mono text-[11px] text-ink-muted">
              {job.report_path}
            </p>
          ) : null}
          {job?.result_summary ? (
            <p className="text-xs text-ink-muted">{job.result_summary}</p>
          ) : null}
          <p className="text-xs text-ink-muted">{t("wizard.verify.successBody")}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              to={PATHS.ops}
              className="inline-flex items-center gap-1.5 rounded-sm border border-ok/40 px-3 py-1.5 text-xs font-medium text-ok hover:bg-ok/10"
            >
              {t("wizard.verify.ctaOps")}
              <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
            </Link>
            <Link
              to={PATHS.opsHealth}
              className="inline-flex items-center gap-1.5 rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
            >
              {t("wizard.verify.ctaHealth")}
            </Link>
          </div>
        </div>
      ) : null}

      {failed ? (
        <div className="rounded-sm border border-down/40 bg-down/10 px-3 py-2.5 text-sm text-console-err">
          {t("wizard.verify.fail")}
          {job?.error_message ? (
            <p className="mt-1 text-xs">{job.error_message}</p>
          ) : null}
          {job?.report_path ? (
            <p className="mt-1 font-mono text-[11px] opacity-80">
              {job.report_path}
            </p>
          ) : null}
        </div>
      ) : null}

      <Button
        onClick={onSubmit}
        disabled={busy || !form.service_name.trim()}
      >
        {busy ? t("wizard.verify.submitting") : t("wizard.verify.submit")}
      </Button>

      <ServiceLifecycleControls
        serviceName={form.service_name}
        disabled={busy}
      />
    </div>
  );
}
