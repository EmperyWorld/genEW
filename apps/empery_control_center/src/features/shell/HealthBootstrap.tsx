import { useGatewayHealthPoll } from "@/hooks/useGatewayHealthPoll";

/**
 * Sole owner of REST /health polling (fabric + auth_required).
 * StatusBeacon / Ops strip / Health page read Zustand — do not mount extra pollers.
 */
export function HealthBootstrap() {
  useGatewayHealthPoll(true);
  return null;
}
