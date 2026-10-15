/** EWA Companion → EIC Nervas chat (living brain). No FakeAI. */

import { peerApiBase } from "./peerBase";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type NervasChatResponse = {
  message: ChatMessage;
  backend: string;
  model?: string | null;
};

const base = peerApiBase(8007, import.meta.env.VITE_EIC_API_BASE);

const SYSTEM =
  "You are EWA Companion on Empery Desktop. Be concise and helpful. Reply in the user's language.";

export async function companionChat(
  history: ChatMessage[],
  userText: string,
): Promise<NervasChatResponse> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    ...history.filter((m) => m.role !== "system"),
    { role: "user", content: userText },
  ];
  const res = await fetch(`${base}/api/v1/nervas/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, temperature: 0.4, max_tokens: 512 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`nervas chat failed: ${res.status} ${text.slice(0, 240)}`);
  }
  return res.json() as Promise<NervasChatResponse>;
}

export async function companionHealth(): Promise<{
  ready: boolean;
  detail: string;
}> {
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
