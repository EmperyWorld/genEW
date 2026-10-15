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

export const loshkovskiyClient = {
  listMetrics(limit = 50): Promise<MetricListResponse> {
    return eccFetch<MetricListResponse>("/loshkovskiy/metrics", {
      query: { limit: String(limit) },
    });
  },
};
