import { useEccSocket } from "@/hooks/useEccSocket";

/** Mounts Implementer 4 WS client so StatusBeacon / slices receive live frames. */
export function SocketBridge() {
  useEccSocket(true);
  return null;
}
