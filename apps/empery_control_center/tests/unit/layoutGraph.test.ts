import { describe, expect, it } from "vitest";
import {
  eventFlowPairs,
  graphTopologyKey,
  layoutGraph,
} from "../../src/features/ecosystem-map/layoutGraph";
import type { ServiceNodeDTO } from "../../src/api/types";

function svc(
  name: string,
  opts: {
    deps?: string[];
    publishes?: string[];
    subscribes?: string[];
  } = {},
): ServiceNodeDTO {
  return {
    manifest: {
      name,
      version: "0.1.0",
      features: [],
      entry_point: "src/api/main.py",
      dependencies: opts.deps ?? [],
      publishes: opts.publishes ?? [],
      subscribes: opts.subscribes ?? [],
    },
    health: "unknown",
  };
}

describe("layoutGraph", () => {
  it("creates nodes from registry services only (no hardcode)", () => {
    const services = [svc("alpha_service"), svc("beta_service", { deps: ["alpha_service"] })];
    const { nodes, edges } = layoutGraph(services);
    expect(nodes.map((n) => n.id).sort()).toEqual([
      "alpha_service",
      "beta_service",
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.source).toBe("alpha_service");
    expect(edges[0]?.target).toBe("beta_service");
    expect(edges[0]?.id).toBe("dep:alpha_service->beta_service");
    expect(edges[0]?.data).toMatchObject({ kind: "dependency" });
  });

  it("ignores dependencies not present in the snapshot", () => {
    const { edges } = layoutGraph([svc("solo", { deps: ["missing_service"] })]);
    expect(edges).toHaveLength(0);
  });

  it("layers dependents to the right of roots", () => {
    const { nodes } = layoutGraph([
      svc("root"),
      svc("child", { deps: ["root"] }),
    ]);
    const root = nodes.find((n) => n.id === "root")!;
    const child = nodes.find((n) => n.id === "child")!;
    expect(child.position.x).toBeGreaterThan(root.position.x);
  });

  it("places Hands capsules in a band below platform seed", () => {
    const { nodes } = layoutGraph([
      { ...svc("identity_service"), origin: "platform" },
      { ...svc("lab_capsule_x"), origin: "hands" },
    ]);
    const platform = nodes.find((n) => n.id === "identity_service")!;
    const hands = nodes.find((n) => n.id === "lab_capsule_x")!;
    expect(hands.position.y).toBeGreaterThan(platform.position.y + 64);
    expect(platform.data.service.origin).toBe("platform");
    expect(hands.data.service.origin).toBe("hands");
  });

  it("draws dashed event edges from matching publishes/subscribes", () => {
    const services = [
      svc("task_orchestrator_service", {
        publishes: ["task.created", "task.updated"],
      }),
      svc("intelligence_service", {
        subscribes: ["task.created", "task.updated"],
        publishes: ["task.insight.generated"],
      }),
    ];
    const pairs = eventFlowPairs(services);
    expect(pairs).toEqual([
      {
        source: "task_orchestrator_service",
        target: "intelligence_service",
        topics: ["task.created", "task.updated"],
      },
    ]);
    const { edges } = layoutGraph(services);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.id).toBe(
      "evt:task_orchestrator_service->intelligence_service",
    );
    expect(edges[0]?.data).toMatchObject({
      kind: "event",
      topics: ["task.created", "task.updated"],
    });
  });

  it("keeps hard and event edges distinct for the same pair", () => {
    const services = [
      svc("empery_intelligence_core", {
        publishes: ["eic.intention.completed"],
      }),
      svc("empery_control_center_api", {
        deps: ["empery_intelligence_core"],
        subscribes: ["eic.intention.completed"],
      }),
    ];
    const { edges } = layoutGraph(services);
    expect(edges.map((e) => e.id).sort()).toEqual([
      "dep:empery_intelligence_core->empery_control_center_api",
      "evt:empery_intelligence_core->empery_control_center_api",
    ]);
  });

  it("builds honest hard+event graph without inventing mesh", () => {
    const services = [
      svc("identity_service"),
      svc("task_orchestrator_service", {
        deps: ["identity_service"],
        publishes: ["task.created"],
      }),
      svc("intelligence_service", {
        subscribes: ["task.created"],
      }),
      svc("empery_deploy_agent"),
      svc("empery_intelligence_core", {
        deps: ["empery_deploy_agent"],
        publishes: ["eic.intention.completed"],
        subscribes: ["eic.intention.requested"],
      }),
      svc("empery_control_center_api", {
        deps: ["empery_intelligence_core", "identity_service"],
        publishes: ["eic.intention.requested"],
        subscribes: ["eic.intention.completed", "task.created"],
      }),
      svc("analytics_service", { publishes: ["analytics.event.ingested"] }),
      svc("core_auth_service"),
      svc("reflex_probe_service"),
    ];
    const { nodes, edges } = layoutGraph(services);
    expect(nodes).toHaveLength(9);
    const depEdges = edges.filter((e) => e.id.startsWith("dep:"));
    const evtEdges = edges.filter((e) => e.id.startsWith("evt:"));
    expect(depEdges).toHaveLength(4);
    expect(evtEdges.map((e) => e.id).sort()).toEqual([
      "evt:empery_control_center_api->empery_intelligence_core",
      "evt:empery_intelligence_core->empery_control_center_api",
      "evt:task_orchestrator_service->empery_control_center_api",
      "evt:task_orchestrator_service->intelligence_service",
    ]);
    // Islands stay present with no fake edges.
    expect(
      edges.some(
        (e) =>
          e.source === "analytics_service" ||
          e.target === "analytics_service" ||
          e.source === "reflex_probe_service" ||
          e.target === "reflex_probe_service",
      ),
    ).toBe(false);
  });

  it("terminates when mutual event edges form a cycle (ECC↔EIC)", () => {
    const services = [
      svc("empery_intelligence_core", {
        publishes: ["eic.intention.completed"],
        subscribes: ["eic.intention.requested"],
      }),
      svc("empery_control_center_api", {
        deps: ["empery_intelligence_core"],
        publishes: ["eic.intention.requested"],
        subscribes: ["eic.intention.completed"],
      }),
      svc("identity_service"),
    ];
    const started = Date.now();
    const { nodes, edges } = layoutGraph(services);
    expect(Date.now() - started).toBeLessThan(200);
    expect(nodes).toHaveLength(3);
    expect(edges.some((e) => e.id.startsWith("evt:"))).toBe(true);
    for (const n of nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });

  it("does not place nodes via event cycles (hard deps only for layers)", () => {
    const { nodes } = layoutGraph([
      svc("empery_intelligence_core", {
        publishes: ["eic.intention.completed"],
        subscribes: ["eic.intention.requested"],
      }),
      svc("empery_control_center_api", {
        deps: ["empery_intelligence_core"],
        publishes: ["eic.intention.requested"],
        subscribes: ["eic.intention.completed"],
      }),
      svc("identity_service"),
    ]);
    const eic = nodes.find((n) => n.id === "empery_intelligence_core")!;
    const ecc = nodes.find((n) => n.id === "empery_control_center_api")!;
    const identity = nodes.find((n) => n.id === "identity_service")!;
    expect(ecc.position.x).toBeGreaterThan(eic.position.x);
    // Event cycle must not shove ECC/EIC to extreme columns.
    expect(ecc.position.x - eic.position.x).toBeLessThanOrEqual(300);
    expect(identity.position.x).toBe(eic.position.x);
  });
});

describe("graphTopologyKey", () => {
  it("ignores health changes", () => {
    const a = [svc("alpha"), svc("beta", { deps: ["alpha"] })];
    const b = a.map((s) =>
      s.manifest.name === "alpha" ? { ...s, health: "ok" as const } : s,
    );
    expect(graphTopologyKey(a)).toBe(graphTopologyKey(b));
  });

  it("changes when a node or hard dependency is added", () => {
    const base = [svc("alpha"), svc("beta", { deps: ["alpha"] })];
    const withGamma = [...base, svc("gamma")];
    const withExtraDep = [
      svc("alpha"),
      svc("beta", { deps: ["alpha"] }),
      svc("gamma", { deps: ["beta"] }),
    ];
    expect(graphTopologyKey(base)).not.toBe(graphTopologyKey(withGamma));
    expect(graphTopologyKey(withGamma)).not.toBe(graphTopologyKey(withExtraDep));
  });

  it("changes when event-flow topology changes", () => {
    const without = [svc("pub"), svc("sub")];
    const withFlow = [
      svc("pub", { publishes: ["topic.a"] }),
      svc("sub", { subscribes: ["topic.a"] }),
    ];
    expect(graphTopologyKey(without)).not.toBe(graphTopologyKey(withFlow));
  });
});
