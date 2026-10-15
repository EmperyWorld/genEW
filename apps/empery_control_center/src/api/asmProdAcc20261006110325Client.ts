import { eccFetch } from "@/api/http";

export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  unit?: string | null;
  updated_at?: string | null;
};

export type MetricListResponse = {
  metrics: DashboardMetric[];
  count: number;
};

export const asmProdAcc20261006110325Client = {
  listMetrics(limit = 50): Promise<MetricListResponse> {
    return eccFetch<MetricListResponse>("/asm-prod-acc-20261006110325/metrics", {
      query: { limit: String(limit) },
    });
  },
};
