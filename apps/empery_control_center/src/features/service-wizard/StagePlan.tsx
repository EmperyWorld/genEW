import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PATHS } from "@/routes/paths";
import { LoginGatePanel } from "@/features/auth/LoginGatePanel";
import { Button } from "../../components/Button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import type { WizardFormState, WizardUiStatus } from "./useWizardSession";

export interface StagePlanProps {
  form: WizardFormState;
  setForm: React.Dispatch<React.SetStateAction<WizardFormState>>;
  status: WizardUiStatus;
  onSubmit: () => void;
  /** Market guest — show login CTAs instead of silent disabled submit. */
  needsLogin?: boolean;
}

export function StagePlan({
  form,
  setForm,
  status,
  onSubmit,
  needsLogin = false,
}: StagePlanProps) {
  const { t } = useTranslation();
  const busy = status === "running";

  const autonomousParams = new URLSearchParams();
  if (form.intent.trim()) autonomousParams.set("intent", form.intent.trim());
  if (form.service_name.trim()) {
    autonomousParams.set("service", form.service_name.trim());
  }
  const autonomousHref = autonomousParams.toString()
    ? `${PATHS.opsAutonomous}?${autonomousParams.toString()}`
    : PATHS.opsAutonomous;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="space-y-2">
        <h3 className="font-display text-lg font-semibold tracking-tight text-ink md:text-xl">
          {t("wizard.plan.headline")}
        </h3>
        <p className="text-sm text-ink-muted">{t("wizard.plan.support")}</p>
      </header>

      {needsLogin ? (
        <LoginGatePanel
          compact
          nextPath={autonomousHref}
          messageKey="auth.guest.loginToBirth"
        />
      ) : null}

      <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
        {t("wizard.plan.serviceName")}
        <Input
          required
          mono
          pattern="^[a-z][a-z0-9_]*$"
          value={form.service_name}
          disabled={busy}
          onChange={(e) =>
            setForm((f) => ({ ...f, service_name: e.target.value }))
          }
          placeholder={t("wizard.plan.servicePlaceholder")}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
        {t("wizard.plan.intent")}
        <Textarea
          required
          rows={5}
          value={form.intent}
          disabled={busy}
          onChange={(e) => setForm((f) => ({ ...f, intent: e.target.value }))}
          placeholder={t("wizard.plan.intentPlaceholder")}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
        {t("wizard.plan.features")}
        <Input
          value={form.featuresText}
          disabled={busy}
          onChange={(e) =>
            setForm((f) => ({ ...f, featuresText: e.target.value }))
          }
          placeholder={t("wizard.plan.featuresPlaceholder")}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild disabled={busy}>
          <Link to={autonomousHref}>{t("wizard.plan.ctaAutonomous")}</Link>
        </Button>
        {needsLogin ? (
          <p className="w-full text-xs text-ink-muted">
            {t("auth.guest.wizardCursorRequiresLogin")}
          </p>
        ) : import.meta.env.VITE_EMPERY_CURSOR_SALVAGE === "1" ? (
          <Button
            variant="ghost"
            onClick={onSubmit}
            disabled={
              busy || !form.service_name.trim() || !form.intent.trim()
            }
          >
            {t("wizard.plan.submitCursor")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
