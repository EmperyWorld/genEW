/** Doc Editor → EIC Nervas assist (rewrite / improve). No FakeAI. */

import { peerApiBase } from "./peerBase";

export type AssistMode = "improve" | "rewrite";

export type AssistResult = {
  text: string;
  backend: string;
  model?: string | null;
};

const base = peerApiBase(8007, import.meta.env.VITE_EIC_API_BASE);

const SYSTEM =
  "You are a writing assistant for Empery Doc Editor. Return ONLY the improved " +
  "document text (plain paragraphs). No markdown fences, no commentary, no title line " +
  "unless the source already had one. Preserve the user's language.";

export async function nervasHealth(): Promise<{ ready: boolean; detail: string }> {
  const res = await fetch(`${base}/api/v1/health`);
  if (!res.ok) {
    return { ready: false, detail: `health ${res.status}` };
  }
  const body = (await res.json()) as {
    nervas?: { ready?: boolean; detail?: string; backend?: string };
  };
  return {
    ready: Boolean(body.nervas?.ready),
    detail: body.nervas?.detail || body.nervas?.backend || "ok",
  };
}

export async function assistDocument(
  mode: AssistMode,
  sourceText: string,
): Promise<AssistResult> {
  const trimmed = sourceText.trim();
  if (!trimmed) {
    throw new Error("Nothing to assist — write some text first.");
  }
  const task =
    mode === "rewrite"
      ? "Rewrite the following text more clearly and fluently, keeping meaning."
      : "Improve clarity, structure, and tone of the following text. Keep meaning.";
  const res = await fetch(`${base}/api/v1/nervas/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${task}\n\n---\n${trimmed}` },
      ],
      temperature: 0.35,
      max_tokens: 2048,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`nervas assist failed: ${res.status} ${text.slice(0, 240)}`);
  }
  const body = (await res.json()) as {
    message?: { content?: string };
    backend?: string;
    model?: string | null;
  };
  let text = (body.message?.content || "").trim();
  const fence = text.match(/```(?:\w+)?\s*\n([\s\S]*?)```/);
  if (fence) {
    text = fence[1].trim();
  }
  if (!text) {
    throw new Error("empty Nervas assist reply");
  }
  return {
    text,
    backend: body.backend || "nervas",
    model: body.model,
  };
}
