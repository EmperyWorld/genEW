import { useCallback, useEffect, useState } from "react";
import { EccApiError } from "../../api/http";
import { orchestrationClient } from "../../api/orchestrationClient";
import type {
  ConsoleLineDTO,
  JobStatus,
  OrchestrationJob,
  WizardStage,
} from "../../api/types";
import { usePolling } from "../../hooks/usePolling";
import i18n from "@/i18n";
import {
  isAgentWaiting,
  isDemoStubJob,
} from "./wizardJobUtils";

export type WizardUiStatus =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "cancelled";

export interface WizardFormState {
  service_name: string;
  intent: string;
  featuresText: string;
  design_path: string;
  evolve_intent: string;
  evolve_options: import("../../api/types").EvolveOptionDTO[];
  evolve_proposal_id: string;
  selected_option_id: string;
  evolve_skip_propose: boolean;
}

export interface UseWizardSessionResult {
  stage: WizardStage;
  setStage: (s: WizardStage) => void;
  form: WizardFormState;
  setForm: React.Dispatch<React.SetStateAction<WizardFormState>>;
  status: WizardUiStatus;
  job: OrchestrationJob | null;
  jobsByStage: Partial<Record<WizardStage, OrchestrationJob>>;
  completed: WizardStage[];
  error: string | null;
  errorCode?: string;
  consoleLines: ConsoleLineDTO[];
  stageDirection: number;
  pickupHint: string | null;
  showAgentWaiting: boolean;
  submitPlan: () => Promise<void>;
  submitImplement: () => Promise<void>;
  submitVerify: () => Promise<void>;
  submitEvolve: () => Promise<void>;
  clearError: () => void;
}

const STAGE_ORDER: WizardStage[] = [
  "plan",
  "implement",
  "verify",
  "evolve",
];

function parseFeatures(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function thought(
  message: string,
  level: ConsoleLineDTO["level"] = "thought",
): ConsoleLineDTO {
  return {
    id: `wiz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    level,
    source: "wizard",
    message,
  };
}

function mapJobStatus(status: JobStatus): WizardUiStatus {
  switch (status) {
    case "pending":
    case "claimed":
    case "running":
      return "running";
    case "completed":
      return "passed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "idle";
  }
}

export function useWizardSession(
  initialSessionId?: string,
): UseWizardSessionResult {
  const [stage, setStageState] = useState<WizardStage>("plan");
  const [stageDirection, setStageDirection] = useState(1);
  const [form, setForm] = useState<WizardFormState>({
    service_name: "",
    intent: "",
    featuresText: "",
    design_path: "",
    evolve_intent: "",
    evolve_options: [],
    evolve_proposal_id: "",
    selected_option_id: "",
    evolve_skip_propose: false,
  });
  const [status, setStatus] = useState<WizardUiStatus>("idle");
  const [job, setJob] = useState<OrchestrationJob | null>(null);
  const [pickupHint, setPickupHint] = useState<string | null>(null);
  const [jobsByStage, setJobsByStage] = useState<
    Partial<Record<WizardStage, OrchestrationJob>>
  >({});
  const [completed, setCompleted] = useState<WizardStage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [consoleLines, setConsoleLines] = useState<ConsoleLineDTO[]>([]);
  const [watchId, setWatchId] = useState<string | null>(
    initialSessionId ?? null,
  );

  const setStage = useCallback(
    (next: WizardStage) => {
      const from = STAGE_ORDER.indexOf(stage);
      const to = STAGE_ORDER.indexOf(next);
      setStageDirection(to >= from ? 1 : -1);
      setStageState(next);
    },
    [stage],
  );

  const pushLog = useCallback((line: ConsoleLineDTO) => {
    setConsoleLines((prev) => [...prev, line].slice(-200));
  }, []);

  const trackJob = useCallback(
    async (responseJob: OrchestrationJob, forStage: WizardStage) => {
      setJob(responseJob);
      setJobsByStage((prev) => ({ ...prev, [forStage]: responseJob }));
      setWatchId(responseJob.id);
      if (isDemoStubJob(responseJob)) {
        setStatus("failed");
        pushLog(
          thought(
            i18n.t("wizard.console.demoStubRejected", {
              id: responseJob.id,
            }),
            "error",
          ),
        );
        return;
      }
      setStatus(mapJobStatus(responseJob.status));
      pushLog(
        thought(
          i18n.t("wizard.console.queued", {
            stage: forStage,
            id: responseJob.id,
            status: responseJob.status,
          }),
        ),
      );
    },
    [pushLog],
  );

  usePolling(Boolean(watchId) && status === "running", 3000, async () => {
    const id = watchId;
    if (!id) return;
    try {
      const res = await orchestrationClient.getJob(id);
      setJob(res.job);
      setStatus(mapJobStatus(res.job.status));
      if (res.job.status === "completed") {
        setCompleted((c) =>
          c.includes(stage) ? c : [...c, stage],
        );
        if (res.job.design_path) {
          setForm((f) => ({
            ...f,
            design_path: res.job.design_path ?? f.design_path,
          }));
        }
        pushLog(
          thought(res.job.result_summary ?? `Job ${id} completed`),
        );
      } else if (res.job.status === "failed") {
        pushLog(
          thought(res.job.error_message ?? `Job ${id} failed`, "error"),
        );
      }
    } catch {
      /* transient */
    }
  });

  useEffect(() => {
    if (!initialSessionId) return;
    void (async () => {
      try {
        const res = await orchestrationClient.getJob(initialSessionId);
        setJob(res.job);
        setStatus(mapJobStatus(res.job.status));
        if (res.job.skill) setStageState(res.job.skill);
        if (res.job.service_name) {
          setForm((f) => ({
            ...f,
            service_name: res.job.service_name ?? f.service_name,
            design_path: res.job.design_path ?? f.design_path,
          }));
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : i18n.t("wizard.errors.resume"),
        );
      }
    })();
  }, [initialSessionId]);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(undefined);
  }, []);

  const submitPlan = useCallback(async () => {
    clearError();
    setStatus("running");
    setStage("plan");
    try {
      const mode = "agent";
      pushLog(thought(i18n.t("wizard.console.submittingPlan")));
      const res = await orchestrationClient.plan({
        service_name: form.service_name.trim(),
        intent: form.intent.trim(),
        features: parseFeatures(form.featuresText),
        mode,
        metadata: { mode },
      });
      await trackJob(res.job, "plan");
      setPickupHint(res.pickup_hint ?? null);
      pushLog(thought(res.pickup_hint ?? i18n.t("wizard.console.planQueued"), "info"));
    } catch (err) {
      setStatus("failed");
      if (err instanceof EccApiError) {
        setError(err.message);
        setErrorCode(err.errorCode);
      } else {
        setError(err instanceof Error ? err.message : i18n.t("wizard.errors.plan"));
      }
    }
  }, [clearError, form, pushLog, setStage, trackJob]);

  const submitImplement = useCallback(async () => {
    clearError();
    setStatus("running");
    setStage("implement");
    try {
      const mode = "agent";
      pushLog(thought(i18n.t("wizard.console.submittingImplement")));
      const res = await orchestrationClient.implement({
        service_name: form.service_name.trim(),
        design_path: form.design_path.trim() || undefined,
        mode,
        metadata: { mode },
      });
      await trackJob(res.job, "implement");
      setPickupHint(res.pickup_hint ?? null);
      pushLog(
        thought(res.pickup_hint ?? i18n.t("wizard.console.implementQueued"), "info"),
      );
    } catch (err) {
      setStatus("failed");
      if (err instanceof EccApiError) {
        setError(err.message);
        setErrorCode(err.errorCode);
      } else {
        setError(
          err instanceof Error ? err.message : i18n.t("wizard.errors.implement"),
        );
      }
    }
  }, [clearError, form, pushLog, setStage, trackJob]);

  const submitVerify = useCallback(async () => {
    clearError();
    setStatus("running");
    setStage("verify");
    try {
      const mode = "agent";
      pushLog(thought(i18n.t("wizard.console.submittingVerify")));
      const res = await orchestrationClient.verify({
        service_name: form.service_name.trim(),
        mode,
        metadata: { mode },
      });
      await trackJob(res.job, "verify");
      setPickupHint(res.pickup_hint ?? null);
      pushLog(
        thought(res.pickup_hint ?? i18n.t("wizard.console.verifyQueued"), "info"),
      );
    } catch (err) {
      setStatus("failed");
      if (err instanceof EccApiError) {
        setError(err.message);
        setErrorCode(err.errorCode);
      } else {
        setError(
          err instanceof Error ? err.message : i18n.t("wizard.errors.verify"),
        );
      }
    }
  }, [clearError, form, pushLog, setStage, trackJob]);

  const submitEvolve = useCallback(async () => {
    clearError();
    setStatus("running");
    setStage("evolve");
    try {
      const selected = form.evolve_options.find(
        (o) => o.id === form.selected_option_id,
      );
      if (!form.evolve_skip_propose && !selected) {
        setStatus("failed");
        setError(i18n.t("wizard.evolve.needPick"));
        return;
      }
      pushLog(thought(i18n.t("wizard.console.submittingEvolve")));
      const intentParts = [form.evolve_intent.trim()];
      if (selected) {
        intentParts.push(
          `Selected option [${selected.id}] ${selected.title}: ${selected.delta_summary}`,
        );
      }
      const res = await orchestrationClient.evolve({
        service_name: form.service_name.trim(),
        intent: intentParts.join("\n\n"),
        features: parseFeatures(form.featuresText),
        mode: "agent",
        metadata: {
          mode: "agent",
          proposal_id: form.evolve_proposal_id || undefined,
          selected_option_id: selected?.id,
          selected_option: selected ?? undefined,
          evolve_skip_propose: form.evolve_skip_propose,
        },
      });
      await trackJob(res.job, "evolve");
      setPickupHint(res.pickup_hint ?? null);
      pushLog(
        thought(res.pickup_hint ?? i18n.t("wizard.console.evolveQueued"), "info"),
      );
    } catch (err) {
      setStatus("failed");
      if (err instanceof EccApiError) {
        setError(err.message);
        setErrorCode(err.errorCode);
      } else {
        setError(
          err instanceof Error ? err.message : i18n.t("wizard.errors.evolve"),
        );
      }
    }
  }, [clearError, form, pushLog, setStage, trackJob]);

  const showAgentWaiting = isAgentWaiting(job, status);

  return {
    stage,
    setStage,
    form,
    setForm,
    status,
    job,
    jobsByStage,
    completed,
    error,
    errorCode,
    consoleLines,
    stageDirection,
    pickupHint,
    showAgentWaiting,
    submitPlan,
    submitImplement,
    submitVerify,
    submitEvolve,
    clearError,
  };
}
