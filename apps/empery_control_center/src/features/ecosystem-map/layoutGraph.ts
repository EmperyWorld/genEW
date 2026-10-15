import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { ServiceNodeDTO } from "../../api/types";
import { classifyServiceOrigin } from "../../lib/serviceOrigin";

export interface LayoutOptions {
  columnWidth?: number;
  rowHeight?: number;
  originX?: number;
  originY?: number;
  /** Vertical gap between platform band and Hands band. */
  bandGap?: number;
}

export interface ServiceNodeData extends Record<string, unknown> {
  service: ServiceNodeDTO;
  highlighted?: boolean;
  traffic?: boolean;
}

export type ConnectionEdgeKind = "dependency" | "event" | "activity";

export interface ConnectionEdgeData extends Record<string, unknown> {
  traffic?: boolean;
  dimmed?: boolean;
  kind?: ConnectionEdgeKind;
  /** Shared EventBus topics for event edges (publisher → subscriber). */
  topics?: string[];
}

function originOf(s: ServiceNodeDTO) {
  return s.origin ?? classifyServiceOrigin(s.manifest.name, s.manifest.features);
}

function publishesOf(s: ServiceNodeDTO): string[] {
  return s.manifest.publishes ?? [];
}

function subscribesOf(s: ServiceNodeDTO): string[] {
  return s.manifest.subscribes ?? [];
}

/**
 * Build publisher→subscriber pairs from matching EventBus topics.
 * Aggregates topics per pair; skips self-loops.
 */
export function eventFlowPairs(
  services: ServiceNodeDTO[],
): Array<{ source: string; target: string; topics: string[] }> {
  const names = new Set(services.map((s) => s.manifest.name));
  const publishers = new Map<string, string[]>();
  const subscribers = new Map<string, string[]>();

  for (const s of services) {
    const name = s.manifest.name;
    for (const topic of publishesOf(s)) {
      const list = publishers.get(topic) ?? [];
      list.push(name);
      publishers.set(topic, list);
    }
    for (const topic of subscribesOf(s)) {
      const list = subscribers.get(topic) ?? [];
      list.push(name);
      subscribers.set(topic, list);
    }
  }

  const aggregated = new Map<string, string[]>();
  for (const [topic, pubs] of publishers) {
    const subs = subscribers.get(topic);
    if (!subs?.length) continue;
    for (const source of pubs) {
      if (!names.has(source)) continue;
      for (const target of subs) {
        if (!names.has(target) || source === target) continue;
        const key = `${source}\0${target}`;
        const topics = aggregated.get(key) ?? [];
        if (!topics.includes(topic)) topics.push(topic);
        aggregated.set(key, topics);
      }
    }
  }

  return [...aggregated.entries()]
    .map(([key, topics]) => {
      const [source, target] = key.split("\0");
      return { source: source!, target: target!, topics: topics.sort() };
    })
    .sort((a, b) =>
      `${a.source}->${a.target}`.localeCompare(`${b.source}->${b.target}`),
    );
}

/**
 * Stable fingerprint of node set + hard-dep / event-flow topology.
 * Health / selection / traffic must NOT change this key — otherwise drag
 * positions get wiped on every registry/health poll.
 */
export function graphTopologyKey(services: ServiceNodeDTO[]): string {
  const names = services.map((s) => s.manifest.name).sort();
  const nameSet = new Set(names);
  const origins = services
    .map(
      (s) =>
        `${s.manifest.name}:${s.origin ?? classifyServiceOrigin(s.manifest.name, s.manifest.features)}`,
    )
    .sort();
  const deps: string[] = [];
  for (const s of services) {
    for (const dep of s.manifest.dependencies) {
      if (!nameSet.has(dep)) continue;
      deps.push(`${dep}->${s.manifest.name}`);
    }
  }
  deps.sort();
  const events = eventFlowPairs(services).map(
    (p) => `${p.source}->${p.target}`,
  );
  return `${names.join(",")}|ori:${origins.join(",")}|dep:${deps.join(",")}|evt:${events.join(",")}`;
}

/**
 * Deterministic layered layout from hard dependencies only.
 * Event pub/sub edges are drawn separately — they often form cycles (ECC↔EIC)
 * and must not drive layering (that previously froze the UI / pushed nodes
 * thousands of px off-screen).
 *
 * Platform (seed/spine) and Hands capsules are laid out in separate vertical
 * bands so the map does not mash everything into one visual field.
 */
export function layoutGraph(
  services: ServiceNodeDTO[],
  options: LayoutOptions = {},
): { nodes: Node<ServiceNodeData>[]; edges: Edge[] } {
  // Slightly larger spacing for RU role labels / longer chrome.
  const columnWidth = options.columnWidth ?? 300;
  const rowHeight = options.rowHeight ?? 128;
  const originX = options.originX ?? 48;
  const originY = options.originY ?? 48;
  const bandGap = options.bandGap ?? 96;

  const platform = services.filter((s) => originOf(s) === "platform");
  const hands = services.filter((s) => originOf(s) !== "platform");

  const platformPos = layoutBand(platform, {
    columnWidth,
    rowHeight,
    originX,
    originY,
  });
  let platformMaxY = originY;
  for (const pos of platformPos.values()) {
    platformMaxY = Math.max(platformMaxY, pos.y + rowHeight);
  }
  const handsOriginY =
    platform.length > 0 ? platformMaxY + bandGap : originY;
  const handsPos = layoutBand(hands, {
    columnWidth,
    rowHeight,
    originX,
    originY: handsOriginY,
  });

  const position = new Map<string, { x: number; y: number }>([
    ...platformPos,
    ...handsPos,
  ]);

  const names = new Set(services.map((s) => s.manifest.name));

  const nodes: Node<ServiceNodeData>[] = services.map((service) => {
    const id = service.manifest.name;
    const pos = position.get(id) ?? { x: originX, y: originY };
    const withOrigin: ServiceNodeDTO = {
      ...service,
      origin: originOf(service),
    };
    return {
      id,
      type: "service",
      position: pos,
      data: { service: withOrigin },
    };
  });

  const edges: Edge[] = [];
  for (const s of services) {
    for (const dep of s.manifest.dependencies) {
      if (!names.has(dep)) continue;
      edges.push({
        id: `dep:${dep}->${s.manifest.name}`,
        source: dep,
        target: s.manifest.name,
        type: "connection",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: "var(--ecc-line-strong)",
        },
        data: {
          traffic: false,
          kind: "dependency",
        } satisfies ConnectionEdgeData,
      });
    }
  }

  for (const pair of eventFlowPairs(services)) {
    edges.push({
      id: `evt:${pair.source}->${pair.target}`,
      source: pair.source,
      target: pair.target,
      type: "connection",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: "var(--ecc-metal)",
      },
      data: {
        traffic: false,
        kind: "event",
        topics: pair.topics,
      } satisfies ConnectionEdgeData,
    });
  }

  return { nodes, edges };
}

/** Longest-path layering for one origin band (platform or Hands). */
function layoutBand(
  services: ServiceNodeDTO[],
  opts: {
    columnWidth: number;
    rowHeight: number;
    originX: number;
    originY: number;
  },
): Map<string, { x: number; y: number }> {
  const { columnWidth, rowHeight, originX, originY } = opts;
  const position = new Map<string, { x: number; y: number }>();
  if (services.length === 0) return position;

  const names = new Set(services.map((s) => s.manifest.name));
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  const layoutLinks = new Set<string>();

  for (const s of services) {
    indegree.set(s.manifest.name, 0);
    children.set(s.manifest.name, []);
  }

  const addLink = (from: string, to: string) => {
    if (!names.has(from) || !names.has(to) || from === to) return;
    const key = `${from}\0${to}`;
    if (layoutLinks.has(key)) return;
    layoutLinks.add(key);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
    children.get(from)?.push(to);
  };

  for (const s of services) {
    for (const dep of s.manifest.dependencies) {
      addLink(dep, s.manifest.name);
    }
  }

  const layer = new Map<string, number>();
  const maxLayer = Math.max(0, services.length - 1);
  const queue = services
    .filter((s) => (indegree.get(s.manifest.name) ?? 0) === 0)
    .map((s) => s.manifest.name)
    .sort();

  for (const root of queue) layer.set(root, 0);

  const visiting = [...queue];
  while (visiting.length) {
    const cur = visiting.shift()!;
    const curLayer = layer.get(cur) ?? 0;
    for (const child of (children.get(cur) ?? []).slice().sort()) {
      const next = Math.min(curLayer + 1, maxLayer);
      if ((layer.get(child) ?? -1) < next) {
        layer.set(child, next);
        visiting.push(child);
      }
    }
  }

  for (const s of services) {
    if (!layer.has(s.manifest.name)) layer.set(s.manifest.name, 0);
  }

  const byLayer = new Map<number, string[]>();
  for (const [name, l] of layer) {
    const list = byLayer.get(l) ?? [];
    list.push(name);
    byLayer.set(l, list);
  }
  for (const list of byLayer.values()) {
    list.sort();
  }

  const maxRows = Math.max(1, ...[...byLayer.values()].map((l) => l.length));
  for (const [l, list] of byLayer) {
    const offsetY = ((maxRows - list.length) * rowHeight) / 2;
    list.forEach((name, idx) => {
      position.set(name, {
        x: originX + l * columnWidth,
        y: originY + offsetY + idx * rowHeight,
      });
    });
  }
  return position;
}
