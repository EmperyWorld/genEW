import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { asmProdAcc20261006100320Client, type DashboardMetric } from "@/api/asmProdAcc20261006100320Client";

export function useAsmProdAcc20261006100320Session() {
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
      const res = await asmProdAcc20261006100320Client.listMetrics();
      setMetrics(res.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("asmProdAcc20261006100320.subtitle"));
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
