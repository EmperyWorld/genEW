/**
 * React hook: connect ECC WebSocket and dispatch frames into Zustand slices.
 * StatusBeacon reads connectionStatus from the connection slice.
 */

import { useEffect, useRef } from "react";
import { config } from "@/config";
import { createEccSocket, type EccSocketClient } from "@/api/ws";
import type {
  ConsoleLineDTO,
  FeedItemDTO,
  ServiceNodeDTO,
  WsConnectionStatus,
  WsServerMessage,
} from "@/api/types";
import { useEccStore } from "@/state/store";
import { preferVerifySummary } from "@/features/autonomous/autonomousJobDisplay";
import i18n from "@/i18n";
import { roleLabelFor } from "@/lib/roleLabels";
import { classifyServiceOrigin } from "@/lib/serviceOrigin";

function enrichNode(node: ServiceNodeDTO): ServiceNodeDTO {
  const features = node.manifest.features ?? [];
  return {
    ...node,
    role_label: node.role_label ?? roleLabelFor(node.manifest.name),
    origin:
      node.origin ?? classifyServiceOrigin(node.manifest.name, features),
  };
}

function mapSocketStatus(
  status: EccSocketClient["status"],
  reconnecting: boolean,
): WsConnectionStatus {
  if (status === "open") return "connected";
  if (status === "connecting" || reconnecting) return "reconnecting";
  if (status === "idle") return "idle";
  return "offline";
}

function feedFromEvent(message: WsServerMessage): FeedItemDTO {
  const topic = message.event_name ?? message.type;
  const payload = message.payload ?? {};
  const summary =
    typeof payload.summary === "string"
      ? payload.summary
      : typeof payload.result_summary === "string"
        ? payload.result_summary
        : typeof payload.message === "string"
          ? payload.message
          : topic;
  const serviceName =
    typeof payload.service_name === "string"
      ? payload.service_name
      : undefined;
  const correlationId =
    typeof payload.correlation_id === "string"
      ? payload.correlation_id
      : typeof payload.task_id === "string"
        ? payload.task_id
        : typeof payload.job_id === "string"
          ? payload.job_id
          : undefined;

  return {
    id: `${message.ts}:${topic}:${Math.random().toString(36).slice(2, 8)}`,
    topic,
    timestamp: message.ts,
    summary,
    service_name: serviceName,
    correlation_id: correlationId,
    payload,
  };
}

function consoleFromEvent(message: WsServerMessage): ConsoleLineDTO {
  const topic = message.event_name ?? message.type;
  const payload = message.payload ?? {};
  const level =
    message.type === "error"
      ? "error"
      : topic.includes("failed") || topic.includes("error")
        ? "error"
        : topic.startsWith("ecc.job") ||
            topic.startsWith("eic.job") ||
            topic.startsWith("eic.intention") ||
            topic.startsWith("eic.loop") ||
            topic.startsWith("eic.assembler") ||
            topic.includes("insight")
          ? "thought"
          : "info";
  const detail = (() => {
    const raw =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.result_summary === "string"
          ? payload.result_summary
          : typeof payload.error_message === "string"
            ? payload.error_message
            : typeof payload.summary === "string"
              ? payload.summary
              : typeof payload.to_stage === "string"
                ? `${topic} → ${payload.to_stage}`
                : typeof payload.stage === "string"
                  ? `${topic} @ ${payload.stage}`
                  : typeof payload.status === "string"
                    ? `${topic} (${payload.status})`
                    : topic;
    const verify =
      typeof payload.verify_status === "string" ? payload.verify_status : null;
    return preferVerifySummary(raw, verify);
  })();
  return {
    id: `c:${message.ts}:${topic}:${Math.random().toString(36).slice(2, 8)}`,
    timestamp: message.ts,
    level,
    message: detail,
    source: topic.split(".")[0],
    service_name:
      typeof payload.service_name === "string"
        ? payload.service_name
        : undefined,
    correlation_id:
      typeof payload.correlation_id === "string"
        ? payload.correlation_id
        : typeof payload.job_id === "string"
          ? payload.job_id
          : typeof payload.intention_id === "string"
            ? payload.intention_id
            : undefined,
  };
}

function applyRegistryFrame(message: WsServerMessage): void {
  const store = useEccStore.getState();
  const payload = message.payload ?? {};
  const generatedAt =
    typeof payload.generated_at === "string"
      ? payload.generated_at
      : message.ts;

  // Full snapshot path (if gateway embeds services[])
  if (Array.isArray(payload.services)) {
    const nodes: ServiceNodeDTO[] = (payload.services as unknown[]).map(
      (entry: unknown) => {
      if (entry && typeof entry === "object" && "manifest" in entry) {
        return enrichNode(entry as ServiceNodeDTO);
      }
      const e = (entry ?? {}) as {
        name?: string;
        version?: string;
        features?: string[];
        entry_point?: string;
        dependencies?: string[];
        publishes?: string[];
        subscribes?: string[];
      };
      const features = Array.isArray(e.features) ? e.features : [];
      const name = String(e.name ?? "unknown");
      return enrichNode({
        manifest: {
          name,
          version: String(e.version ?? "0.0.0"),
          features,
          entry_point: String(e.entry_point ?? ""),
          dependencies: Array.isArray(e.dependencies) ? e.dependencies : [],
          publishes: Array.isArray(e.publishes) ? e.publishes : [],
          subscribes: Array.isArray(e.subscribes) ? e.subscribes : [],
        },
        health: "unknown",
      });
    },
    );
    store.setRegistry(nodes, generatedAt);
    return;
  }

  // Names-only delta from ecc.registry.refreshed
  const names = Array.isArray(payload.service_names)
    ? (payload.service_names as unknown[]).filter(
        (n): n is string => typeof n === "string",
      )
    : [];
  if (names.length === 0) {
    store.appendConsoleLine(consoleFromEvent(message));
    store.appendFeedItem(feedFromEvent(message));
    return;
  }

  const existing = new Map(
    store.services.map((n) => [n.manifest.name, n] as const),
  );
  const next: ServiceNodeDTO[] = names.map((name) => {
    const prev = existing.get(name);
    if (prev) return enrichNode(prev);
    return enrichNode({
      manifest: {
        name,
        version: "unknown",
        features: [],
        entry_point: "",
        dependencies: [],
        publishes: [],
        subscribes: [],
      },
      health: "unknown",
    });
  });
  store.setRegistry(next, generatedAt);
  store.appendConsoleLine({
    ...consoleFromEvent(message),
    message: i18n.t("shell.registryRefreshed", { count: names.length }),
  });
  store.appendFeedItem(feedFromEvent(message));
}

function dispatchWsMessage(message: WsServerMessage): void {
  const store = useEccStore.getState();

  switch (message.type) {
    case "hello":
      store.appendConsoleLine({
        id: `hello:${message.ts}`,
        timestamp: message.ts,
        level: "info",
        message: i18n.t("shell.eventStreamConnected"),
      });
      break;
    case "heartbeat":
      store.setLastPingAt(message.ts);
      break;
    case "registry":
      applyRegistryFrame(message);
      break;
    case "event":
      store.appendFeedItem(feedFromEvent(message));
      store.appendConsoleLine(consoleFromEvent(message));
      break;
    case "error":
      store.appendConsoleLine({
        ...consoleFromEvent(message),
        level: "error",
        message:
          typeof message.payload?.message === "string"
            ? message.payload.message
            : "WebSocket error frame",
      });
      break;
    default:
      store.appendFeedItem(feedFromEvent(message));
      break;
  }
}

export interface UseEccSocketResult {
  client: EccSocketClient | null;
  status: WsConnectionStatus;
}

export function useEccSocket(enabled = true): UseEccSocketResult {
  const clientRef = useRef<EccSocketClient | null>(null);
  const status = useEccStore((s) => s.connectionStatus);

  useEffect(() => {
    if (!enabled) return;

    const store = useEccStore.getState();
    const client = createEccSocket(config.wsUrl);
    clientRef.current = client;

    const unsubMsg = client.onMessage(dispatchWsMessage);
    const unsubStatus = client.onStatus((socketStatus) => {
      const reconnecting =
        socketStatus === "connecting" && store.reconnectAttempts > 0;
      if (socketStatus === "connecting" && store.connectionStatus !== "idle") {
        store.bumpReconnectAttempts();
      }
      if (socketStatus === "open") {
        store.resetReconnectAttempts();
      }
      store.setConnectionStatus(
        mapSocketStatus(socketStatus, reconnecting || socketStatus === "connecting"),
      );
    });

    store.setConnectionStatus("reconnecting");
    client.connect();

    return () => {
      unsubMsg();
      unsubStatus();
      client.disconnect();
      clientRef.current = null;
      useEccStore.getState().setConnectionStatus("offline");
    };
  }, [enabled]);

  return { client: clientRef.current, status };
}
