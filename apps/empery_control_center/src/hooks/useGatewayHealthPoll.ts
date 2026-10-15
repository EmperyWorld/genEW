import { useCallback } from "react";
import { healthClient } from "@/api/healthClient";
import { usePolling } from "@/hooks/usePolling";
import { useEccStore } from "@/state/store";

/** Single app-wide interval — mount only from HealthBootstrap. */
const DEFAULT_POLL_MS = 15_000;

/** Poll ECC /health for fabric snapshot and auth_required gate. */
export function useGatewayHealthPoll(
  enabled: boolean,
  intervalMs: number = DEFAULT_POLL_MS,
) {
  const setFabricHealth = useEccStore((s) => s.setFabricHealth);
  const setAuthRequired = useEccStore((s) => s.setAuthRequired);

  const poll = useCallback(async () => {
    const health = await healthClient.getGatewayHealth();
    setFabricHealth({
      event_bus_backend: health.event_bus_backend ?? "unknown",
      event_bus_ok: health.event_bus_ok ?? false,
      redis_configured: health.redis_configured ?? false,
      llm_ready: health.llm_ready ?? null,
      checked_at: new Date().toISOString(),
    });
    setAuthRequired(health.auth_required ?? false);
  }, [setFabricHealth, setAuthRequired]);

  usePolling(enabled, intervalMs, poll);
}
