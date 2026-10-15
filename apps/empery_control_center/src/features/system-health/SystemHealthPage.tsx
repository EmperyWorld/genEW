import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Activity } from "lucide-react";
import { healthClient } from "@/api/healthClient";
import type { HealthStatus, ServiceHealthItem, HealthHistorySample, HealthStatusChange } from "@/api/types";
import { Button } from "@/components/Button";
import { usePolling } from "@/hooks/usePolling";
import { healthBgClass, healthColorClass } from "@/lib/healthColor";
import { useEccStore } from "@/state/store";
import { cn } from "@/lib/cn";

const SERVICES_POLL_MS = 15_000;

function boolLabel(
  value: boolean | null | undefined,
  t: (key: string) => string,
  loading = false,
): string {
  if (loading) return t("common.loading");
  if (value === true) return t("healthPage.yes");
  if (value === false) return t("healthPage.no");
  return t("healthPage.unknown");
}

function llmStatus(
  llmReady: boolean | null | undefined,
  loading = false,
): HealthStatus {
  if (loading) return "unknown";
  if (llmReady === true) return "ok";
  if (llmReady === false) return "down";
  return "unknown";
}

function busStatus(
  eventBusOk: boolean | undefined,
  backend: string | undefined,
  loading = false,
): HealthStatus {
  if (loading) return "unknown";
  if (eventBusOk === false) return "down";
  if (backend === "memory") return "degraded";
  if (eventBusOk === true && backend === "redis") return "ok";
  return "unknown";
}

function statusLabelKey(status: HealthStatus): string {
  switch (status) {
    case "ok":
      return "healthPage.ok";
    case "degraded":
      return "healthPage.degraded";
    case "down":
      return "healthPage.down";
    default:
      return "healthPage.unknown";
  }
}

function FabricRowSkeleton({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-unknown/40"
          aria-hidden
        />
        <span className="truncate font-body text-sm text-ink-muted">{label}</span>
      </div>
      <span className="shrink-0 font-body text-sm font-medium text-ink-muted">
        …
      </span>
    </div>
  );
}

function FabricRow({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: HealthStatus;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", healthBgClass(status))}
          aria-hidden
        />
        <span className="truncate font-body text-sm text-ink-muted">{label}</span>
      </div>
      <span
        className={cn(
          "shrink-0 font-body text-sm font-medium",
          healthColorClass(status),
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function SystemHealthPage() {
  const { t } = useTranslation();
  const fabricHealth = useEccStore((s) => s.fabricHealth);
  const authRequired = useEccStore((s) => s.authRequired);
  const connectionStatus = useEccStore((s) => s.connectionStatus);
  const [services, setServices] = useState<ServiceHealthItem[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [healthMeta, setHealthMeta] = useState<{
    ok: number;
    degraded: number;
    down: number;
    unknown: number;
    alert: boolean;
  } | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthHistorySample[]>([]);
  const [healthChanges, setHealthChanges] = useState<HealthStatusChange[]>([]);

  const loadServices = useCallback(async () => {
    setLoadingServices(true);
    try {
      const res = await healthClient.getServiceHealth();
      const items = res.services ?? [];
      setServices(items);
      setHealthMeta({
        ok: res.ok_count ?? items.filter((s) => s.health === "ok").length,
        degraded:
          res.degraded_count ??
          items.filter((s) => s.health === "degraded").length,
        down: res.down_count ?? items.filter((s) => s.health === "down").length,
        unknown:
          res.unknown_count ??
          items.filter((s) => s.health === "unknown").length,
        alert: Boolean(res.alert),
      });
      setHealthHistory(res.history ?? []);
      setHealthChanges(res.recent_changes ?? []);
    } catch {
      setServices([]);
      setHealthMeta(null);
      setHealthHistory([]);
      setHealthChanges([]);
    } finally {
      setLoadingServices(false);
    }
  }, []);

  // Fabric gateway fields come from HealthBootstrap; only batch-probe services here.
  usePolling(true, SERVICES_POLL_MS, loadServices);

  const fabricLoading = fabricHealth === null;
  const authLoading = authRequired === null;

  const eventValue = fabricLoading
    ? t("common.loading")
    : `${fabricHealth.event_bus_backend}${fabricHealth.event_bus_ok ? "" : " !"}`;

  const wsLabelKey = (() => {
    switch (connectionStatus) {
      case "connected":
        return "healthPage.wsConnected";
      case "reconnecting":
        return "healthPage.wsReconnecting";
      case "offline":
        return "healthPage.wsOffline";
      case "idle":
      default:
        return fabricLoading ? "common.loading" : "healthPage.unknown";
    }
  })();

  const wsStatus: HealthStatus = fabricLoading
    ? "unknown"
    : connectionStatus === "connected"
      ? "ok"
      : connectionStatus === "reconnecting"
        ? "degraded"
        : connectionStatus === "offline"
          ? "down"
          : "unknown";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-signal">
            <Activity size={18} strokeWidth={1.5} aria-hidden />
            <h1 className="font-display text-xl font-semibold text-ink">
              {t("healthPage.title")}
            </h1>
          </div>
          <p className="max-w-xl font-body text-sm text-ink-muted">
            {t("healthPage.subtitle")}
          </p>
          {fabricHealth?.checked_at ? (
            <p className="font-body text-xs text-ink-faint">
              {t("healthPage.checkedAt", {
                time: new Date(fabricHealth.checked_at).toLocaleTimeString(),
              })}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          disabled={loadingServices}
          onClick={() => void loadServices()}
        >
          <RefreshCw
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className={loadingServices ? "animate-spin" : undefined}
          />
          {t("healthPage.refresh")}
        </Button>
      </header>

      <section aria-labelledby="fabric-heading" className="space-y-1">
        <h2
          id="fabric-heading"
          className="font-body text-xs font-medium uppercase tracking-wide text-ink-faint"
        >
          {t("healthPage.fabric")}
        </h2>
        <div className="rounded-lg border border-line bg-panel/60 px-4">
          {fabricLoading ? (
            <>
              <FabricRowSkeleton label={t("healthPage.eventBus")} />
              <FabricRowSkeleton label={t("healthPage.redisConfigured")} />
              <FabricRowSkeleton label={t("healthPage.llm")} />
              <FabricRowSkeleton label={t("healthPage.authGate")} />
              <FabricRowSkeleton label={t("healthPage.ws")} />
            </>
          ) : (
            <>
              <FabricRow
                label={t("healthPage.eventBus")}
                value={eventValue}
                status={busStatus(
                  fabricHealth?.event_bus_ok,
                  fabricHealth?.event_bus_backend,
                  fabricLoading,
                )}
              />
              <FabricRow
                label={t("healthPage.redisConfigured")}
                value={boolLabel(fabricHealth?.redis_configured, t, fabricLoading)}
                status={
                  fabricHealth?.redis_configured === true
                    ? "ok"
                    : fabricHealth?.redis_configured === false
                      ? "down"
                      : "unknown"
                }
              />
              <FabricRow
                label={t("healthPage.llm")}
                value={boolLabel(fabricHealth?.llm_ready, t, fabricLoading)}
                status={llmStatus(fabricHealth?.llm_ready, fabricLoading)}
              />
              <FabricRow
                label={t("healthPage.authGate")}
                value={boolLabel(authRequired, t, authLoading)}
                status={
                  authRequired === true
                    ? "ok"
                    : authRequired === false
                      ? "degraded"
                      : "unknown"
                }
              />
              <FabricRow
                label={t("healthPage.ws")}
                value={t(wsLabelKey)}
                status={wsStatus}
              />
            </>
          )}
        </div>
      </section>

      {(healthChanges.length > 0 || healthHistory.length > 0) ? (
        <section aria-labelledby="history-heading" className="space-y-3">
          <h2
            id="history-heading"
            className="font-body text-xs font-medium uppercase tracking-wide text-ink-faint"
          >
            {t("healthPage.recentActivity")}
          </h2>
          <div className="rounded-lg border border-line bg-panel/60 px-4 py-3">
            {healthChanges.length > 0 ? (
              <ul className="mb-3 space-y-2 border-b border-line pb-3 last:mb-0 last:border-b-0 last:pb-0">
                {healthChanges.slice(0, 8).map((change) => (
                  <li
                    key={`${change.service_name}-${change.changed_at}`}
                    className="flex flex-wrap items-center justify-between gap-2 font-body text-xs"
                  >
                    <span className="font-mono text-ink">{change.service_name}</span>
                    <span className="text-ink-muted">
                      {change.from_health
                        ? t("healthPage.statusChange", {
                            from: t(statusLabelKey(change.from_health)),
                            to: t(statusLabelKey(change.to_health)),
                          })
                        : t("healthPage.statusInitial", {
                            status: t(statusLabelKey(change.to_health)),
                          })}
                    </span>
                    <span className="text-ink-faint">
                      {new Date(change.changed_at).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-body text-xs text-ink-muted">
                {t("healthPage.noRecentChanges")}
              </p>
            )}
            {healthHistory.length > 1 ? (
              <p className="font-body text-xs text-ink-faint">
                {t("healthPage.historySamples", {
                  count: healthHistory.length,
                  latest: healthHistory[healthHistory.length - 1]?.alert
                    ? t("healthPage.alertOn")
                    : t("healthPage.alertOff"),
                })}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="services-heading" className="space-y-3">
        <h2
          id="services-heading"
          className="font-body text-xs font-medium uppercase tracking-wide text-ink-faint"
        >
          {t("healthPage.services")}
        </h2>
        {healthMeta ? (
          <p
            className={
              healthMeta.alert
                ? "font-body text-sm text-degraded"
                : "font-body text-sm text-ink-muted"
            }
            role={healthMeta.alert ? "status" : undefined}
          >
            {t("healthPage.servicesSummary", healthMeta)}
            {healthMeta.alert ? ` ${t("healthPage.servicesAlert")}` : null}
          </p>
        ) : null}
        <div className="rounded-lg border border-line bg-panel/60 px-4">
          {services.length === 0 ? (
            <p className="py-6 text-center font-body text-sm text-ink-muted">
              {loadingServices ? t("common.loading") : t("map.empty")}
            </p>
          ) : (
            services.map((svc) => (
              <FabricRow
                key={svc.name}
                label={svc.name}
                value={t(statusLabelKey(svc.health))}
                status={svc.health}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
