import { useTranslation } from "react-i18next";
import type { EventBusBackend, WsConnectionStatus } from "@/api/types";
import { useEccStore } from "@/state/store";

function toneFor(status: WsConnectionStatus, fabricDegraded: boolean): string {
  if (fabricDegraded && status === "connected") {
    return "bg-degraded";
  }
  switch (status) {
    case "connected":
      return "bg-ok";
    case "reconnecting":
      return "bg-degraded";
    case "offline":
      return "bg-down";
    case "idle":
    default:
      return "bg-unknown";
  }
}

function isFabricDegraded(
  backend: EventBusBackend | undefined,
  eventBusOk: boolean | undefined,
  llmReady: boolean | null | undefined,
): boolean {
  if (eventBusOk === false) return true;
  if (llmReady === false) return true;
  return backend === "memory";
}

export function StatusBeacon() {
  const { t } = useTranslation();
  const status = useEccStore((s) => s.connectionStatus);
  const attempts = useEccStore((s) => s.reconnectAttempts);
  const fabricHealth = useEccStore((s) => s.fabricHealth);

  const fabricDegraded = isFabricDegraded(
    fabricHealth?.event_bus_backend,
    fabricHealth?.event_bus_ok,
    fabricHealth?.llm_ready,
  );

  const label =
    status === "offline"
      ? t("shell.offline")
      : status === "reconnecting"
        ? t("shell.degraded")
        : fabricDegraded
          ? fabricHealth?.llm_ready === false
            ? t("shell.llmDown")
            : fabricHealth?.event_bus_backend === "memory"
              ? t("shell.fabricMemory")
              : t("shell.fabricDegraded")
          : status === "connected"
            ? t("shell.live")
            : t("shell.standby");

  const title =
    fabricDegraded && status === "connected"
      ? fabricHealth?.llm_ready === false
        ? t("shell.llmDownHint")
        : fabricHealth?.event_bus_backend === "memory"
          ? t("shell.fabricMemoryHint")
          : t("shell.fabricDegradedHint")
      : attempts > 0
        ? t("shell.reconnectAttempts", { count: attempts })
        : t("shell.connectionTitle");

  return (
    <div
      className="inline-flex items-center gap-2 px-2 py-1 text-xs font-body text-ink-muted"
      title={title}
      role="status"
      aria-live="polite"
    >
      <span
        className={`inline-block h-2 w-2 rounded-sm ${toneFor(status, fabricDegraded)}`}
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}
