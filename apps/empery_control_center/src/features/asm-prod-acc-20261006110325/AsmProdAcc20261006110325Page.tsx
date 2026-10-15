import { useTranslation } from "react-i18next";
import { BaseCard, BaseChart, BaseLayout } from "@/assembly_lib";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Panel } from "@/components/Panel";
import { SkeletonPulse } from "@/components/SkeletonPulse";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAsmProdAcc20261006110325Session } from "./useAsmProdAcc20261006110325Session";

/** ECC metrics dashboard — Configuration-Driven Assembly (Dashboard_Standard). */
function AsmProdAcc20261006110325PageInner() {
  const { t } = useTranslation();
  const session = useAsmProdAcc20261006110325Session();
  const metrics = session.metrics;

  /** Assembler DI: Manifest data_source → BFF metrics list. */
  const metricField = (
    label: string,
    field: "value" | "unit" | "label",
  ): string => {
    const hit =
      metrics.find((m) => m.label === label) ??
      metrics.find((m) => m.id === label) ??
      metrics[0];
    if (!hit) return session.loading ? "…" : "—";
    const raw = hit[field as keyof typeof hit];
    return raw == null || raw === "" ? "—" : String(raw);
  };
  const metricSeries = () =>
    metrics.slice(0, 12).map((m) => ({
      label: m.label,
      value: Number.parseFloat(String(m.value)) || 0,
    }));
  return (
    <div className="flex h-full min-h-0 flex-col gap-px bg-line">
      <Panel
        title={t("asmProdAcc20261006110325.title")}
        className="min-h-0 w-full rounded-none border-0 bg-field"
        flush
      >
        <BaseLayout
          title={t("asmProdAcc20261006110325.title")}
          subtitle={t("asmProdAcc20261006110325.subtitle")}
          actions={
            <Button
              type="button"
              disabled={session.loading || session.busy}
              onClick={() => void session.reload()}
            >
              {session.busy ? "…" : t("asmProdAcc20261006110325.refresh")}
            </Button>
          }
        >
          {session.error ? (
            <ErrorBanner
              message={session.error}
              onDismiss={() => void session.reload()}
            />
          ) : null}
          {session.loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SkeletonPulse className="h-28 w-full" />
              <SkeletonPulse className="h-28 w-full" />
            </div>
          ) : null}
          {!session.loading ? (
            <div
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
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
          ) : null}
        </BaseLayout>
      </Panel>
    </div>
  );
}
export function AsmProdAcc20261006110325Page() {
  return (
    <RequireAuth>
      <AsmProdAcc20261006110325PageInner />
    </RequireAuth>
  );
}
