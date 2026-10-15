import { eccFetch } from "./http";
import type {
  AutonomousJobListResponse,
  AutonomousJobResponse,
  AutonomousJobStatus,
  AutonomousModeResponse,
  LlmHealthResponse,
  MemorySearchResponse,
  ProviderConfigResponse,
  ProviderId,
  SetProviderRequest,
  SetProviderResponse,
  SubmitIntentionRequest,
  SubmitIntentionResponse,
} from "./types";

export interface ListAutonomousJobsQuery {
  status?: AutonomousJobStatus;
  limit?: number;
}

export const autonomousClient = {
  submitIntention(
    body: SubmitIntentionRequest,
    signal?: AbortSignal,
  ): Promise<SubmitIntentionResponse> {
    return eccFetch<SubmitIntentionResponse>("/autonomous/intentions", {
      method: "POST",
      body,
      signal,
    });
  },

  listJobs(
    query: ListAutonomousJobsQuery = {},
    signal?: AbortSignal,
  ): Promise<AutonomousJobListResponse> {
    return eccFetch<AutonomousJobListResponse>("/autonomous/jobs", {
      query,
      signal,
    });
  },

  getJob(jobId: string, signal?: AbortSignal): Promise<AutonomousJobResponse> {
    return eccFetch<AutonomousJobResponse>(`/autonomous/jobs/${jobId}`, {
      signal,
    });
  },

  pauseJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<AutonomousJobResponse> {
    return eccFetch<AutonomousJobResponse>(
      `/autonomous/jobs/${jobId}/pause`,
      { method: "POST", signal },
    );
  },

  resumeJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<AutonomousJobResponse> {
    return eccFetch<AutonomousJobResponse>(
      `/autonomous/jobs/${jobId}/resume`,
      { method: "POST", signal },
    );
  },

  cancelJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<AutonomousJobResponse> {
    return eccFetch<AutonomousJobResponse>(
      `/autonomous/jobs/${jobId}/cancel`,
      { method: "POST", signal },
    );
  },

  getMode(signal?: AbortSignal): Promise<AutonomousModeResponse> {
    return eccFetch<AutonomousModeResponse>("/autonomous/mode", { signal });
  },

  setMode(enabled: boolean, signal?: AbortSignal): Promise<AutonomousModeResponse> {
    return eccFetch<AutonomousModeResponse>("/autonomous/mode", {
      method: "PUT",
      body: { enabled },
      signal,
    });
  },

  getProviders(signal?: AbortSignal): Promise<ProviderConfigResponse> {
    return eccFetch<ProviderConfigResponse>("/autonomous/providers", {
      signal,
    });
  },

  setProvider(
    body: SetProviderRequest,
    signal?: AbortSignal,
  ): Promise<SetProviderResponse> {
    return eccFetch<SetProviderResponse>("/autonomous/providers", {
      method: "PUT",
      body,
      signal,
    });
  },

  searchMemory(
    q: string,
    limit = 10,
    serviceName?: string,
    signal?: AbortSignal,
  ): Promise<MemorySearchResponse> {
    return eccFetch<MemorySearchResponse>("/autonomous/memory/search", {
      query: {
        q,
        limit,
        ...(serviceName?.trim() ? { service_name: serviceName.trim() } : {}),
      },
      signal,
    });
  },

  llmHealth(signal?: AbortSignal): Promise<LlmHealthResponse> {
    return eccFetch<LlmHealthResponse>("/autonomous/llm/health", { signal });
  },
};

export type { ProviderId };
