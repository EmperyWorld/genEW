import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loshkovskiyClient, type DashboardMetric } from "@/api/loshkovskiyClient";

export function useLoshkovskiySession() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setBusy(true);
    setError(null);
    try {
      const res = await loshkovskiyClient.listMetrics();
      setMetrics(res.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loshkovskiy.subtitle"));
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { metrics, loading, busy, error, reload };
}
