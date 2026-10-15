import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MarkerType,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type OnNodesChange,
} from "@xyflow/react";
import i18n from "@/i18n";
import { EccApiError } from "../../api/http";
import { healthClient } from "../../api/healthClient";
import { registryClient } from "../../api/registryClient";
import type {
  EccLiveEvent,
  HealthStatus,
  RegistryServiceEntry,
  ServiceNodeDTO,
} from "../../api/types";
import { usePolling } from "../../hooks/usePolling";
import { roleLabelFor } from "../../lib/roleLabels";
import { classifyServiceOrigin } from "../../lib/serviceOrigin";
import { useEccStore } from "@/state/store";
import {
  graphTopologyKey,
  layoutGraph,
  type ConnectionEdgeData,
  type ServiceNodeData,
} from "./layoutGraph";

const POSITION_STORAGE_KEY = "ecc.ecosystem-map.positions";

type NodePositions = Record<string, { x: number; y: number }>;

function loadStoredPositions(): NodePositions {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: NodePositions = {};
    for (const [id, pos] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        pos &&
        typeof pos === "object" &&
        typeof (pos as { x?: unknown }).x === "number" &&
        typeof (pos as { y?: unknown }).y === "number"
      ) {
        out[id] = { x: (pos as { x: number }).x, y: (pos as { y: number }).y };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persistPositions(positions: NodePositions): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    /* quota / private mode */
  }
}

export interface UseEcosystemGraphOptions {
  /** Poll interval when live events are not wired (default 15s). */
  pollIntervalMs?: number;
  /** Disable REST polling (e.g. when parent owns WS). */
  enablePolling?: boolean;
  /** Optional live events from shell / Implementer 4 hook. */
  liveEvents?: EccLiveEvent[];
  /** Highlight node ids (e.g. from feed correlation). */
  highlightIds?: string[];
  /** Edge pairs with recent activity (may create dashed activity edges). */
  trafficPairs?: Array<{ source: string; target: string }>;
}

export interface UseEcosystemGraphResult {
  nodes: Node<ServiceNodeData>[];
  edges: Edge[];
  services: ServiceNodeDTO[];
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  errorCode?: string;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  showUnhealthyOnly: boolean;
  setShowUnhealthyOnly: (v: boolean) => void;
  refresh: (forceServer?: boolean) => Promise<void>;
  applyOptimisticRegister: (entry: RegistryServiceEntry) => void;
  onNodesChange: OnNodesChange;
  resetLayout: () => void;
}

function toNodeDTO(
  entry: RegistryServiceEntry,
  healthMap: Map<string, HealthStatus>,
): ServiceNodeDTO {
  const features = entry.features ?? [];
  return {
    manifest: {
      name: entry.name,
      version: entry.version,
      features,
      entry_point: entry.entry_point,
      dependencies: entry.dependencies ?? [],
      publishes: entry.publishes ?? [],
      subscribes: entry.subscribes ?? [],
    },
    health: healthMap.get(entry.name) ?? "unknown",
    role_label: roleLabelFor(entry.name),
    origin: classifyServiceOrigin(entry.name, features),
  };
}

function activityEdge(source: string, target: string): Edge {
  return {
    id: `act:${source}->${target}`,
    source,
    target,
    type: "connection",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: "var(--ecc-busy)",
    },
    data: {
      traffic: true,
      kind: "activity",
    } satisfies ConnectionEdgeData,
  };
}

function buildEdges(
  laidEdges: Edge[],
  visible: ServiceNodeDTO[],
  selectedId: string | null,
  trafficPairs: Array<{ source: string; target: string }>,
): Edge[] {
  const nameSet = new Set(visible.map((s) => s.manifest.name));
  const edgeIds = new Set(laidEdges.map((e) => e.id));
  const traffic = new Set(
    trafficPairs.map((p) => `${p.source}->${p.target}`),
  );
  const pairKey = (source: string, target: string) => `${source}->${target}`;

  const edgesOut: Edge[] = laidEdges.map((e) => {
    const related =
      selectedId != null &&
      (e.source === selectedId || e.target === selectedId);
    const pair = pairKey(e.source, e.target);
    return {
      ...e,
      selected: Boolean(related),
      data: {
        ...(e.data ?? {}),
        traffic: traffic.has(pair),
        dimmed: Boolean(selectedId) && !related,
      } satisfies ConnectionEdgeData,
    };
  });

  for (const pair of trafficPairs) {
    if (!nameSet.has(pair.source) || !nameSet.has(pair.target)) continue;
    const key = pairKey(pair.source, pair.target);
    if (
      edgeIds.has(`dep:${key}`) ||
      edgeIds.has(`evt:${key}`) ||
      edgeIds.has(`act:${key}`)
    ) {
      continue;
    }
    const related =
      selectedId != null &&
      (pair.source === selectedId || pair.target === selectedId);
    edgesOut.push({
      ...activityEdge(pair.source, pair.target),
      id: `act:${key}`,
      selected: Boolean(related),
      data: {
        traffic: true,
        kind: "activity",
        dimmed: Boolean(selectedId) && !related,
      } satisfies ConnectionEdgeData,
    });
    edgeIds.add(`act:${key}`);
  }

  return edgesOut;
}

export function useEcosystemGraph(
  options: UseEcosystemGraphOptions = {},
): UseEcosystemGraphResult {
  const {
    pollIntervalMs = 15_000,
    enablePolling = true,
    liveEvents = [],
    highlightIds = [],
    trafficPairs = [],
  } = options;

  const [services, setServices] = useState<ServiceNodeDTO[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUnhealthyOnly, setShowUnhealthyOnly] = useState(false);
  const [nodes, setNodes] = useState<Node<ServiceNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  /** Bumped only to re-run the graph sync effect (e.g. Reset layout). */
  const [layoutNonce, setLayoutNonce] = useState(0);

  const healthMapRef = useRef<Map<string, HealthStatus>>(new Map());
  const lastLiveKeyRef = useRef<string>("");
  const draggedPositionsRef = useRef<NodePositions>(loadStoredPositions());
  const topologyKeyRef = useRef<string>("");
  const forceRelayoutRef = useRef(false);

  const load = useCallback(async (forceServer = false) => {
    try {
      setError(null);
      setErrorCode(undefined);
      const snap = forceServer
        ? await registryClient.refresh()
        : await registryClient.getSnapshot();

      try {
        const batch = await healthClient.getServiceHealth();
        healthMapRef.current = new Map(
          batch.services.map((s) => [s.name, s.health] as const),
        );
      } catch {
        /* optional endpoint */
      }

      const nodesDto = snap.snapshot.services.map((e) =>
        toNodeDTO(e, healthMapRef.current),
      );
      setServices(nodesDto);
      setGeneratedAt(snap.snapshot.generated_at);
      // Keep Zustand registry in sync for other surfaces (sandbox, WS deltas).
      useEccStore.getState().setRegistry(nodesDto, snap.snapshot.generated_at);
    } catch (err) {
      if (err instanceof EccApiError) {
        setError(err.message);
        setErrorCode(err.errorCode);
      } else {
        setError(
          err instanceof Error ? err.message : i18n.t("map.loadFailed"),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Always fetch once on mount. CommandLayout disables polling when WS is Live,
  // but registry snapshot is not pushed on connect — without this the map stays
  // at 0 services with loading=true (Refresh stuck disabled).
  useEffect(() => {
    void load(false);
  }, [load]);

  usePolling(enablePolling, pollIntervalMs, () => load(false));

  // Apply WS-driven registry updates written into the store by SocketBridge.
  // Full / names-only frames REPLACE the set — prune ghosts left by add-only paths.
  const storeServices = useEccStore((s) => s.services);
  const storeGeneratedAt = useEccStore((s) => s.generatedAt);
  useEffect(() => {
    if (storeServices.length === 0) return;
    setServices((prev) => {
      const enriched = storeServices.map((n) => {
        const existing = prev.find((p) => p.manifest.name === n.manifest.name);
        const stub =
          n.manifest.version === "unknown" || n.manifest.entry_point === "";
        const base =
          stub && existing
            ? {
                ...existing,
                health:
                  n.health !== "unknown" ? n.health : existing.health,
              }
            : n;
        return {
          ...base,
          origin:
            base.origin ??
            classifyServiceOrigin(base.manifest.name, base.manifest.features),
        };
      });
      const keep = new Set(enriched.map((n) => n.manifest.name));
      for (const id of Object.keys(draggedPositionsRef.current)) {
        if (!keep.has(id)) delete draggedPositionsRef.current[id];
      }
      persistPositions(draggedPositionsRef.current);
      return enriched;
    });
    if (storeGeneratedAt) setGeneratedAt(storeGeneratedAt);
    setLoading(false);
  }, [storeServices, storeGeneratedAt]);

  useEffect(() => {
    if (!liveEvents.length) return;
    const latest = liveEvents[liveEvents.length - 1];
    if (!latest) return;
    const key = `${latest.ts}:${latest.event_name ?? ""}:${latest.type}`;
    if (key === lastLiveKeyRef.current) return;
    lastLiveKeyRef.current = key;

    if (
      latest.event_name === "registry.service.unregistered" ||
      latest.event_name === "ecc.registry.service.unregistered"
    ) {
      const payload = latest.payload ?? {};
      const name =
        typeof payload.name === "string"
          ? payload.name
          : typeof payload.service_name === "string"
            ? payload.service_name
            : null;
      if (name) {
        setServices((prev) => prev.filter((s) => s.manifest.name !== name));
        useEccStore.getState().removeService(name);
        delete draggedPositionsRef.current[name];
        persistPositions(draggedPositionsRef.current);
        if (selectedId === name) setSelectedId(null);
      } else {
        void load(true);
      }
      return;
    }

    if (
      latest.type === "registry" ||
      latest.event_name === "ecc.registry.refreshed" ||
      latest.event_name === "registry.service.registered"
    ) {
      const payload = latest.payload ?? {};
      if (
        latest.event_name === "registry.service.registered" &&
        typeof payload.name === "string"
      ) {
        const entry: RegistryServiceEntry = {
          name: payload.name,
          version: String(payload.version ?? "0.0.0"),
          features: Array.isArray(payload.features)
            ? (payload.features as string[])
            : [],
          entry_point: String(payload.entry_point ?? ""),
          dependencies: Array.isArray(payload.dependencies)
            ? (payload.dependencies as string[])
            : [],
          publishes: Array.isArray(payload.publishes)
            ? (payload.publishes as string[])
            : [],
          subscribes: Array.isArray(payload.subscribes)
            ? (payload.subscribes as string[])
            : [],
        };
        setServices((prev) => {
          if (prev.some((s) => s.manifest.name === entry.name)) return prev;
          return [...prev, toNodeDTO(entry, healthMapRef.current)];
        });
      } else {
        void load(false);
      }
    }

    if (latest.event_name === "health.updated" && latest.payload) {
      const name = latest.payload.name;
      const health = latest.payload.health;
      if (typeof name === "string" && typeof health === "string") {
        healthMapRef.current.set(name, health as HealthStatus);
        setServices((prev) =>
          prev.map((s) =>
            s.manifest.name === name
              ? { ...s, health: health as HealthStatus }
              : s,
          ),
        );
      }
    }
  }, [liveEvents, load, selectedId]);

  const applyOptimisticRegister = useCallback((entry: RegistryServiceEntry) => {
    setServices((prev) => {
      if (prev.some((s) => s.manifest.name === entry.name)) return prev;
      return [...prev, toNodeDTO(entry, healthMapRef.current)];
    });
  }, []);

  const visible = useMemo(() => {
    if (!showUnhealthyOnly) return services;
    return services.filter((s) => s.health !== "ok");
  }, [services, showUnhealthyOnly]);

  // Sync React Flow nodes/edges: full auto-layout only when topology changes
  // (or reset). Health / highlight / selection polls patch data in place.
  useEffect(() => {
    const topoKey = graphTopologyKey(visible);
    const shouldRelayout =
      forceRelayoutRef.current || topoKey !== topologyKeyRef.current;
    forceRelayoutRef.current = false;
    topologyKeyRef.current = topoKey;

    const laid = layoutGraph(visible);
    const highlight = new Set(highlightIds);

    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n] as const));
      // Topology change (incl. platform/Hands bands) must drop stored drag
      // positions — otherwise sessionStorage freezes the old single-band layout.
      if (shouldRelayout) {
        draggedPositionsRef.current = {};
        persistPositions({});
      }
      const dragged = draggedPositionsRef.current;
      return laid.nodes.map((n) => {
        const prevNode = prevById.get(n.id);
        let position = n.position;
        if (!shouldRelayout && dragged[n.id]) {
          position = dragged[n.id]!;
        } else if (!shouldRelayout && prevNode) {
          position = prevNode.position;
        }
        return {
          ...n,
          position,
          data: {
            ...n.data,
            highlighted: highlight.has(n.id),
          },
          selected: selectedId === n.id,
        };
      });
    });

    setEdges(buildEdges(laid.edges, visible, selectedId, trafficPairs));
  }, [visible, highlightIds, trafficPairs, selectedId, layoutNonce]);

  const onNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(
      (nds) => applyNodeChanges(changes, nds) as Node<ServiceNodeData>[],
    );
    let touched = false;
    for (const ch of changes) {
      if (ch.type !== "position" || !ch.position) continue;
      // Persist when drag ends (dragging === false) or for non-drag moves.
      if (ch.dragging === true) continue;
      draggedPositionsRef.current[ch.id] = {
        x: ch.position.x,
        y: ch.position.y,
      };
      touched = true;
    }
    if (touched) persistPositions(draggedPositionsRef.current);
  }, []);

  const resetLayout = useCallback(() => {
    draggedPositionsRef.current = {};
    persistPositions({});
    forceRelayoutRef.current = true;
    setLayoutNonce((n) => n + 1);
  }, []);

  return {
    nodes,
    edges,
    services,
    generatedAt,
    loading,
    error,
    errorCode,
    selectedId,
    setSelectedId,
    showUnhealthyOnly,
    setShowUnhealthyOnly,
    refresh: load,
    applyOptimisticRegister,
    onNodesChange,
    resetLayout,
  };
}
