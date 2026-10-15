import { useCallback, useEffect, useState } from "react";
import { EccApiError } from "../../api/http";
import { registryClient } from "../../api/registryClient";
import { sandboxClient } from "../../api/sandboxClient";
import type {
  ConsoleLineDTO,
  FeedItemDTO,
  RegistryServiceEntry,
  SandboxProbeResponse,
} from "../../api/types";
import i18n from "@/i18n";

export interface SandboxFormState {
  publisher: string;
  subscriber: string;
  topic: string;
  payloadText: string;
  confirmDestructive: boolean;
}

export interface UseSandboxSessionOptions {
  sessionId?: string;
}

export interface UseSandboxSessionResult {
  sessionId: string | null;
  services: RegistryServiceEntry[];
  form: SandboxFormState;
  setForm: React.Dispatch<React.SetStateAction<SandboxFormState>>;
  lastProbe: SandboxProbeResponse | null;
  loading: boolean;
  probing: boolean;
  error: string | null;
  errorCode?: string;
  consoleLines: ConsoleLineDTO[];
  feedItems: FeedItemDTO[];
  ensureSession: () => Promise<string>;
  fireProbe: () => Promise<void>;
  refreshServices: () => Promise<void>;
  clearError: () => void;
}

export function getTopicTemplates(): Record<string, Record<string, unknown>> {
  return {
    "task.created": {
      task_id: "demo-task-1",
      title: i18n.t("sandbox.probeTemplates.taskTitle"),
      priority: "normal",
    },
    "task.insight.generated": {
      task_id: "demo-task-1",
      summary: i18n.t("sandbox.probeTemplates.insightSummary"),
      confidence: 0.72,
      suggested_priority: "high",
    },
    "analytics.event.ingested": {
      event_type: "sandbox.probe",
      source: "ecc_sandbox",
    },
    "ecc.job.created": {
      job_id: "00000000-0000-0000-0000-000000000001",
      skill: "plan",
      status: "pending",
    },
  };
}

/** @deprecated Use getTopicTemplates() for locale-aware probe payloads. */
export const TOPIC_TEMPLATES = getTopicTemplates();

function logLine(
  message: string,
  level: ConsoleLineDTO["level"] = "info",
): ConsoleLineDTO {
  return {
    id: `sbx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    level,
    source: "sandbox",
    message,
  };
}

export function useSandboxSession(
  options: UseSandboxSessionOptions = {},
): UseSandboxSessionResult {
  const [sessionId, setSessionId] = useState<string | null>(
    options.sessionId ?? null,
  );
  const [services, setServices] = useState<RegistryServiceEntry[]>([]);
  const [form, setForm] = useState<SandboxFormState>(() => {
    const templates = getTopicTemplates();
    return {
      publisher: "",
      subscriber: "",
      topic: "task.created",
      payloadText: JSON.stringify(templates["task.created"], null, 2),
      confirmDestructive: false,
    };
  });
  const [lastProbe, setLastProbe] = useState<SandboxProbeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [consoleLines, setConsoleLines] = useState<ConsoleLineDTO[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItemDTO[]>([]);

  const pushLog = useCallback((line: ConsoleLineDTO) => {
    setConsoleLines((prev) => [...prev, line].slice(-100));
  }, []);

  const refreshServices = useCallback(async () => {
    try {
      setError(null);
      const snap = await registryClient.getSnapshot();
      setServices(snap.snapshot.services);
      setForm((f) => {
        if (f.publisher) return f;
        const first = snap.snapshot.services[0]?.name ?? "";
        return { ...f, publisher: first };
      });
    } catch (err) {
      if (err instanceof EccApiError) {
        setError(err.message);
        setErrorCode(err.errorCode);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : i18n.t("sandbox.errors.registryLoad"),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshServices();
  }, [refreshServices]);

  // When topic changes and payload still looks like a template, refresh template.
  useEffect(() => {
    const templates = getTopicTemplates();
    const tmpl = templates[form.topic];
    if (!tmpl) return;
    try {
      const parsed = JSON.parse(form.payloadText) as Record<string, unknown>;
      const known = Object.values(templates).some(
        (t) => JSON.stringify(t) === JSON.stringify(parsed),
      );
      if (known) {
        setForm((f) => ({
          ...f,
          payloadText: JSON.stringify(tmpl, null, 2),
        }));
      }
    } catch {
      /* keep user JSON */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on topic change
  }, [form.topic]);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const created = await sandboxClient.createSession();
    setSessionId(created.session_id);
    pushLog(
      logLine(i18n.t("sandbox.logs.session", { id: created.session_id })),
    );
    return created.session_id;
  }, [sessionId, pushLog]);

  const fireProbe = useCallback(async () => {
    setProbing(true);
    setError(null);
    setErrorCode(undefined);
    try {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(form.payloadText) as Record<string, unknown>;
      } catch {
        throw new Error(i18n.t("sandbox.errors.invalidJson"));
      }

      const id = await ensureSession();
      pushLog(
        logLine(
          i18n.t("sandbox.logs.probe", {
            topic: form.topic,
            publisher: form.publisher,
            subscriber: form.subscriber || "*",
          }),
          "thought",
        ),
      );

      const result = await sandboxClient.probe(id, {
        publisher: form.publisher,
        subscriber: form.subscriber || null,
        topic: form.topic,
        payload,
        confirm_destructive: form.confirmDestructive,
      });

      setLastProbe(result);
      const statusLabel =
        result.status ?? (result.accepted ? "accepted" : "failed");
      const probeStatusMsg = i18n.t("sandbox.logs.probeStatus", {
        status: statusLabel,
      });
      pushLog(
        logLine(
          result.message || probeStatusMsg,
          statusLabel === "failed" || result.accepted === false
            ? "error"
            : "info",
        ),
      );

      setFeedItems((prev) => [
        ...prev,
        {
          id: `probe-${result.probe_id}`,
          topic: form.topic,
          timestamp: result.observed_at ?? new Date().toISOString(),
          summary: result.message ?? probeStatusMsg,
          service_name: form.publisher,
          correlation_id: result.probe_id,
          payload: result.echo ?? result.result ?? payload,
        },
      ]);
    } catch (err) {
      if (err instanceof EccApiError) {
        setError(err.message);
        setErrorCode(err.errorCode);
        pushLog(logLine(err.message, "error"));
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : i18n.t("sandbox.errors.probeFailed");
        setError(msg);
        pushLog(logLine(msg, "error"));
      }
    } finally {
      setProbing(false);
    }
  }, [ensureSession, form, pushLog]);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(undefined);
  }, []);

  return {
    sessionId,
    services,
    form,
    setForm,
    lastProbe,
    loading,
    probing,
    error,
    errorCode,
    consoleLines,
    feedItems,
    ensureSession,
    fireProbe,
    refreshServices,
    clearError,
  };
}
