import { peerApiBase } from "./peerBase";

export type GenerateResponse = {
  prompt_id: string;
  status: "queued";
  run_id?: string | null;
};

export type VideoRef = {
  filename: string;
  subfolder: string;
  type: string;
};

export type JobStatus = {
  prompt_id: string;
  status: "queued" | "running" | "completed" | "failed";
  error?: string | null;
  videos: VideoRef[];
};

const base = peerApiBase(8022, import.meta.env.VITE_VIDEO_STUDIO_API_BASE);

export function videoUrl(ref: VideoRef): string {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder || "",
    type: ref.type || "output",
  });
  return `${base}/api/v1/videos?${params.toString()}`;
}

export async function videoStudioHealth(): Promise<{
  ready: boolean;
  detail: string;
}> {
  const res = await fetch(`${base}/api/v1/health`);
  if (!res.ok) {
    return { ready: false, detail: `HTTP ${res.status}` };
  }
  const body = (await res.json()) as {
    comfy?: { reachable?: boolean; detail?: string };
  };
  const reachable = Boolean(body.comfy?.reachable);
  return {
    ready: reachable,
    detail: body.comfy?.detail || (reachable ? "ok" : "unreachable"),
  };
}

export async function generateVideo(body: {
  prompt: string;
  image: File;
  negative_prompt?: string;
  length?: number;
}): Promise<GenerateResponse> {
  const form = new FormData();
  form.append("prompt", body.prompt);
  form.append("image", body.image);
  if (body.negative_prompt) {
    form.append("negative_prompt", body.negative_prompt);
  }
  if (body.length != null) {
    form.append("length", String(body.length));
  }
  const res = await fetch(`${base}/api/v1/generate`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`generate failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<GenerateResponse>;
}

export async function pollJob(promptId: string): Promise<JobStatus> {
  const res = await fetch(`${base}/api/v1/jobs/${encodeURIComponent(promptId)}`);
  if (!res.ok) {
    throw new Error(`job status failed: ${res.status}`);
  }
  return res.json() as Promise<JobStatus>;
}

export async function waitForJob(
  promptId: string,
  {
    intervalMs = 2500,
    timeoutMs = 600_000,
  }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<JobStatus> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await pollJob(promptId);
    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("generation timed out");
}
