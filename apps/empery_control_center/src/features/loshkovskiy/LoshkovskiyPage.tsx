import { useTranslation } from "react-i18next";
import {
  BaseCard,
  BaseChart,
  BaseLayout,
  BaseMetricTile,
} from "@/assembly_lib";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Panel } from "@/components/Panel";
import { SkeletonPulse } from "@/components/SkeletonPulse";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useLoshkovskiySession } from "./useLoshkovskiySession";

/** ECC metrics dashboard — Configuration-Driven Assembly (Dashboard_Standard). */
function LoshkovskiyPageInner() {
  const { t } = useTranslation();
  const session = useLoshkovskiySession();
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
        title={t("loshkovskiy.title")}
        className="min-h-0 w-full rounded-none border-0 bg-field"
        flush
      >
        <BaseLayout
          title={t("loshkovskiy.title")}
          subtitle={t("loshkovskiy.subtitle")}
          actions={
            <Button
              type="button"
              disabled={session.loading || session.busy}
              onClick={() => void session.reload()}
            >
              {session.busy ? "…" : t("loshkovskiy.refresh")}
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
                <BaseMetricTile
                  key="status_metric"
                  data-assembly-data-source="/api/v1/kruzenstern/status"
                  title="Kruzenstern Status"
                  value={metricField("Kruzenstern Status", "value")}
                  unit={metricField("Kruzenstern Status", "unit")}
                />
                <BaseChart
                  key="activity_chart"
                  data-assembly-data-source="/api/v1/kruzenstern/status"
                  title="Productivity Pulse"
                  chartType="area_line"
                  series={metricSeries()}
                />
                <BaseCard
                  key="agenda_table"
                  data-assembly-data-source="/api/v1/kruzenstern/status"
                  title="Upcoming Agenda"
                  value={metricField("Upcoming Agenda", "value")}
                  unit={metricField("Upcoming Agenda", "unit")}
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
export function LoshkovskiyPage() {
  return (
    <RequireAuth>
      <LoshkovskiyPageInner />
    </RequireAuth>
  );
}
