import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { authClient, toAuthUser } from "@/api/authClient";
import { EccApiError } from "@/api/http";
import { BrandMark } from "@/features/shell/BrandMark";
import { Button } from "@/components/Button";
import { PATHS } from "@/routes/paths";
import { useEccStore } from "@/state/store";

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useEccStore((s) => s.setSession);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const trimmedEmail = email.trim();
      const response = await authClient.register(
        trimmedEmail,
        password,
        displayName.trim() || null,
      );

      if (response.access_token) {
        setSession(response.access_token, toAuthUser(response.user));
        navigate(PATHS.ops, { replace: true });
        return;
      }

      navigate(PATHS.login, {
        replace: true,
        state: { registeredEmail: trimmedEmail },
      });
    } catch (err) {
      if (err instanceof EccApiError) {
        setError(err.message);
      } else {
        setError(t("auth.register.error"));
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
              {t("auth.register.title")}
            </h1>
            <p className="font-body text-sm text-ink-muted">
              {t("auth.register.subtitle")}
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-line bg-panel/80 p-6 backdrop-blur-sm"
        >
          <label className="block space-y-1.5">
            <span className="font-body text-sm text-ink-muted">
              {t("auth.register.email")}
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
              {t("auth.register.password")}
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
              {t("auth.register.displayName")}
            </span>
            <input
              type="text"
              name="display_name"
              autoComplete="name"
              maxLength={200}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("auth.register.displayNamePlaceholder")}
              className="w-full rounded-md border border-line bg-field px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal"
            />
          </label>

          {error ? (
            <p className="font-body text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t("auth.register.submitting") : t("auth.register.submit")}
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
          </Button>
        </form>

        <p className="mt-4 text-center font-body text-sm text-ink-muted">
          {t("auth.register.hasAccount")}{" "}
          <Link to={PATHS.login} className="text-signal hover:underline">
            {t("auth.register.signInLink")}
          </Link>
        </p>
        <p className="mt-3 text-center font-body text-sm text-ink-muted">
          <Link to={PATHS.home} className="hover:underline">
            {t("auth.register.back")}
          </Link>
        </p>
      </div>
    </div>
  );
}
