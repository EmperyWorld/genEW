/** Autonomous Mode via ECC BFF (:8006) — mirror ECC autonomousClient (minimal). */

import { eccApiBase, getEccToken } from "./eccAuth";

export type AutonomousJobStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type AutonomousStage =
  | "intake"
  | "plan"
  | "implement"
  | "verify"
  | "done";

export type AutonomousJob = {
  id: string;
  intention_id: string;
  status: AutonomousJobStatus;
  stage: AutonomousStage;
  intention_text: string;
  service_name?: string | null;
  provider_id: string;
  created_at: string;
  updated_at: string;
  result_summary?: string | null;
  error_message?: string | null;
  artifact_paths: string[];
  metadata: Record<string, unknown>;
};

export type AutonomousModeResponse = {
  state: "off" | "on" | "paused";
  enabled: boolean;
  active_job_id?: string | null;
  provider_id: string;
  updated_at: string;
};

export type SubmitIntentionResponse = {
  intention: { id: string; text: string };
  job: AutonomousJob;
};

export type AutonomousJobListResponse = {
  jobs: AutonomousJob[];
  total: number;
};

async function eccFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const url = new URL(`${eccApiBase()}/api/v1${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const headers = new Headers(rest.headers);
  if (!headers.has("Content-Type") && rest.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getEccToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url.toString(), { ...rest, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} → ${res.status} ${text.slice(0, 240)}`);
  }
  return res.json() as Promise<T>;
}

export const autonomousClient = {
  getMode(): Promise<AutonomousModeResponse> {
    return eccFetch("/autonomous/mode");
  },

  listJobs(limit = 20): Promise<AutonomousJobListResponse> {
    return eccFetch("/autonomous/jobs", { query: { limit } });
  },

  getJob(jobId: string): Promise<{ job: AutonomousJob }> {
    return eccFetch(`/autonomous/jobs/${encodeURIComponent(jobId)}`);
  },

  submitIntention(body: {
    intention: string;
    service_name?: string;
  }): Promise<SubmitIntentionResponse> {
    return eccFetch("/autonomous/intentions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};
