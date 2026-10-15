import { useCallback, useEffect, useState } from "react";
import { autonomousClient } from "@/api/autonomousClient";
import { EccApiError } from "@/api/http";
import type {
  AutonomousJob,
  AutonomousModeResponse,
  ConsoleLineDTO,
  LlmHealthResponse,
  MemorySearchHit,
  ProviderConfigResponse,
  ProviderId,
} from "@/api/types";
import i18n from "@/i18n";
import { useEccStore } from "@/state/store";
import { usePolling } from "@/hooks/usePolling";
import { consoleJobMessage } from "./autonomousJobDisplay";

function thought(
  message: string,
  level: ConsoleLineDTO["level"] = "thought",
): ConsoleLineDTO {
  return {
    id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    level,
    source: "autonomous",
    message,
  };
}

export function useAutonomousSession(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const setMode = useEccStore((s) => s.setAutonomousMode);
  const setJobs = useEccStore((s) => s.setAutonomousJobs);
  const setProviders = useEccStore((s) => s.setAutonomousProviders);
  const setLlmHealth = useEccStore((s) => s.setLlmHealth);

  const mode = useEccStore((s) => s.autonomousMode);
  const jobs = useEccStore((s) => s.autonomousJobs);
  const providers = useEccStore((s) => s.autonomousProviders);
  const llmHealth = useEccStore((s) => s.llmHealth);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [memoryHits, setMemoryHits] = useState<MemorySearchHit[]>([]);
  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryService, setMemoryService] = useState("");
  const [enqueueFlash, setEnqueueFlash] = useState(false);
  /** Service names removed via lifecycle delete — hide their job rows across polls. */
  const [dismissedServices, setDismissedServices] = useState<Set<string>>(
    () => new Set(),
  );
  const [consoleLines, setConsoleLines] = useState<ConsoleLineDTO[]>([]);

  const pushLog = useCallback((line: ConsoleLineDTO) => {
    setConsoleLines((prev) => [...prev, line].slice(-200));
  }, []);

  const captureError = useCallback((err: unknown) => {
    if (err instanceof EccApiError) {
      const message =
        err.errorCode === "EIC_MODE_DISABLED"
          ? i18n.t("autonomous.errors.modeDisabled")
          : err.message;
      setError(message);
      setErrorCode(err.errorCode);
      pushLog(thought(message, "warn"));
      return;
    }
    const message =
      err instanceof Error
        ? err.message
        : i18n.t("autonomous.errors.requestFailed");
    setError(message);
    setErrorCode(null);
    pushLog(thought(message, "error"));
  }, [pushLog]);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [modeRes, jobsRes, providersRes, healthRes] = await Promise.all([
        autonomousClient.getMode(),
        autonomousClient.listJobs({ limit: 50 }),
        autonomousClient.getProviders(),
        autonomousClient.llmHealth(),
      ]);
      setMode(modeRes);
      setJobs(jobsRes.jobs);
      setProviders(providersRes);
      setLlmHealth(healthRes);
      clearError();
    } catch (err) {
      captureError(err);
    } finally {
      setLoading(false);
    }
  }, [
    captureError,
    clearError,
    setJobs,
    setLlmHealth,
    setMode,
    setProviders,
  ]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [refresh, enabled]);

  usePolling(
    enabled && !loading && !errorCode?.includes("UNAVAILABLE"),
    15_000,
    async () => {
    try {
      const [jobsRes, healthRes, modeRes] = await Promise.all([
        autonomousClient.listJobs({ limit: 50 }),
        autonomousClient.llmHealth(),
        autonomousClient.getMode(),
      ]);
      setJobs(jobsRes.jobs);
      setLlmHealth(healthRes);
      setMode(modeRes);
    } catch {
      /* keep last good state */
    }
  });

  const setAutonomousMode = useCallback(
    async (enabled: boolean) => {
      setBusy(true);
      try {
        const next = await autonomousClient.setMode(enabled);
        setMode(next);
        pushLog(
          thought(
            i18n.t(
              enabled
                ? "autonomous.console.modeOn"
                : "autonomous.console.modeOff",
            ),
            "info",
          ),
        );
        clearError();
      } catch (err) {
        captureError(err);
      } finally {
        setBusy(false);
      }
    },
    [captureError, clearError, pushLog, setMode],
  );

  const setProvider = useCallback(
    async (providerId: ProviderId) => {
      setBusy(true);
      try {
        const next = await autonomousClient.setProvider({
          provider_id: providerId,
        });
        setProviders(next.config);
        clearError();
      } catch (err) {
        captureError(err);
      } finally {
        setBusy(false);
      }
    },
    [captureError, clearError, setProviders],
  );

  const submitIntention = useCallback(
    async (
      intention: string,
      serviceName?: string,
      metadata?: Record<string, unknown>,
    ) => {
      setBusy(true);
      pushLog(thought(i18n.t("autonomous.console.submitting")));
      try {
        const result = await autonomousClient.submitIntention({
          intention,
          service_name: serviceName || null,
          metadata: metadata ?? {},
        });
        setJobs([result.job, ...jobs.filter((j) => j.id !== result.job.id)]);
        setEnqueueFlash(true);
        window.setTimeout(() => setEnqueueFlash(false), 600);
        pushLog(
          thought(
            consoleJobMessage(result.job, ({ id, status, stage, verifyStatus }) =>
              verifyStatus
                ? i18n.t("autonomous.console.queuedVerify", {
                    id,
                    verifyStatus: i18n.t(`jobs.verify.${verifyStatus}`, {
                      defaultValue: verifyStatus,
                    }),
                    stage: i18n.t(`jobs.stage.${stage}`, { defaultValue: stage }),
                  })
                : i18n.t("autonomous.console.queued", {
                    id,
                    status: i18n.t(`jobs.status.${status}`, {
                      defaultValue: status,
                    }),
                    stage: i18n.t(`jobs.stage.${stage}`, { defaultValue: stage }),
                  }),
            ),
          ),
        );
        clearError();
        return result;
      } catch (err) {
        captureError(err);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [captureError, clearError, jobs, pushLog, setJobs],
  );

  const pauseJob = useCallback(
    async (jobId: string) => {
      setBusy(true);
      try {
        const res = await autonomousClient.pauseJob(jobId);
        setJobs(jobs.map((j) => (j.id === jobId ? res.job : j)));
      } catch (err) {
        captureError(err);
      } finally {
        setBusy(false);
      }
    },
    [captureError, jobs, setJobs],
  );

  const resumeJob = useCallback(
    async (jobId: string) => {
      setBusy(true);
      try {
        const res = await autonomousClient.resumeJob(jobId);
        setJobs(jobs.map((j) => (j.id === jobId ? res.job : j)));
      } catch (err) {
        captureError(err);
      } finally {
        setBusy(false);
      }
    },
    [captureError, jobs, setJobs],
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      setBusy(true);
      try {
        const res = await autonomousClient.cancelJob(jobId);
        setJobs(jobs.map((j) => (j.id === jobId ? res.job : j)));
      } catch (err) {
        captureError(err);
      } finally {
        setBusy(false);
      }
    },
    [captureError, jobs, setJobs],
  );

  const dismissJobsForService = useCallback(
    (serviceName: string) => {
      const name = serviceName.trim();
      if (!name) return;
      setDismissedServices((prev) => {
        const next = new Set(prev);
        next.add(name);
        return next;
      });
      setJobs(jobs.filter((j) => (j.service_name || "").trim() !== name));
    },
    [jobs, setJobs],
  );

  const searchMemory = useCallback(
    async (q: string, serviceName?: string) => {
      setMemoryQuery(q);
      const svc = serviceName ?? memoryService;
      setMemoryService(svc);
      if (!q.trim()) {
        setMemoryHits([]);
        return;
      }
      try {
        const res = await autonomousClient.searchMemory(q, 10, svc || undefined);
        setMemoryHits(res.hits);
      } catch (err) {
        captureError(err);
      }
    },
    [captureError, memoryService],
  );

  return {
    mode: mode as AutonomousModeResponse | null,
    jobs: (jobs as AutonomousJob[]).filter((j) => {
      const svc = (j.service_name || "").trim();
      return !svc || !dismissedServices.has(svc);
    }),
    providers: providers as ProviderConfigResponse | null,
    llmHealth: llmHealth as LlmHealthResponse | null,
    loading,
    busy,
    error,
    errorCode,
    clearError,
    refresh,
    setAutonomousMode,
    setProvider,
    submitIntention,
    pauseJob,
    resumeJob,
    cancelJob,
    dismissJobsForService,
    searchMemory,
    memoryHits,
    memoryQuery,
    memoryService,
    enqueueFlash,
    consoleLines,
  };
}
