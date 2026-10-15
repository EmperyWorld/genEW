/* eic-evolve:92ca81bb-8103-4c76-b5be-013dfc47acea:a0:bp1.0.0 */
/**
 * Asm Prod Acc 20261006110325 desktop mount — Configuration-Driven Assembly (Dashboard_Standard).
 * Peer metrics: peerApiBase(8060)/api/v1/metrics
 * Slots filled by EIC Assembler from Manifest — do not hand-edit widgets.
 */
import { useCallback, useEffect, useState } from "react";
import { peerApiBase } from "@/api/peerBase";
import { BaseCard, BaseChart, BaseLayout } from "@/assembly_lib";
import type { MountProps } from "./registry";
// eic:extract-wire:dashboardWidgetBody — corpus under atoms/asm_prod_acc_20261006110325/ (not bake-imported)
// eic:extract-wire:DashboardFavoritesSlotBody — corpus under atoms/asm_prod_acc_20261006110325/ (not bake-imported)

type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  unit?: string | null;
};
const PEER = peerApiBase(8060);
export function AsmProdAcc20261006110325Mount(_props: MountProps) {
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const res = await fetch(`${PEER}/api/v1/metrics?limit=50`);
    if (!res.ok) throw new Error(`list HTTP ${res.status}`);
    const data = (await res.json()) as {
      metrics?: DashboardMetric[];
    };
    setMetrics(data.metrics ?? []);
  }, []);
  useEffect(() => {
    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : "load failed"),
    );
  }, [reload]);
  const onRefresh = async () => {
    setBusy(true);
    setError(null);
    try {
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "refresh failed");
    } finally {
      setBusy(false);
    }
  };

  /** Assembler DI: Manifest data_source → living metrics array. */
  const metricField = (
    label: string,
    field: "value" | "unit" | "label",
  ): string => {
    const hit =
      metrics.find((m) => m.label === label) ??
      metrics.find((m) => m.id === label) ??
      metrics[0];
    if (!hit) return busy ? "…" : "—";
    const raw = hit[field];
    return raw == null || raw === "" ? "—" : String(raw);
  };
  const metricSeries = () =>
    metrics.slice(0, 12).map((m) => ({
      label: m.label,
      value: Number.parseFloat(String(m.value)) || 0,
    }));
  return (
    <BaseLayout
      title="Asm Prod Acc 20261006110325"
      subtitle={`Peer :8060 · /api/v1/metrics`}
      actions={
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={busy}
          className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal disabled:opacity-50"
        >
          {busy ? "…" : "Refresh"}
        </button>
      }
    >
      {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}
      <div
        className="grid grid-cols-2 gap-2"
        data-assembly-data-source="/api/v1/metrics"
      >
        {/* @assembler-slot: widgets */}
        <div data-assembler-slot="widgets" className="contents">
          <BaseCard
            key="metric_card"
            data-assembly-data-source="/api/v1/metrics"
            title="Metrics"
            value={metricField("Metrics", "value")}
            unit={metricField("Metrics", "unit")}
          />
          <BaseChart
            key="trend_chart"
            data-assembly-data-source="/api/v1/metrics"
            title="Trend"
            chartType="area_line"
            series={metricSeries()}
          />
        </div>
        {/* @assembler-slot-end: widgets */}
      </div>
    </BaseLayout>
  );
}
