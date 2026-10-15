import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { authClient } from "@/api/authClient";
import { EccApiError } from "@/api/http";
import { BrandMark } from "@/features/shell/BrandMark";
import { Button } from "@/components/Button";
import { PATHS } from "@/routes/paths";

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromQuery = searchParams.get("token") ?? "";

  const [token, setToken] = useState(tokenFromQuery);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("auth.resetPassword.mismatch"));
      return;
    }

    setSubmitting(true);
    try {
      await authClient.confirmPasswordReset(token.trim(), password);
      setSuccess(true);
    } catch (err) {
      if (err instanceof EccApiError) {
        setError(err.message);
      } else {
        setError(t("auth.resetPassword.error"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 35%, rgba(61,220,151,0.08), transparent 60%)",
        }}
      />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <BrandMark size="compact" />
          <div className="space-y-1">
            <h1 className="font-display text-xl font-semibold text-ink">
              {t("auth.resetPassword.title")}
            </h1>
            <p className="font-body text-sm text-ink-muted">
              {t("auth.resetPassword.subtitle")}
            </p>
          </div>
        </div>

        {success ? (
          <div
            className="space-y-4 rounded-lg border border-ok/40 bg-signal-soft p-6 text-center"
            role="status"
          >
            <p className="font-body text-sm text-ink">{t("auth.resetPassword.success")}</p>
            <Button type="button" className="w-full" onClick={() => navigate(PATHS.login)}>
              {t("auth.resetPassword.signIn")}
              <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
            </Button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-lg border border-line bg-panel/80 p-6 backdrop-blur-sm"
          >
            <label className="block space-y-1.5">
              <span className="font-body text-sm text-ink-muted">
                {t("auth.resetPassword.token")}
              </span>
              <input
                type="text"
                name="token"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-md border border-line bg-field px-3 py-2 font-mono text-xs text-ink outline-none focus:border-signal"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="font-body text-sm text-ink-muted">
                {t("auth.resetPassword.newPassword")}
              </span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-line bg-field px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="font-body text-sm text-ink-muted">
                {t("auth.resetPassword.confirmPassword")}
              </span>
              <input
                type="password"
                name="confirm_password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-line bg-field px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal"
              />
            </label>

            {error ? (
              <p className="font-body text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? t("auth.resetPassword.submitting") : t("auth.resetPassword.submit")}
              <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
            </Button>
          </form>
        )}

        <p className="mt-4 text-center font-body text-sm text-ink-muted">
          <Link to={PATHS.forgotPassword} className="text-signal hover:underline">
            {t("auth.resetPassword.requestAgain")}
          </Link>
          {" · "}
          <Link to={PATHS.login} className="hover:underline">
            {t("auth.forgotPassword.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
