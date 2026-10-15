/**
 * Reconnecting WebSocket client for ECC EventStreamer.
 * Default URL: VITE_ECC_WS_URL → ws://localhost:8006/api/v1/ws/events
 */

import { config } from "@/config";
import type { WsServerMessage } from "@/api/types";

export type EccSocketStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

export type EccSocketListener = (message: WsServerMessage) => void;
export type EccSocketStatusListener = (status: EccSocketStatus) => void;

export interface EccSocketClientOptions {
  /** Initial backoff in ms (default 500). */
  minBackoffMs?: number;
  /** Max backoff in ms (default 15000). */
  maxBackoffMs?: number;
  /** Auto-connect on construct (default false). */
  autoConnect?: boolean;
}

export interface EccSocketClient {
  readonly status: EccSocketStatus;
  readonly url: string;
  connect: () => void;
  disconnect: () => void;
  send: (payload: unknown) => void;
  subscribe: (topics: string[]) => void;
  unsubscribe: () => void;
  ping: () => void;
  onMessage: (listener: EccSocketListener) => () => void;
  onStatus: (listener: EccSocketStatusListener) => () => void;
}

function isWsServerMessage(value: unknown): value is WsServerMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === "string" && typeof v.ts === "string";
}

export function createEccSocket(
  url: string = config.wsUrl,
  options: EccSocketClientOptions = {},
): EccSocketClient {
  const minBackoff = options.minBackoffMs ?? 500;
  const maxBackoff = options.maxBackoffMs ?? 15_000;

  let socket: WebSocket | null = null;
  let status: EccSocketStatus = "idle";
  let intentionalClose = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const messageListeners = new Set<EccSocketListener>();
  const statusListeners = new Set<EccSocketStatusListener>();

  const setStatus = (next: EccSocketStatus) => {
    status = next;
    for (const listener of statusListeners) listener(next);
  };

  const clearReconnect = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (intentionalClose) return;
    clearReconnect();
    const delay = Math.min(
      maxBackoff,
      minBackoff * 2 ** Math.min(reconnectAttempt, 6),
    );
    reconnectAttempt += 1;
    setStatus("connecting");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (
      typeof WebSocket === "undefined" ||
      socket?.readyState === WebSocket.OPEN ||
      socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    intentionalClose = false;
    clearReconnect();
    setStatus("connecting");
    const ws = new WebSocket(url);
    socket = ws;

    ws.onopen = () => {
      reconnectAttempt = 0;
      setStatus("open");
    };

    ws.onmessage = (event) => {
      try {
        const parsed: unknown = JSON.parse(String(event.data));
        if (!isWsServerMessage(parsed)) return;
        for (const listener of messageListeners) listener(parsed);
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onerror = () => {
      setStatus("error");
    };

    ws.onclose = () => {
      socket = null;
      if (intentionalClose) {
        setStatus("closed");
        return;
      }
      setStatus("closed");
      scheduleReconnect();
    };
  };

  const disconnect = () => {
    intentionalClose = true;
    clearReconnect();
    if (socket) {
      socket.close();
      socket = null;
    }
    setStatus("closed");
  };

  const send = (payload: unknown) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  };

  const client: EccSocketClient = {
    get status() {
      return status;
    },
    get url() {
      return url;
    },
    connect,
    disconnect,
    send,
    subscribe: (topics) => send({ type: "subscribe", topics }),
    unsubscribe: () => send({ type: "unsubscribe", topics: [] }),
    ping: () => send({ type: "ping", topics: [] }),
    onMessage: (listener) => {
      messageListeners.add(listener);
      return () => {
        messageListeners.delete(listener);
      };
    },
    onStatus: (listener) => {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
  };

  if (options.autoConnect) {
    connect();
  }

  return client;
}
