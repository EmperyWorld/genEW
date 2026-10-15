import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Copy } from "lucide-react";
import { authClient } from "@/api/authClient";
import { EccApiError } from "@/api/http";
import { BrandMark } from "@/features/shell/BrandMark";
import { Button } from "@/components/Button";
import { PATHS } from "@/routes/paths";

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setResetToken(null);
    setSubmitting(true);
    try {
      const response = await authClient.requestPasswordReset(email.trim());
      setMessage(response.message ?? t("auth.forgotPassword.success"));
      if (response.reset_token) {
        setResetToken(response.reset_token);
      }
    } catch (err) {
      if (err instanceof EccApiError) {
        setError(err.message);
      } else {
        setError(t("auth.forgotPassword.error"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onCopyToken() {
    if (!resetToken) return;
    try {
      await navigator.clipboard.writeText(resetToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const resetHref = resetToken
    ? `${PATHS.resetPassword}?token=${encodeURIComponent(resetToken)}`
    : PATHS.resetPassword;

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
              {t("auth.forgotPassword.title")}
            </h1>
            <p className="font-body text-sm text-ink-muted">
              {t("auth.forgotPassword.subtitle")}
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-line bg-panel/80 p-6 backdrop-blur-sm"
        >
          <label className="block space-y-1.5">
            <span className="font-body text-sm text-ink-muted">
              {t("auth.login.email")}
            </span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-line bg-field px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal"
            />
          </label>

          {error ? (
            <p className="font-body text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="rounded-md border border-signal/30 bg-signal-soft px-4 py-3 font-body text-sm text-ink" role="status">
              {message}
            </p>
          ) : null}

          {resetToken ? (
            <div className="space-y-2 rounded-md border border-line bg-field px-4 py-3">
              <p className="font-body text-xs text-ink-muted">
                {t("auth.forgotPassword.adminTokenHint")}
              </p>
              <p className="break-all font-mono text-xs text-ink">{resetToken}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => void onCopyToken()}>
                  <Copy size={14} strokeWidth={1.5} aria-hidden />
                  {copied ? t("auth.forgotPassword.copied") : t("auth.forgotPassword.copyToken")}
                </Button>
                <Link
                  to={resetHref}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 font-body text-xs text-signal hover:bg-signal-soft"
                >
                  {t("auth.forgotPassword.useToken")}
                </Link>
              </div>
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t("auth.forgotPassword.submitting") : t("auth.forgotPassword.submit")}
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
          </Button>
        </form>

        <p className="mt-4 text-center font-body text-sm text-ink-muted">
          <Link to={PATHS.login} className="text-signal hover:underline">
            {t("auth.forgotPassword.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );

}
