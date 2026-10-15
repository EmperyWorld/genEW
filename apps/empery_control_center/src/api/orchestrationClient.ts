import { eccFetch } from "./http";
import type {
  EvolveCommandRequest,
  ImplementCommandRequest,
  JobListResponse,
  JobResponse,
  JobStatus,
  LifecycleSkill,
  OrchestrationPathsResponse,
  PlanCommandRequest,
  VerifyCommandRequest,
  AuditListResponse,
} from "./types";

export interface ListJobsQuery {
  status?: JobStatus;
  skill?: LifecycleSkill;
  limit?: number;
}

export const orchestrationClient = {
  plan(body: PlanCommandRequest, signal?: AbortSignal): Promise<JobResponse> {
    return eccFetch<JobResponse>("/commands/plan", {
      method: "POST",
      body,
      signal,
    });
  },

  implement(
    body: ImplementCommandRequest,
    signal?: AbortSignal,
  ): Promise<JobResponse> {
    return eccFetch<JobResponse>("/commands/implement", {
      method: "POST",
      body,
      signal,
    });
  },

  verify(
    body: VerifyCommandRequest,
    signal?: AbortSignal,
  ): Promise<JobResponse> {
    return eccFetch<JobResponse>("/commands/verify", {
      method: "POST",
      body,
      signal,
    });
  },

  evolve(
    body: EvolveCommandRequest,
    signal?: AbortSignal,
  ): Promise<JobResponse> {
    return eccFetch<JobResponse>("/commands/evolve", {
      method: "POST",
      body,
      signal,
    });
  },

  evolvePropose(
    body: import("./types").EvolveProposeRequest,
    signal?: AbortSignal,
  ): Promise<import("./types").EvolveProposeResponse> {
    return eccFetch("/evolve/propose", {
      method: "POST",
      body,
      signal,
    });
  },

  listJobs(
    query: ListJobsQuery = {},
    signal?: AbortSignal,
  ): Promise<JobListResponse> {
    return eccFetch<JobListResponse>("/jobs", { query, signal });
  },

  getJob(jobId: string, signal?: AbortSignal): Promise<JobResponse> {
    return eccFetch<JobResponse>(`/jobs/${jobId}`, { signal });
  },

  cancelJob(jobId: string, signal?: AbortSignal): Promise<JobResponse> {
    return eccFetch<JobResponse>(`/jobs/${jobId}/cancel`, {
      method: "POST",
      signal,
    });
  },

  lifecycle(
    serviceName: string,
    action: "enable" | "disable" | "delete",
    signal?: AbortSignal,
  ): Promise<{
    ok: boolean;
    service_name: string;
    action: string;
    result: Record<string, unknown>;
    error?: string | null;
  }> {
    return eccFetch(`/factory/services/${encodeURIComponent(serviceName)}/lifecycle`, {
      method: "POST",
      body: { action },
      signal,
    });
  },

  lifecycleMeta(
    serviceName: string,
    signal?: AbortSignal,
  ): Promise<{
    service_name: string;
    user_created: boolean;
    seed_product: boolean;
    deletable: boolean;
    force_delete_env?: boolean;
    ghost?: boolean;
  }> {
    return eccFetch(
      `/factory/services/${encodeURIComponent(serviceName)}/lifecycle-meta`,
      { signal },
    );
  },

  getAudit(
    query: {
      limit?: number;
      offset?: number;
      /** Comma-separated categories to keep (e.g. intelligence,system). */
      category?: string;
      /** Comma-separated categories to drop (e.g. audit_hook). */
      exclude_category?: string;
      /** When false, API omits Cursor audit_hook rows. */
      include_hooks?: boolean;
    } = {},
    signal?: AbortSignal,
  ): Promise<AuditListResponse> {
    return eccFetch<AuditListResponse>("/audit", { query, signal });
  },

  getPaths(signal?: AbortSignal): Promise<OrchestrationPathsResponse> {
    return eccFetch<OrchestrationPathsResponse>("/orchestration/paths", {
      signal,
    });
  },
};
