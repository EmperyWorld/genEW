/**
 * Native Control Center mount — ECC health mesh + registry (no iframe).
 * Full ECC product UI remains one click away.
 */
import { ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  controlCenterClient,
  type RegistryService,
  type ServiceHealthItem,
  type ServiceHealthListResponse,
} from "@/api/controlCenterClient";
import { eccLogin, eccLogout, getEccToken } from "@/api/eccAuth";
import { cn } from "@/lib/cn";
import { eccPath } from "@/shell/eccLink";
import type { MountProps } from "./registry";

const ECC_OPS = eccPath("/ops");
const ECC_HEALTH = eccPath("/ops/health");

function healthTone(health: string): string {
  const h = health.toLowerCase();
  if (h === "ok" || h === "healthy" || h === "up") return "text-emerald-400";
  if (h === "degraded" || h === "warn") return "text-amber-400";
  if (h === "down" || h === "error" || h === "fail") return "text-rose-400";
  return "text-ink-muted";
}

export function ControlCenterMount(_props: MountProps) {
  const [tokenPresent, setTokenPresent] = useState(() => Boolean(getEccToken()));
  const [email, setEmail] = useState("admin@eworld.local");
  const [password, setPassword] = useState("");
  const [mesh, setMesh] = useState<ServiceHealthListResponse | null>(null);
  const [services, setServices] = useState<RegistryService[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [health, reg] = await Promise.all([
        controlCenterClient.getServiceHealth(),
        controlCenterClient.getRegistry(),
      ]);
      setMesh(health);
      setServices(reg.snapshot.services);
      setGeneratedAt(reg.snapshot.generated_at);
      setStatus(null);
      if (getEccToken()) setTokenPresent(true);
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
    void refresh();
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

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
    setStatus("Signed out");
  };

  const onRefreshRegistry = async () => {
    if (!getEccToken()) {
      setStatus("Sign in to refresh registry.");
      return;
    }
    setBusy(true);
    setStatus("Refreshing registry…");
    try {
      const reg = await controlCenterClient.refreshRegistry();
      setServices(reg.snapshot.services);
      setGeneratedAt(reg.snapshot.generated_at);
      setStatus(`Registry refreshed · ${reg.snapshot.services.length} services`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "refresh failed");
    } finally {
      setBusy(false);
    }
  };

  const rows: ServiceHealthItem[] = mesh?.services ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-ink">Control Center</p>
          <p className="text-xs text-ink-muted">
            Live health mesh + registry — ECC BFF (no iframe)
          </p>
          {mesh ? (
            <p className="mt-1 text-xs text-ink-muted">
              {mesh.ok_count} ok
              {mesh.degraded_count ? ` · ${mesh.degraded_count} degraded` : ""}
              {mesh.down_count ? ` · ${mesh.down_count} down` : ""}
              {mesh.unknown_count ? ` · ${mesh.unknown_count} unknown` : ""}
              {mesh.alert ? " · alert" : ""}
              {" · "}
              {services.length} registered
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onRefreshRegistry()}
            disabled={busy || !tokenPresent}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-ink hover:bg-white/5 disabled:opacity-40"
          >
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
            Refresh registry
          </button>
          <a
            href={ECC_OPS}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-signal hover:bg-white/5"
          >
            Open ECC <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {!tokenPresent ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className="text-[11px] text-ink-muted">ECC email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-ink outline-none focus:border-signal"
              autoComplete="username"
            />
          </label>
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
            <span className="text-[11px] text-ink-muted">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-ink outline-none focus:border-signal"
              autoComplete="current-password"
            />
          </label>
          <button
            type="button"
            onClick={() => void onLogin()}
            disabled={authBusy}
            className="rounded-md bg-signal/90 px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-50"
          >
            {authBusy ? "…" : "Sign in"}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
          <span>Signed in · registry refresh enabled</span>
          <button
            type="button"
            onClick={onLogout}
            className="text-signal underline-offset-2 hover:underline"
          >
            Sign out
          </button>
        </div>
      )}

      {status ? (
        <p className="text-xs text-ink-muted" role="status">
          {status}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
        <section className="flex min-h-0 flex-col rounded-lg border border-white/10 bg-black/20">
          <div className="border-b border-white/10 px-3 py-2">
            <p className="text-xs font-medium text-ink">Health mesh</p>
            <p className="text-[11px] text-ink-muted">
              <a
                className="text-signal underline"
                href={ECC_HEALTH}
                target="_blank"
                rel="noreferrer"
              >
                Full health map
              </a>
            </p>
          </div>
          <ul className="m-0 min-h-0 flex-1 list-none space-y-0.5 overflow-auto p-2">
            {rows.length === 0 ? (
              <li className="px-1 py-2 text-xs text-ink-muted">Loading…</li>
            ) : (
              rows.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-white/5"
                >
                  <span className="truncate font-mono text-xs text-ink">
                    {row.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[11px] uppercase",
                      healthTone(row.health),
                    )}
                  >
                    {row.health}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="flex min-h-0 flex-col rounded-lg border border-white/10 bg-black/20">
          <div className="border-b border-white/10 px-3 py-2">
            <p className="text-xs font-medium text-ink">Registry</p>
            <p className="text-[11px] text-ink-muted">
              {generatedAt
                ? `Snapshot ${new Date(generatedAt).toLocaleString()}`
                : "—"}
            </p>
          </div>
          <ul className="m-0 min-h-0 flex-1 list-none space-y-0.5 overflow-auto p-2">
            {services.length === 0 ? (
              <li className="px-1 py-2 text-xs text-ink-muted">Loading…</li>
            ) : (
              services.map((svc) => (
                <li
                  key={svc.name}
                  className="rounded-md px-2 py-1.5 hover:bg-white/5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-xs text-ink">
                      {svc.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-muted">
                      v{svc.version}
                    </span>
                  </div>
                  {svc.features?.length ? (
                    <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                      {svc.features.slice(0, 4).join(" · ")}
                      {svc.features.length > 4 ? "…" : ""}
                    </p>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
