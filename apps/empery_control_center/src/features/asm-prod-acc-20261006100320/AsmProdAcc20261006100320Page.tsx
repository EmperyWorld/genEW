import { useTranslation } from "react-i18next";
import { BaseCard, BaseChart, BaseLayout } from "@/assembly_lib";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Panel } from "@/components/Panel";
import { SkeletonPulse } from "@/components/SkeletonPulse";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAsmProdAcc20261006100320Session } from "./useAsmProdAcc20261006100320Session";

/** ECC metrics dashboard — Configuration-Driven Assembly (Dashboard_Standard). */
function AsmProdAcc20261006100320PageInner() {
  const { t } = useTranslation();
  const session = useAsmProdAcc20261006100320Session();
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
        title={t("asmProdAcc20261006100320.title")}
        className="min-h-0 w-full rounded-none border-0 bg-field"
        flush
      >
        <BaseLayout
          title={t("asmProdAcc20261006100320.title")}
          subtitle={t("asmProdAcc20261006100320.subtitle")}
          actions={
            <Button
              type="button"
              disabled={session.loading || session.busy}
              onClick={() => void session.reload()}
            >
              {session.busy ? "…" : t("asmProdAcc20261006100320.refresh")}
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
          ) : null}
        </BaseLayout>
      </Panel>
    </div>
  );
}
export function AsmProdAcc20261006100320Page() {
  return (
    <RequireAuth>
      <AsmProdAcc20261006100320PageInner />
    </RequireAuth>
  );
}
