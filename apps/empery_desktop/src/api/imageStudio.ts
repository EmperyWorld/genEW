import { peerApiBase } from "./peerBase";

export type GenerateResponse = {
  prompt_id: string;
  status: "queued";
};

export type ImageRef = {
  filename: string;
  subfolder: string;
  type: string;
};

export type JobStatus = {
  prompt_id: string;
  status: "queued" | "running" | "completed" | "failed";
  error?: string | null;
  images: ImageRef[];
};

const base = peerApiBase(8021, import.meta.env.VITE_IMAGE_STUDIO_API_BASE);

export function imageUrl(ref: ImageRef): string {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder || "",
    type: ref.type || "output",
  });
  return `${base}/api/v1/images?${params.toString()}`;
}

export async function generateImage(body: {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
}): Promise<GenerateResponse> {
  const res = await fetch(`${base}/api/v1/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
    intervalMs = 1500,
    timeoutMs = 180_000,
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
