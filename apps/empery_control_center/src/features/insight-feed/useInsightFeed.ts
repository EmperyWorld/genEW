import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { orchestrationClient } from "../../api/orchestrationClient";
import type {
  AuditLogEntry,
  EccLiveEvent,
  FeedItemDTO,
} from "../../api/types";
import { usePolling } from "../../hooks/usePolling";
import {
  classifyFeedCategory,
  isAuditHookItem,
  shouldShowInInsightFeed,
  stableAuditFeedId,
  type FeedCategory,
} from "./feedFilters";

const RING_CAP = 200;
/** Cap Cursor hook rows even when Audit is ON — avoids infinite wall + scroll thrash. */
const AUDIT_HOOK_HYDRATE_CAP = 30;

export interface UseInsightFeedOptions {
  liveEvents?: EccLiveEvent[];
  /** Locally produced items (e.g. sandbox probes). */
  externalItems?: FeedItemDTO[];
  enablePolling?: boolean;
  pollIntervalMs?: number;
  /** newest at bottom (ops) vs top (feed-focused) */
  newestAtBottom?: boolean;
  /** When true, include Cursor audit_hook events (default OFF). */
  includeAuditHooks?: boolean;
}

export interface UseInsightFeedResult {
  items: FeedItemDTO[];
  ordered: FeedItemDTO[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selected: FeedItemDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  pushItem: (item: FeedItemDTO) => void;
  includeAuditHooks: boolean;
  setIncludeAuditHooks: (v: boolean) => void;
}

function withCategory(item: FeedItemDTO, category: FeedCategory): FeedItemDTO {
  if (item.category === category) return item;
  return { ...item, category };
}

function auditToFeed(entry: AuditLogEntry): FeedItemDTO | null {
  const topic = entry.event ?? "audit.event";
  const raw = entry.raw ?? {};
  const category = classifyFeedCategory(topic, entry.category);
  const summary =
    (entry.summary && entry.summary.trim()) ||
    (typeof raw.context === "string"
      ? raw.context
      : typeof raw.file_path === "string"
        ? raw.file_path
        : topic);

  return {
    id: stableAuditFeedId(entry.timestamp, topic, raw),
    topic,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    summary,
    service_name:
      typeof raw.service_name === "string" ? raw.service_name : undefined,
    correlation_id:
      typeof raw.correlation_id === "string"
        ? raw.correlation_id
        : typeof raw.task_id === "string"
          ? raw.task_id
          : undefined,
    payload: raw,
    category,
  };
}

function liveToFeed(ev: EccLiveEvent): FeedItemDTO | null {
  if (ev.type === "heartbeat" || ev.type === "hello") return null;
  const topic = ev.event_name ?? ev.type;
  const payload = ev.payload ?? {};
  const category = classifyFeedCategory(
    topic,
    typeof payload.category === "string" ? payload.category : undefined,
  );
  const summary =
    typeof payload.summary === "string"
      ? payload.summary
      : typeof payload.message === "string"
        ? payload.message
        : typeof payload.result_summary === "string"
          ? payload.result_summary
          : topic;

  return {
    id: `live-feed-${ev.ts}-${topic}`,
    topic,
    timestamp: ev.ts,
    summary,
    service_name:
      typeof payload.service_name === "string"
        ? payload.service_name
        : undefined,
    correlation_id:
      typeof payload.correlation_id === "string"
        ? payload.correlation_id
        : typeof payload.task_id === "string"
          ? payload.task_id
          : typeof payload.job_id === "string"
            ? payload.job_id
            : undefined,
    payload,
    category,
  };
}

function mergeRing(prev: FeedItemDTO[], incoming: FeedItemDTO[]): FeedItemDTO[] {
  const seen = new Set(prev.map((i) => i.id));
  const next = [...prev];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  if (next.length > RING_CAP) return next.slice(next.length - RING_CAP);
  return next;
}

/** Keep only the newest N audit_hook rows; leave intelligence/system untouched. */
export function capAuditHookItems(
  items: FeedItemDTO[],
  cap: number = AUDIT_HOOK_HYDRATE_CAP,
): FeedItemDTO[] {
  const hooks = items.filter((item) => isAuditHookItem(item));
  if (hooks.length <= cap) return items;
  const keep = new Set(
    [...hooks]
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      )
      .slice(-cap)
      .map((item) => item.id),
  );
  return items.filter((item) => !isAuditHookItem(item) || keep.has(item.id));
}

function acceptForFeed(
  item: FeedItemDTO,
  includeAuditHooks: boolean,
): boolean {
  const category = classifyFeedCategory(item.topic, item.category);
  return shouldShowInInsightFeed(
    item.topic,
    category,
    includeAuditHooks,
    item.summary,
    item.payload,
  );
}

/** Map event topics to likely service nodes for correlation. */
export function correlateServices(item: FeedItemDTO): string[] {
  const topic = item.topic;
  if (item.service_name) return [item.service_name];
  if (topic.startsWith("task.insight")) {
    return ["intelligence_service", "task_orchestrator_service"];
  }
  if (topic.startsWith("task.")) return ["task_orchestrator_service"];
  if (topic.startsWith("identity.") || topic.startsWith("auth.")) {
    return topic.startsWith("auth.")
      ? ["core_auth_service"]
      : ["identity_service"];
  }
  if (topic.startsWith("analytics.")) return ["analytics_service"];
  if (topic.startsWith("ecc.registry")) return ["empery_control_center_api"];
  if (topic.startsWith("ecc.job") || topic.startsWith("orchestration.")) {
    return ["empery_control_center_api"];
  }
  if (topic.startsWith("eic.")) return ["empery_intelligence_core"];
  if (topic.startsWith("sandbox.")) return ["empery_control_center_api"];
  return [];
}

export function useInsightFeed(
  options: UseInsightFeedOptions = {},
): UseInsightFeedResult {
  const {
    liveEvents = [],
    externalItems = [],
    enablePolling = true,
    pollIntervalMs = 8000,
    newestAtBottom = true,
    includeAuditHooks: includeAuditHooksProp,
  } = options;

  const [items, setItems] = useState<FeedItemDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeAuditHooks, setIncludeAuditHooksState] = useState(
    includeAuditHooksProp ?? false,
  );
  const lastLiveKey = useRef("");
  const includeAuditHooksRef = useRef(includeAuditHooks);
  includeAuditHooksRef.current = includeAuditHooks;

  const setIncludeAuditHooks = useCallback((v: boolean) => {
    setIncludeAuditHooksState(v);
    if (!v) {
      // Drop any hooks already in the ring when toggling OFF.
      setItems((prev) => prev.filter((item) => !isAuditHookItem(item)));
    }
  }, []);

  useEffect(() => {
    if (includeAuditHooksProp !== undefined) {
      setIncludeAuditHooksState(includeAuditHooksProp);
      if (!includeAuditHooksProp) {
        setItems((prev) => prev.filter((item) => !isAuditHookItem(item)));
      }
    }
  }, [includeAuditHooksProp]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const allowHooks = includeAuditHooksRef.current;
      const page = await orchestrationClient.getAudit({
        // When hooks are on, still pull a wider window then cap locally.
        limit: allowHooks ? 100 : 40,
        // Defense in depth: do not hydrate Cursor hooks into the feed by default.
        include_hooks: allowHooks,
        ...(allowHooks ? {} : { exclude_category: "audit_hook" }),
      });
      const mapped = page.entries
        .map(auditToFeed)
        .filter((x): x is FeedItemDTO => x != null)
        .filter((x) => acceptForFeed(x, allowHooks));
      setItems((prev) => {
        const kept = allowHooks
          ? prev
          : prev.filter((item) => !isAuditHookItem(item));
        return capAuditHookItems(mergeRing(kept, mapped));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feed load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Always hydrate once; polling is only the offline fallback.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-fetch when audit toggle flips ON so hooks can appear.
  useEffect(() => {
    if (includeAuditHooks) void refresh();
  }, [includeAuditHooks, refresh]);

  usePolling(enablePolling, pollIntervalMs, refresh);

  useEffect(() => {
    if (!liveEvents.length) return;
    const latest = liveEvents[liveEvents.length - 1];
    if (!latest) return;
    const key = `${latest.ts}:${latest.event_name ?? ""}`;
    if (key === lastLiveKey.current) return;
    lastLiveKey.current = key;
    const item = liveToFeed(latest);
    if (!item) return;
    if (!acceptForFeed(item, includeAuditHooksRef.current)) return;
    setItems((prev) => capAuditHookItems(mergeRing(prev, [item])));
  }, [liveEvents]);

  useEffect(() => {
    if (!externalItems.length) return;
    const tagged = externalItems
      .map((item) =>
        withCategory(
          item,
          classifyFeedCategory(item.topic, item.category),
        ),
      )
      .filter((item) => acceptForFeed(item, includeAuditHooksRef.current));
    if (!tagged.length) return;
    setItems((prev) => capAuditHookItems(mergeRing(prev, tagged)));
    setLoading(false);
  }, [externalItems]);

  const pushItem = useCallback((item: FeedItemDTO) => {
    const tagged = withCategory(
      item,
      classifyFeedCategory(item.topic, item.category),
    );
    if (!acceptForFeed(tagged, includeAuditHooksRef.current)) return;
    setItems((prev) => capAuditHookItems(mergeRing(prev, [tagged])));
  }, []);

  const ordered = useMemo(() => {
    const filtered = items.filter((item) => {
      const category = classifyFeedCategory(item.topic, item.category);
      return shouldShowInInsightFeed(
        item.topic,
        category,
        includeAuditHooks,
        item.summary,
        item.payload,
      );
    });
    const sorted = [...filtered].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return newestAtBottom ? sorted : sorted.reverse();
  }, [items, newestAtBottom, includeAuditHooks]);

  const selected = useMemo(
    () => ordered.find((i) => i.id === selectedId) ?? null,
    [ordered, selectedId],
  );

  return {
    items,
    ordered,
    selectedId,
    setSelectedId,
    selected,
    loading,
    error,
    refresh,
    pushItem,
    includeAuditHooks,
    setIncludeAuditHooks,
  };
}
