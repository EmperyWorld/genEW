/**
 * Native Autonomous mount — ECC BFF Autonomous Mode (no iframe).
 * Submit intention → list jobs → detail. Open full ECC for rich ops.
 */
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  autonomousClient,
  type AutonomousJob,
  type AutonomousModeResponse,
} from "@/api/autonomousClient";
import { eccLogin, eccLogout, getEccToken } from "@/api/eccAuth";
import { cn } from "@/lib/cn";
import { eccPath } from "@/shell/eccLink";
import type { MountProps } from "./registry";

const ECC_AUTONOMOUS = eccPath("/ops/autonomous");

const CREATE_MARKERS = [
  "create_service",
  "create a service",
  "new service",
  "scaffold",
  "genesis",
  "standalone module",
  "birth",
  "создать сервис",
  "создай сервис",
  "создание сервиса",
  "новый сервис",
  "создать модуль",
] as const;

const SERVICE_NAME_RE = /^[a-z][a-z0-9_]{1,62}$/;

function requiresNamedService(intention: string): boolean {
  const text = intention.toLowerCase();
  return CREATE_MARKERS.some((m) => text.includes(m));
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function AutonomousMount(_props: MountProps) {
  const [tokenPresent, setTokenPresent] = useState(() => Boolean(getEccToken()));
  const [email, setEmail] = useState("admin@eworld.local");
  const [password, setPassword] = useState("");
  const [intention, setIntention] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [mode, setMode] = useState<AutonomousModeResponse | null>(null);
  const [jobs, setJobs] = useState<AutonomousJob[]>([]);
  const [selected, setSelected] = useState<AutonomousJob | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!getEccToken()) return;
    try {
      const [m, list] = await Promise.all([
        autonomousClient.getMode(),
        autonomousClient.listJobs(20),
      ]);
      setMode(m);
      setJobs(list.jobs);
      setTokenPresent(true);
      setStatus(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "refresh failed";
      setStatus(msg);
      if (msg.includes("401") || msg.includes("UNAUTHORIZED")) {
        eccLogout();
        setTokenPresent(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!tokenPresent) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 12_000);
    return () => window.clearInterval(id);
  }, [tokenPresent, refresh]);

  const onLogin = async () => {
    if (!email.trim() || !password) {
      setStatus("Enter email and password.");
      return;
    }
    setAuthBusy(true);
    setStatus("Signing in…");
    try {
      const res = await eccLogin(email.trim(), password);
      setTokenPresent(true);
      setPassword("");
      setStatus(`Signed in as ${res.user.display_name || res.user.email}`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "login failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const onLogout = () => {
    eccLogout();
    setTokenPresent(false);
    setJobs([]);
    setMode(null);
    setSelected(null);
    setStatus("Signed out");
  };

  const onSubmit = async () => {
    const text = intention.trim();
    if (!text || busy) return;
    if (requiresNamedService(text)) {
      const svc = serviceName.trim();
      if (!SERVICE_NAME_RE.test(svc)) {
        setStatus(
          "service_name is required for create/evolve (snake_case, e.g. recipe_probe_svc)",
        );
        return;
      }
    }
    setBusy(true);
    setStatus("Enqueueing intention…");
    try {
      const body: { intention: string; service_name?: string } = {
        intention: text,
      };
      const svc = serviceName.trim();
      if (svc) body.service_name = svc;
      const res = await autonomousClient.submitIntention(body);
      setIntention("");
      setSelected(res.job);
      setStatus(`Queued ${shortId(res.job.id)} · ${res.job.status}/${res.job.stage}`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "submit failed");
    } finally {
      setBusy(false);
    }
  };

  const onSelect = async (job: AutonomousJob) => {
    setSelected(job);
    try {
      const res = await autonomousClient.getJob(job.id);
      setSelected(res.job);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "detail failed");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-2">
        <div>
          <p className="font-display text-ink">Autonomous</p>
          <p className="text-xs text-ink-muted">
            Intention queue via ECC BFF — Architect → Implementer → Verify
          </p>
          {mode ? (
            <p className="mt-1 text-[10px] text-ink-muted">
              Mode: {mode.enabled ? "on" : "off"} · provider {mode.provider_id}
              {mode.active_job_id
                ? ` · active ${shortId(mode.active_job_id)}`
                : ""}
            </p>
          ) : null}
        </div>
        <a
          href={ECC_AUTONOMOUS}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-signal hover:bg-white/5"
        >
          Open ECC <ExternalLink size={12} />
        </a>
      </header>

      {!tokenPresent ? (
        <section className="mx-auto flex w-full max-w-md flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm text-ink">Sign in to ECC to use Autonomous</p>
          <label className="text-xs text-ink-muted" htmlFor="auto-email">
            Email
          </label>
          <input
            id="auto-email"
            type="email"
            value={email}
            disabled={authBusy}
            onChange={(e) => setEmail(e.currentTarget.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40"
          />
          <label className="text-xs text-ink-muted" htmlFor="auto-password">
            Password
          </label>
          <input
            id="auto-password"
            type="password"
            value={password}
            disabled={authBusy}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onLogin();
            }}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40"
          />
          <button
            type="button"
            disabled={authBusy}
            onClick={() => void onLogin()}
            className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal hover:bg-signal/20 disabled:opacity-50"
          >
            {authBusy ? "Signing in…" : "Sign in"}
          </button>
        </section>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section className="flex min-h-0 flex-col gap-2 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-ink-muted">New intention</p>
              <button
                type="button"
                onClick={onLogout}
                className="text-[10px] text-ink-muted hover:text-ink"
              >
                Sign out
              </button>
            </div>
            <textarea
              value={intention}
              disabled={busy || mode?.enabled === false}
              onChange={(e) => setIntention(e.currentTarget.value)}
              rows={5}
              placeholder="Describe what Empery should build or evolve…"
              className="min-h-[6rem] resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40 disabled:opacity-60"
            />
            <input
              value={serviceName}
              disabled={busy}
              onChange={(e) => setServiceName(e.currentTarget.value)}
              placeholder={
                requiresNamedService(intention)
                  ? "service_name (required for create)"
                  : "service_name (optional)"
              }
              pattern="^[a-z][a-z0-9_]{1,62}$"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs text-ink outline-none focus:border-signal/40"
            />
            {mode && !mode.enabled ? (
              <p className="text-xs text-rose-300">
                Autonomous mode is off — enable it in ECC or EIC before enqueue.
              </p>
            ) : null}
            <button
              type="button"
              disabled={
                busy ||
                !intention.trim() ||
                mode?.enabled === false ||
                (requiresNamedService(intention) &&
                  !SERVICE_NAME_RE.test(serviceName.trim()))
              }
              onClick={() => void onSubmit()}
              className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal hover:bg-signal/20 disabled:opacity-50"
            >
              {busy ? "Enqueueing…" : "Enqueue"}
            </button>

            <p className="mt-2 text-xs text-ink-muted">Recent jobs</p>
            <ul className="min-h-0 flex-1 space-y-1 overflow-auto">
              {jobs.length === 0 ? (
                <li className="text-xs text-ink-muted">No jobs yet.</li>
              ) : (
                jobs.map((job) => (
                  <li key={job.id}>
                    <button
                      type="button"
                      onClick={() => void onSelect(job)}
                      className={cn(
                        "w-full rounded-lg border px-2 py-1.5 text-left text-xs",
                        selected?.id === job.id
                          ? "border-signal/40 bg-signal/10 text-ink"
                          : "border-white/10 bg-black/20 text-ink-muted hover:border-white/20",
                      )}
                    >
                      <span className="font-mono text-[10px] text-ink-muted">
                        {shortId(job.id)}
                      </span>
                      <span className="ml-2 uppercase tracking-wide text-[10px] text-signal">
                        {job.status}/{job.stage}
                      </span>
                      <p className="mt-0.5 line-clamp-2 text-ink">
                        {job.intention_text}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="flex min-h-0 flex-col overflow-auto rounded-xl border border-dashed border-white/15 bg-black/10 p-3 text-sm">
            {selected ? (
              <div className="space-y-2">
                <p className="font-display text-ink">Job detail</p>
                <p className="font-mono text-[10px] text-ink-muted">{selected.id}</p>
                <p className="text-xs text-signal">
                  {selected.status} · {selected.stage} · {selected.provider_id}
                </p>
                <p className="whitespace-pre-wrap text-ink">{selected.intention_text}</p>
                {selected.result_summary ? (
                  <p className="whitespace-pre-wrap text-xs text-ink-muted">
                    {selected.result_summary}
                  </p>
                ) : null}
                {selected.error_message ? (
                  <p className="whitespace-pre-wrap text-xs text-rose-300">
                    {selected.error_message}
                  </p>
                ) : null}
                {selected.artifact_paths?.length ? (
                  <ul className="text-[10px] text-ink-muted">
                    {selected.artifact_paths.map((p) => (
                      <li key={p} className="font-mono">
                        {p}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center text-ink-muted">
                <p className="font-display text-ink">Detail</p>
                <p className="mt-1 max-w-xs text-xs">
                  Select a job to inspect stage, summary, and artifacts.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {status ? (
        <p className="text-xs text-ink-muted" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
