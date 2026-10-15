import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { authClient, toAuthUser } from "@/api/authClient";
import { EccApiError } from "@/api/http";
import { BrandMark } from "@/features/shell/BrandMark";
import { Button } from "@/components/Button";
import { PATHS } from "@/routes/paths";
import { useEccStore } from "@/state/store";

interface LoginLocationState {
  registeredEmail?: string;
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const setSession = useEccStore((s) => s.setSession);
  const authRequired = useEccStore((s) => s.authRequired);

  const registeredEmail =
    (location.state as LoginLocationState | null)?.registeredEmail ?? null;

  const [email, setEmail] = useState(registeredEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nextPath = searchParams.get("next") || PATHS.ops;
  const guestAllowed = authRequired === false;
  const showLabHint = authRequired !== true;
  const hintKey = showLabHint ? "auth.login.seedHint" : "auth.login.seedHintProduction";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await authClient.login(email.trim(), password);
      setSession(response.access_token, toAuthUser(response.user));
      navigate(nextPath, { replace: true });
    } catch (err) {
      if (err instanceof EccApiError) {
        setError(err.message);
      } else {
        setError(t("auth.login.error"));
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
              {t("auth.login.title")}
            </h1>
            <p className="font-body text-sm text-ink-muted">
              {t("auth.login.subtitle")}
            </p>
          </div>
        </div>

        {registeredEmail ? (
          <p
            className="mb-4 rounded-md border border-signal/30 bg-signal-soft px-4 py-3 text-center font-body text-sm text-ink"
            role="status"
          >
            {t("auth.register.success", { email: registeredEmail })}
          </p>
        ) : null}

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

          <label className="block space-y-1.5">
            <span className="font-body text-sm text-ink-muted">
              {t("auth.login.password")}
            </span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-field px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal"
            />
          </label>

          {error ? (
            <div className="space-y-1" role="alert">
              <p className="font-body text-sm text-red-400">{error}</p>
              {showLabHint ? (
                <p className="font-body text-xs text-ink-faint">
                  {t("auth.login.seedHint")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="font-body text-xs text-ink-faint">{t(hintKey)}</p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
          </Button>

          <p className="text-center font-body text-sm">
            <Link to={PATHS.forgotPassword} className="text-signal hover:underline">
              {t("auth.login.forgotPassword")}
            </Link>
          </p>
        </form>

        <p className="mt-4 text-center font-body text-sm text-ink-muted">
          {t("auth.login.noAccount")}{" "}
          <Link to={PATHS.register} className="text-signal hover:underline">
            {t("auth.login.registerLink")}
          </Link>
        </p>

        <nav
          className="mt-6 rounded-lg border border-line/80 bg-panel/50 px-4 py-3"
          aria-label={t("onboarding.opsLinksAria")}
        >
          <p className="mb-2 font-body text-xs font-medium text-ink-muted">
            {t("auth.login.opsPathTitle")}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              to={PATHS.opsMap}
              className="rounded-md border border-line px-2.5 py-1 font-body text-xs text-signal hover:bg-signal-soft"
            >
              {t("onboarding.linkMap")}
            </Link>
            <Link
              to={PATHS.opsAutonomous}
              className="rounded-md border border-line px-2.5 py-1 font-body text-xs text-signal hover:bg-signal-soft"
            >
              {t("onboarding.linkAutonomous")}
            </Link>
            <Link
              to={PATHS.opsHealth}
              className="rounded-md border border-line px-2.5 py-1 font-body text-xs text-signal hover:bg-signal-soft"
            >
              {t("onboarding.linkHealth")}
            </Link>
          </div>
        </nav>

        {guestAllowed ? (
          <p className="mt-3 text-center font-body text-sm text-ink-muted">
            <Link
              to={PATHS.ops}
              className="text-signal hover:underline"
            >
              {t("auth.login.continueGuest")}
            </Link>
          </p>
        ) : null}

        <p className="mt-3 text-center font-body text-sm text-ink-muted">
          <Link to={PATHS.home} className="hover:underline">
            {t("auth.login.back")}
          </Link>
        </p>
      </div>
    </div>
  );
}
