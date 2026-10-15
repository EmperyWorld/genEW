import type { JobStatus, OrchestrationJob } from "../../api/types";
import type { WizardUiStatus } from "./useWizardSession";

const AGENT_WAIT_STATUSES: JobStatus[] = ["pending", "claimed", "running"];

/** Legacy demo stub jobs — treat as failed / non-production if still present. */
export function isDemoStubJob(
  job: OrchestrationJob | null | undefined,
): boolean {
  if (!job) return false;
  if (job.metadata?.demo_stub === true) return true;
  if (job.mode === "demo") return true;

  const verifyStatus = job.metadata?.verify_status;
  if (
    typeof verifyStatus === "string" &&
    verifyStatus.toUpperCase().includes("DEMO")
  ) {
    return true;
  }

  const summary = job.result_summary?.toUpperCase() ?? "";
  return summary.includes("DEMO");
}

export function isAgentWaiting(
  job: OrchestrationJob | null | undefined,
  uiStatus: WizardUiStatus,
): boolean {
  if (!job) return false;
  if (uiStatus !== "running") return false;
  return AGENT_WAIT_STATUSES.includes(job.status);
}
