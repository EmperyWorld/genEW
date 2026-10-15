/**
 * Insight Feed ingress filters.
 * Cursor IDE hooks write audit JSONL; those are not intelligence events.
 */

export type FeedCategory = "intelligence" | "audit_hook" | "system";

/** Cursor hook event names written to orchestration/audit/events.jsonl */
export const AUDIT_HOOK_EVENTS = new Set([
  "afterfileedit",
  "beforeshellexecution",
  "afteragentresponse",
  "beforesubmitprompt",
  "afteragentthought",
  "stop",
  "sessionstart",
  "sessionend",
]);

const STYLE_CONTRACT_RE = /style\s*&\s*contract/i;
const HOOK_PREFIX_RE = /^(after|before)[a-z]/i;

function normTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

/** True for Cursor hook event names in any casing (afterFileEdit, AFTERFILEEDIT, …). */
export function isAuditHookTopic(topic: string | undefined | null): boolean {
  if (!topic) return false;
  const t = normTopic(topic);
  if (AUDIT_HOOK_EVENTS.has(t)) return true;
  // CamelCase / UPPERCASE Cursor-style hook names without dotted namespaces
  if (!t.includes(".") && HOOK_PREFIX_RE.test(t)) return true;
  return false;
}

/** True when summary/context is Cursor Style & Contract audit noise. */
export function isAuditHookNoiseText(
  text: string | undefined | null,
): boolean {
  if (!text) return false;
  return STYLE_CONTRACT_RE.test(text);
}

export function isAuditHookItem(item: {
  topic: string;
  category?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown> | null;
}): boolean {
  if (item.category === "audit_hook") return true;
  if (isAuditHookTopic(item.topic)) return true;
  if (isAuditHookNoiseText(item.summary)) return true;
  const raw = item.payload ?? {};
  const ctx =
    typeof raw.context === "string"
      ? raw.context
      : typeof raw.message === "string"
        ? raw.message
        : "";
  return isAuditHookNoiseText(ctx);
}

export function classifyFeedCategory(
  topic: string,
  explicit?: string | null,
): FeedCategory {
  if (
    explicit === "audit_hook" ||
    explicit === "intelligence" ||
    explicit === "system"
  ) {
    return explicit;
  }
  if (isAuditHookTopic(topic)) return "audit_hook";
  if (topic.startsWith("ecc.") || topic.startsWith("orchestration.")) {
    return "system";
  }
  return "intelligence";
}

export function shouldShowInInsightFeed(
  topic: string,
  category: FeedCategory,
  includeAuditHooks: boolean,
  summary?: string | null,
  payload?: Record<string, unknown> | null,
): boolean {
  if (
    isAuditHookItem({ topic, category, summary, payload }) ||
    category === "audit_hook"
  ) {
    return includeAuditHooks;
  }
  return true;
}

/** Stable id for audit rows (avoid array-index churn on poll window slides). */
export function stableAuditFeedId(
  timestamp: string | undefined,
  topic: string,
  raw: Record<string, unknown>,
): string {
  const path =
    typeof raw.file_path === "string"
      ? raw.file_path
      : typeof raw.command === "string"
        ? raw.command.slice(0, 80)
        : typeof raw.context === "string"
          ? raw.context.slice(0, 80)
          : "";
  const digest = `${timestamp ?? "t"}|${topic}|${path}`;
  let h = 0;
  for (let i = 0; i < digest.length; i++) {
    h = (h * 31 + digest.charCodeAt(i)) >>> 0;
  }
  return `feed-${topic}-${timestamp ?? "t"}-${h.toString(36)}`;
}
