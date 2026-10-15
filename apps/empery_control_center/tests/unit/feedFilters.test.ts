import { describe, expect, it } from "vitest";
import {
  classifyFeedCategory,
  isAuditHookItem,
  isAuditHookTopic,
  shouldShowInInsightFeed,
  stableAuditFeedId,
} from "../../src/features/insight-feed/feedFilters";
import { capAuditHookItems } from "../../src/features/insight-feed/useInsightFeed";

describe("feedFilters", () => {
  it("classifies Cursor hooks as audit_hook (any casing)", () => {
    expect(isAuditHookTopic("afterFileEdit")).toBe(true);
    expect(isAuditHookTopic("AFTERFILEEDIT")).toBe(true);
    expect(isAuditHookTopic("beforeShellExecution")).toBe(true);
    expect(isAuditHookTopic("BEFORESHELLEXECUTION")).toBe(true);
    expect(classifyFeedCategory("afterFileEdit")).toBe("audit_hook");
    expect(classifyFeedCategory("AFTERFILEEDIT")).toBe("audit_hook");
    expect(classifyFeedCategory("task.insight.generated")).toBe("intelligence");
    expect(classifyFeedCategory("eic.job.started")).toBe("intelligence");
  });

  it("hides audit hooks by default in Insight Feed", () => {
    expect(
      shouldShowInInsightFeed("afterFileEdit", "audit_hook", false),
    ).toBe(false);
    expect(
      shouldShowInInsightFeed("AFTERFILEEDIT", "intelligence", false),
    ).toBe(false);
    expect(
      shouldShowInInsightFeed("task.created", "intelligence", false),
    ).toBe(true);
    expect(
      shouldShowInInsightFeed("afterFileEdit", "audit_hook", true),
    ).toBe(true);
  });

  it("hides Style & Contract noise even without hook category", () => {
    expect(
      shouldShowInInsightFeed(
        "agent.note",
        "intelligence",
        false,
        "Style & Contract: edited compose.yml",
      ),
    ).toBe(false);
    expect(
      isAuditHookItem({
        topic: "unknown",
        summary: "ok",
        payload: { context: "Style & Contract: edited Dockerfile.python" },
      }),
    ).toBe(true);
  });

  it("builds stable audit ids without array index", () => {
    const a = stableAuditFeedId("t1", "afterFileEdit", {
      file_path: "/x.py",
    });
    const b = stableAuditFeedId("t1", "afterFileEdit", {
      file_path: "/x.py",
    });
    expect(a).toBe(b);
  });

  it("caps audit_hook hydrate to newest N while keeping intelligence", () => {
    const items = [
      {
        id: "i1",
        topic: "task.created",
        timestamp: "2026-01-01T00:00:00Z",
        summary: "intel",
        payload: {},
        category: "intelligence" as const,
      },
      ...Array.from({ length: 40 }, (_, i) => ({
        id: `h${i}`,
        topic: "afterFileEdit",
        timestamp: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`,
        summary: `hook ${i}`,
        payload: {},
        category: "audit_hook" as const,
      })),
    ];
    const capped = capAuditHookItems(items, 30);
    expect(capped.filter((x) => x.topic === "task.created")).toHaveLength(1);
    expect(capped.filter((x) => x.topic === "afterFileEdit")).toHaveLength(30);
    expect(capped.some((x) => x.id === "h39")).toBe(true);
    expect(capped.some((x) => x.id === "h0")).toBe(false);
  });
});
