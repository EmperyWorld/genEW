import { eccFetch } from "./http";
import type {
  SandboxProbeRequest,
  SandboxProbeResponse,
  SandboxSessionResponse,
} from "./types";

/**
 * Sandbox interaction probes.
 * Paths follow UI design contracts; gateway may stub until wired.
 */
export const sandboxClient = {
  createSession(signal?: AbortSignal): Promise<SandboxSessionResponse> {
    return eccFetch<SandboxSessionResponse>("/sandbox/sessions", {
      method: "POST",
      body: {},
      signal,
    });
  },

  probe(
    sessionId: string,
    body: SandboxProbeRequest,
    signal?: AbortSignal,
  ): Promise<SandboxProbeResponse> {
    return eccFetch<SandboxProbeResponse>(
      `/sandbox/sessions/${sessionId}/probe`,
      {
        method: "POST",
        body,
        signal,
      },
    );
  },
};
