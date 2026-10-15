/* eic-evolve:5ad65539-32f5-4f33-acf4-f67ab742abea:a0:bp1.1.0 */
/**
 * Asm Prod Acc 20261006100320 desktop mount — Configuration-Driven Assembly (Dashboard_Standard).
 * Peer metrics: peerApiBase(8054)/api/v1/metrics
 * Slots filled by EIC Assembler from Manifest — do not hand-edit widgets.
 */
import { useCallback, useEffect, useState } from "react";
import { peerApiBase } from "@/api/peerBase";
import { BaseCard, BaseChart, BaseLayout } from "@/assembly_lib";
import type { MountProps } from "./registry";
// eic:extract-wire:dashboardWidgetBody — corpus under atoms/asm_prod_acc_20261006100320/ (not bake-imported)
// eic:extract-wire:DashboardFavoritesSlotBody — corpus under atoms/asm_prod_acc_20261006100320/ (not bake-imported)

type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  unit?: string | null;
};
const PEER = peerApiBase(8054);
export function AsmProdAcc20261006100320Mount(_props: MountProps) {
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
      title="Asm Prod Acc 20261006100320"
      subtitle={`Peer :8054 · /api/v1/metrics`}
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
            key="favorites_slot"
            data-assembly-data-source="/api/v1/dashboard"
            title="Favorites"
            value={metricField("Favorites", "value")}
            unit={metricField("Favorites", "unit")}
          />
          <BaseCard
            key="metric_card_revenue"
            data-assembly-data-source="/api/v1/dashboard"
            title="Revenue"
            value={metricField("Revenue", "value")}
            unit={metricField("Revenue", "unit")}
          />
          <BaseCard
            key="metric_card_users"
            data-assembly-data-source="/api/v1/dashboard"
            title="Active Users"
            value={metricField("Active Users", "value")}
            unit={metricField("Active Users", "unit")}
          />
          <BaseCard
            key="metric_card_conversion"
            data-assembly-data-source="/api/v1/dashboard"
            title="Conversion Rate"
            value={metricField("Conversion Rate", "value")}
            unit={metricField("Conversion Rate", "unit")}
          />
          <BaseChart
            key="revenue_trend_chart"
            data-assembly-data-source="/api/v1/dashboard"
            title="Revenue Trend"
            chartType="area_line"
            series={metricSeries()}
          />
        </div>
        {/* @assembler-slot-end: widgets */}
      </div>
    </BaseLayout>
  );
}
