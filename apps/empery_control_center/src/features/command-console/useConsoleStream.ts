import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { orchestrationClient } from "../../api/orchestrationClient";
import type {
  AuditLogEntry,
  ConsoleLevel,
  ConsoleLineDTO,
  EccLiveEvent,
} from "../../api/types";
import { preferVerifySummary } from "../autonomous/autonomousJobDisplay";
import { usePolling } from "../../hooks/usePolling";
import { isAuditHookItem, isAuditHookTopic } from "../insight-feed/feedFilters";

const RING_CAP = 2000;

export interface UseConsoleStreamOptions {
  /** External lines (e.g. wizard narration). */
  externalLines?: ConsoleLineDTO[];
  liveEvents?: EccLiveEvent[];
  enableAuditPolling?: boolean;
  pollIntervalMs?: number;
}

export interface UseConsoleStreamResult {
  lines: ConsoleLineDTO[];
  filterLevel: ConsoleLevel | "all";
  setFilterLevel: (v: ConsoleLevel | "all") => void;
  filterSource: string;
  setFilterSource: (v: string) => void;
  stickToBottom: boolean;
  setStickToBottom: (v: boolean) => void;
  appendLine: (line: Omit<ConsoleLineDTO, "id"> & { id?: string }) => void;
  clear: () => void;
  filtered: ConsoleLineDTO[];
}

function auditToLine(entry: AuditLogEntry, index: number): ConsoleLineDTO | null {
  const topic = entry.event ?? "audit";
  // Command Console never shows Cursor IDE hooks (Insight Feed Audit toggle owns that).
  if (
    entry.category === "audit_hook" ||
    isAuditHookTopic(topic) ||
    isAuditHookItem({
      topic,
      category: entry.category,
      summary: entry.summary,
      payload: entry.raw,
    })
  ) {
    return null;
  }
  const level: ConsoleLevel =
    topic.includes("fail") || topic.includes("error")
      ? "error"
      : topic.includes("warn")
        ? "warn"
        : topic.startsWith("ecc.job") ||
            topic.startsWith("eic.job") ||
            topic.startsWith("eic.intention") ||
            topic.startsWith("eic.loop") ||
            topic.includes("orchestr")
          ? "thought"
          : "info";
  return {
    id: `audit-${entry.timestamp ?? "t"}-${index}-${topic}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    level,
    source: topic.split(".")[0],
    message: entry.summary ?? topic,
    payload: entry.raw,
  };
}

function eventToLine(ev: EccLiveEvent): ConsoleLineDTO | null {
  if (ev.type === "heartbeat" || ev.type === "hello") return null;
  const name = ev.event_name ?? ev.type;
  const payload = ev.payload ?? {};
  if (
    isAuditHookItem({
      topic: name ?? "",
      category:
        typeof payload.category === "string" ? payload.category : undefined,
      summary:
        typeof payload.summary === "string" ? payload.summary : undefined,
      payload,
    })
  ) {
    return null;
  }
  let level: ConsoleLevel = "info";
  if (ev.type === "error" || name?.includes("failed")) level = "error";
  else if (
    name?.startsWith("ecc.job") ||
    name?.startsWith("eic.job") ||
    name?.startsWith("eic.intention") ||
    name?.startsWith("eic.loop") ||
    name?.includes("orchestr")
  )
    level = "thought";
  else if (ev.type === "console") level = "thought";

  const message = (() => {
    const raw =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.result_summary === "string"
          ? payload.result_summary
          : typeof payload.error_message === "string"
            ? payload.error_message
            : typeof payload.to_stage === "string"
              ? `${name} → ${payload.to_stage}`
              : name ?? "event";
    const verify =
      typeof payload.verify_status === "string"
        ? payload.verify_status
        : typeof payload.metadata === "object" &&
            payload.metadata !== null &&
            typeof (payload.metadata as Record<string, unknown>).verify_status ===
              "string"
          ? String(
              (payload.metadata as Record<string, unknown>).verify_status,
            )
          : null;
    return preferVerifySummary(raw, verify);
  })();

  return {
    id: `live-${ev.ts}-${name}`,
    timestamp: ev.ts,
    level,
    source: name?.split(".")[0],
    message,
    payload,
  };
}

function pushRing(
  prev: ConsoleLineDTO[],
  next: ConsoleLineDTO[],
): ConsoleLineDTO[] {
  const seen = new Set(prev.map((l) => l.id));
  const merged = [...prev];
  for (const line of next) {
    if (seen.has(line.id)) continue;
    seen.add(line.id);
    merged.push(line);
  }
  if (merged.length > RING_CAP) {
    return merged.slice(merged.length - RING_CAP);
  }
  return merged;
}

export function useConsoleStream(
  options: UseConsoleStreamOptions = {},
): UseConsoleStreamResult {
  const {
    externalLines = [],
    liveEvents = [],
    enableAuditPolling = true,
    pollIntervalMs = 10000,
  } = options;

  const [lines, setLines] = useState<ConsoleLineDTO[]>([]);
  const [filterLevel, setFilterLevel] = useState<ConsoleLevel | "all">("all");
  const [filterSource, setFilterSource] = useState("");
  const [stickToBottom, setStickToBottom] = useState(true);
  const lastLiveKey = useRef("");

  const appendLine = useCallback(
    (line: Omit<ConsoleLineDTO, "id"> & { id?: string }) => {
      const full: ConsoleLineDTO = {
        ...line,
        id: line.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
      setLines((prev) => pushRing(prev, [full]));
    },
    [],
  );

  const clear = useCallback(() => setLines([]), []);

  usePolling(enableAuditPolling, pollIntervalMs, async () => {
    try {
      const page = await orchestrationClient.getAudit({
        limit: 80,
        include_hooks: false,
        exclude_category: "audit_hook",
      });
      const mapped = page.entries
        .map(auditToLine)
        .filter((x): x is ConsoleLineDTO => x != null);
      setLines((prev) => pushRing(prev, mapped));
    } catch {
      /* audit may be empty / missing */
    }
  });

  useEffect(() => {
    if (!externalLines.length) return;
    setLines((prev) => pushRing(prev, externalLines));
  }, [externalLines]);

  useEffect(() => {
    if (!liveEvents.length) return;
    const latest = liveEvents[liveEvents.length - 1];
    if (!latest) return;
    const key = `${latest.ts}:${latest.event_name ?? ""}`;
    if (key === lastLiveKey.current) return;
    lastLiveKey.current = key;
    const line = eventToLine(latest);
    if (line) setLines((prev) => pushRing(prev, [line]));
  }, [liveEvents]);

  const filtered = useMemo(() => {
    return lines.filter((l) => {
      if (filterLevel !== "all" && l.level !== filterLevel) return false;
      if (
        filterSource &&
        !(l.source ?? "").toLowerCase().includes(filterSource.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [lines, filterLevel, filterSource]);

  return {
    lines,
    filterLevel,
    setFilterLevel,
    filterSource,
    setFilterSource,
    stickToBottom,
    setStickToBottom,
    appendLine,
    clear,
    filtered,
  };
}
