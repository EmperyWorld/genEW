import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Node,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Network } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Panel } from "../../components/Panel";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/Button";
import { ErrorBanner } from "../../components/ErrorBanner";
import { SkeletonPulse } from "../../components/SkeletonPulse";
import { healthToken } from "../../lib/healthColor";
import { humanizeServiceName } from "../../lib/format";
import { PATHS } from "@/routes/paths";
import type { EccLiveEvent } from "../../api/types";
import { useEccStore } from "@/state/store";
import { cn } from "@/lib/cn";
import { ServiceNode } from "./ServiceNode";
import {
  ConnectionEdge,
  CONNECTION_EDGE_KEYFRAMES,
} from "./ConnectionEdge";
import { MapToolbar } from "./MapToolbar";
import { useEcosystemGraph } from "./useEcosystemGraph";
import { eventFlowPairs, type ServiceNodeData } from "./layoutGraph";

const nodeTypes: NodeTypes = { service: ServiceNode };
const edgeTypes: EdgeTypes = { connection: ConnectionEdge };

export interface EcosystemMapPageProps {
  liveEvents?: EccLiveEvent[];
  highlightIds?: string[];
  trafficPairs?: Array<{ source: string; target: string }>;
  enablePolling?: boolean;
  onSelectService?: (serviceName: string | null) => void;
  className?: string;
}

function EcosystemMapInner({
  liveEvents,
  highlightIds,
  trafficPairs,
  enablePolling,
  onSelectService,
  className = "",
}: EcosystemMapPageProps) {
  const { t } = useTranslation();
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const connectionStatus = useEccStore((s) => s.connectionStatus);
  const liveConnected = connectionStatus === "connected";
  const graph = useEcosystemGraph({
    liveEvents,
    highlightIds,
    trafficPairs,
    enablePolling,
  });

  const fittedCountRef = useRef(0);

  useEffect(() => {
    if (!nodesInitialized || graph.nodes.length === 0) return;
    if (fittedCountRef.current === graph.nodes.length) return;
    fittedCountRef.current = graph.nodes.length;
    const id = window.requestAnimationFrame(() => {
      void fitView({ padding: 0.22, duration: 320 });
    });
    return () => window.cancelAnimationFrame(id);
  }, [nodesInitialized, graph.nodes.length, fitView]);

  const selected = useMemo(
    () => graph.services.find((s) => s.manifest.name === graph.selectedId),
    [graph.services, graph.selectedId],
  );

  const dependents = useMemo(() => {
    if (!selected) return [];
    return graph.services
      .filter((s) => s.manifest.dependencies.includes(selected.manifest.name))
      .map((s) => s.manifest.name);
  }, [graph.services, selected]);

  const selectedEventFlows = useMemo(() => {
    if (!selected) return [];
    const name = selected.manifest.name;
    return eventFlowPairs(graph.services).filter(
      (p) => p.source === name || p.target === name,
    );
  }, [graph.services, selected]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      graph.setSelectedId(node.id);
      onSelectService?.(node.id);
    },
    [graph, onSelectService],
  );

  const onPaneClick = useCallback(() => {
    graph.setSelectedId(null);
    onSelectService?.(null);
  }, [graph, onSelectService]);

  const roleText = selected?.role_label
    ? t(selected.role_label, { defaultValue: "" }) || undefined
    : undefined;

  return (
    <Panel
      title={t("map.title")}
      flush
      accent={liveConnected}
      className={cn("relative h-full min-h-[320px]", className)}
      actions={
        <MapToolbar
          onFitView={() => fitView({ padding: 0.22, duration: 280 })}
          onRefresh={() => void graph.refresh(true)}
          onResetLayout={graph.resetLayout}
          refreshing={graph.loading}
          showUnhealthyOnly={graph.showUnhealthyOnly}
          onToggleUnhealthy={() =>
            graph.setShowUnhealthyOnly(!graph.showUnhealthyOnly)
          }
          serviceCount={graph.services.length}
          generatedAt={graph.generatedAt ?? undefined}
        />
      }
    >
      <style>{CONNECTION_EDGE_KEYFRAMES}</style>
      {graph.error ? (
        <div className="absolute left-3 right-3 top-3 z-10">
          <ErrorBanner
            message={graph.error}
            code={graph.errorCode}
            onDismiss={() => void graph.refresh(false)}
          />
        </div>
      ) : null}

      {graph.loading && graph.services.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <SkeletonPulse rows={4} className="w-64" />
        </div>
      ) : graph.services.length === 0 ? (
        <EmptyState
          icon={<Network className="h-8 w-8" strokeWidth={1.5} />}
          title={t("map.empty")}
          description={t("map.emptyOnboardingHint")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link to={PATHS.opsHealth}>{t("onboarding.linkHealth")}</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to={PATHS.opsAutonomous}>{t("onboarding.linkAutonomous")}</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="ecc-map-vignette relative h-full w-full">
          <ReactFlow
            nodes={graph.nodes as Node<ServiceNodeData>[]}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={graph.onNodesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            fitView
            fitViewOptions={{ padding: 0.22 }}
            minZoom={0.2}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
            className="!bg-field"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1}
              color="var(--ecc-line)"
              style={{ opacity: 0.55 }}
            />
            <Controls
              showInteractive={false}
              className="!border-line !bg-panel !shadow-none [&>button]:!border-line [&>button]:!bg-panel-raised [&>button]:!fill-ink-muted"
            />
            <MiniMap
              nodeStrokeWidth={2}
              nodeColor={(n) => {
                const d = n.data as ServiceNodeData | undefined;
                return d?.service
                  ? healthToken(d.service.health)
                  : "var(--ecc-ink-faint)";
              }}
              nodeStrokeColor="var(--ecc-line)"
              maskColor="rgba(7, 10, 15, 0.8)"
              className="!border-line !bg-panel opacity-90"
            />
          </ReactFlow>

          {selected ? (
            <aside className="absolute bottom-3 left-3 right-3 z-10 max-w-md rounded-md border border-line bg-panel/95 p-3 backdrop-blur-sm md:right-auto">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-ink">
                    {humanizeServiceName(selected.manifest.name)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
                    {selected.manifest.name} · v{selected.manifest.version}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide"
                  style={{
                    color: healthToken(selected.health),
                    borderColor: healthToken(selected.health),
                    backgroundColor: `color-mix(in srgb, ${healthToken(selected.health)} 14%, transparent)`,
                  }}
                >
                  {t(`health.${selected.health}`)}
                </span>
              </div>
              {roleText ? (
                <p className="mt-2 text-[11px] uppercase tracking-wider text-metal">
                  {roleText}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-ink-muted">
                {t("map.entry")}:{" "}
                <span className="font-mono text-ink-faint">
                  {selected.manifest.entry_point || t("common.dash")}
                </span>
              </p>
              {selected.manifest.dependencies.length > 0 ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {t("map.depends")}:{" "}
                  {selected.manifest.dependencies
                    .map((d) => humanizeServiceName(d))
                    .join(", ")}
                </p>
              ) : null}
              {dependents.length > 0 ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {t("map.dependents")}:{" "}
                  {dependents.map((d) => humanizeServiceName(d)).join(", ")}
                </p>
              ) : null}
              {(selected.manifest.publishes?.length ?? 0) > 0 ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {t("map.publishes")}:{" "}
                  <span className="font-mono text-ink-faint">
                    {selected.manifest.publishes!.join(", ")}
                  </span>
                </p>
              ) : null}
              {(selected.manifest.subscribes?.length ?? 0) > 0 ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {t("map.subscribes")}:{" "}
                  <span className="font-mono text-ink-faint">
                    {selected.manifest.subscribes!.join(", ")}
                  </span>
                </p>
              ) : null}
              {selectedEventFlows.length > 0 ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {t("map.eventFlows")}:{" "}
                  {selectedEventFlows
                    .map(
                      (p) =>
                        `${humanizeServiceName(p.source)} → ${humanizeServiceName(p.target)} (${p.topics.length})`,
                    )
                    .join("; ")}
                </p>
              ) : null}
              {selected.manifest.features.length > 0 ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {t("map.features")}: {selected.manifest.features.join(", ")}
                </p>
              ) : null}
            </aside>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

export function EcosystemMapPage(props: EcosystemMapPageProps) {
  return (
    <ReactFlowProvider>
      <EcosystemMapInner {...props} />
    </ReactFlowProvider>
  );
}
