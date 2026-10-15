import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Activity } from "lucide-react";
import { healthClient } from "@/api/healthClient";
import type { HealthStatus } from "@/api/types";
import { usePolling } from "@/hooks/usePolling";
import { healthBgClass } from "@/lib/healthColor";
import { PATHS } from "@/routes/paths";
import { useEccStore } from "@/state/store";
import { cn } from "@/lib/cn";

/** Prefer slower REST when WS Live; server also TTL-caches probes. */
const SERVICES_POLL_LIVE_MS = 30_000;
const SERVICES_POLL_FALLBACK_MS = 15_000;

function boolShort(
  value: boolean | null | undefined,
  t: (key: string) => string,
  loading: boolean,
): string {
  if (loading) return t("common.loading");
  if (value === true) return t("healthPage.yes");
  if (value === false) return t("healthPage.no");
  return t("healthPage.unknown");
}

function busShort(
  fabricHealth: ReturnType<typeof useEccStore.getState>["fabricHealth"],
  loading: boolean,
  t: (key: string) => string,
): string {
  if (loading) return t("common.loading");
  if (!fabricHealth) return t("healthPage.unknown");
  const backend = fabricHealth.event_bus_backend;
  if (!fabricHealth.event_bus_ok) return `${backend} !`;
  return backend;
}

function busStatus(
  fabricHealth: ReturnType<typeof useEccStore.getState>["fabricHealth"],
  loading: boolean,
): HealthStatus {
  if (loading || !fabricHealth) return "unknown";
  if (fabricHealth.event_bus_ok === false) return "down";
  if (fabricHealth.event_bus_backend === "memory") return "degraded";
  if (fabricHealth.event_bus_ok && fabricHealth.event_bus_backend === "redis") {
    return "ok";
  }
  return "unknown";
}

function llmStatus(llmReady: boolean | null | undefined, loading: boolean): HealthStatus {
  if (loading) return "unknown";
  if (llmReady === true) return "ok";
  if (llmReady === false) return "down";
  return "unknown";
}

interface StripItemProps {
  label: string;
  value: string;
  status: HealthStatus;
}

function StripItem({ label, value, status }: StripItemProps) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-body text-xs text-ink-muted">
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", healthBgClass(status))}
        aria-hidden
      />
      <span className="text-ink-faint">{label}:</span>
      <span className="font-medium text-ink">{value}</span>
    </span>
  );
}

export function FabricSummaryStrip() {
  const { t } = useTranslation();
  const fabricHealth = useEccStore((s) => s.fabricHealth);
  const authRequired = useEccStore((s) => s.authRequired);
  const connectionStatus = useEccStore((s) => s.connectionStatus);
  const fabricLoading = fabricHealth === null;
  const liveConnected = connectionStatus === "connected";

  const [servicesOk, setServicesOk] = useState<number | null>(null);
  const [servicesTotal, setServicesTotal] = useState<number | null>(null);
  const [servicesDegraded, setServicesDegraded] = useState<number | null>(null);

  const loadServices = useCallback(async () => {
    try {
      const res = await healthClient.getServiceHealth();
      const items = res.services ?? [];
      const okCount =
        typeof res.ok_count === "number"
          ? res.ok_count
          : items.filter((s) => s.health === "ok").length;
      const degradedCount =
        typeof res.degraded_count === "number"
          ? res.degraded_count
          : items.filter((s) => s.health === "degraded" || s.health === "down")
              .length;
      setServicesOk(okCount);
      setServicesTotal(items.length);
      setServicesDegraded(degradedCount);
    } catch {
      setServicesOk(null);
      setServicesTotal(null);
      setServicesDegraded(null);
    }
  }, []);

  usePolling(
    true,
    liveConnected ? SERVICES_POLL_LIVE_MS : SERVICES_POLL_FALLBACK_MS,
    loadServices,
  );
  const servicesLabel =
    servicesOk !== null && servicesTotal !== null
      ? servicesDegraded && servicesDegraded > 0
        ? t("opsStrip.servicesCountDegraded", {
            ok: servicesOk,
            total: servicesTotal,
            degraded: servicesDegraded,
          })
        : t("opsStrip.servicesCount", { ok: servicesOk, total: servicesTotal })
      : t("common.loading");

  const authStatus: HealthStatus =
    authRequired === true ? "ok" : authRequired === false ? "degraded" : "unknown";

  return (
    <Link
      to={PATHS.opsHealth}
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-panel/70 px-4 py-2 transition-colors hover:bg-panel"
      aria-label={t("opsStrip.aria")}
    >
      <span className="inline-flex items-center gap-1.5 font-body text-xs font-medium text-signal">
        <Activity size={14} strokeWidth={1.5} aria-hidden />
        {t("opsStrip.title")}
      </span>
      <StripItem
        label={t("healthPage.eventBus")}
        value={busShort(fabricHealth, fabricLoading, t)}
        status={busStatus(fabricHealth, fabricLoading)}
      />
      <StripItem
        label={t("healthPage.llm")}
        value={boolShort(fabricHealth?.llm_ready, t, fabricLoading)}
        status={llmStatus(fabricHealth?.llm_ready, fabricLoading)}
      />
      <StripItem
        label={t("healthPage.authGate")}
        value={boolShort(authRequired, t, authRequired === null)}
        status={authStatus}
      />
      <StripItem
        label={t("healthPage.services")}
        value={servicesLabel}
        status={
          servicesOk !== null && servicesTotal !== null && servicesTotal > 0
            ? servicesOk === servicesTotal
              ? "ok"
              : servicesOk > 0
                ? "degraded"
                : "down"
            : "unknown"
        }
      />
    </Link>
  );
}
