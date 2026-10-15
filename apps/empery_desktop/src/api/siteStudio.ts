import { peerApiBase } from "./peerBase";

export type PreviewResponse = {
  draft_id: string;
  title: string;
  topic: string;
  html: string;
  backend: string;
  model?: string | null;
  status: "ready";
};

const base = peerApiBase(8024, import.meta.env.VITE_SITE_STUDIO_API_BASE);

export async function siteStudioHealth(): Promise<{
  ready: boolean;
  detail: string;
}> {
  const res = await fetch(`${base}/api/v1/health`);
  if (!res.ok) {
    return { ready: false, detail: `HTTP ${res.status}` };
  }
  const body = (await res.json()) as {
    nervas?: { ready?: boolean; detail?: string; backend?: string };
  };
  const ready = Boolean(body.nervas?.ready);
  return {
    ready,
    detail: body.nervas?.detail || body.nervas?.backend || (ready ? "ok" : "down"),
  };
}

export async function generatePreview(body: {
  title: string;
  topic: string;
  brief: string;
  language?: string;
}): Promise<PreviewResponse> {
  const res = await fetch(`${base}/api/v1/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`preview failed: ${res.status} ${text.slice(0, 240)}`);
  }
  return res.json() as Promise<PreviewResponse>;
}
