/**
 * Ai Chat desktop mount — production peer (Nervas + identity).
 * Peer: /api/v1/messages on peerApiBase(8035). Requires ECC Bearer from desktop login.
 */
import { useEffect, useRef, useState } from "react";
import { getEccToken } from "@/api/eccAuth";
import { peerApiBase } from "@/api/peerBase";
import { cn } from "@/lib/cn";
import type { MountProps } from "./registry";

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

type NervasHealth = {
  ready: boolean;
  backend?: string | null;
  detail?: string | null;
};

const PEER = peerApiBase(8035, import.meta.env.VITE_AI_CHAT_API_BASE);

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getEccToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function probeHealth(): Promise<NervasHealth> {
  const res = await fetch(`${PEER}/api/v1/health`);
  if (!res.ok) return { ready: false, detail: `health ${res.status}` };
  const body = (await res.json()) as {
    nervas?: NervasHealth;
  };
  return body.nervas ?? { ready: false, detail: "missing nervas block" };
}

async function listMessages(): Promise<ChatMessage[]> {
  const res = await fetch(`${PEER}/api/v1/messages?limit=50`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`list failed HTTP ${res.status}`);
  const data = (await res.json()) as { messages?: ChatMessage[] };
  return data.messages ?? [];
}

async function sendMessage(content: string): Promise<void> {
  const res = await fetch(`${PEER}/api/v1/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`send failed HTTP ${res.status}`);
}

export function AiChatMount(_props: MountProps) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [nervas, setNervas] = useState<NervasHealth | null>(null);
  const [tokenPresent, setTokenPresent] = useState(() => Boolean(getEccToken()));
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void probeHealth()
      .then(setNervas)
      .catch((err) =>
        setNervas({
          ready: false,
          detail: err instanceof Error ? err.message : "health failed",
        }),
      );
  }, []);

  useEffect(() => {
    if (!tokenPresent) {
      setStatus("Sign in via Autonomous (ECC) so a Bearer token is available.");
      return;
    }
    void listMessages()
      .then((msgs) => {
        setTranscript(msgs);
        setStatus(null);
      })
      .catch((err) =>
        setStatus(err instanceof Error ? err.message : "load failed"),
      );
  }, [tokenPresent]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, busy]);

  const onSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    if (!getEccToken()) {
      setTokenPresent(false);
      setStatus("Sign in via Autonomous (ECC) first — identity is required.");
      return;
    }
    setTokenPresent(true);
    setBusy(true);
    setStatus("Sending…");
    setMessage("");
    try {
      await sendMessage(trimmed);
      setTranscript(await listMessages());
      setStatus("ok");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "send failed");
    } finally {
      setBusy(false);
    }
  };

  const nervasLabel = nervas
    ? nervas.ready
      ? `Nervas ready${nervas.backend ? ` · ${nervas.backend}` : ""}`
      : `Nervas not ready${nervas.detail ? ` · ${nervas.detail}` : ""}`
    : "Nervas probing…";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="border-b border-white/10 pb-2">
        <p className="font-display text-ink">Ai Chat</p>
        <p className="text-xs text-ink-muted">
          Production companion · peer :8035 · {nervasLabel}
        </p>
      </header>
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10",
            "bg-black/10",
          )}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 text-sm">
            {!tokenPresent ? (
              <p className="text-xs text-ink-muted">
                Identity required. Open Autonomous, sign in, then return here — messages
                use your ECC Bearer against the living peer (no anonymous / no ack:).
              </p>
            ) : transcript.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Ask anything — replies come from living Nervas via ai_chat.
              </p>
            ) : (
              transcript.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "rounded-lg px-3 py-2",
                    m.role === "user"
                      ? "ml-8 bg-signal/10 text-ink"
                      : "mr-8 bg-white/5 text-ink",
                  )}
                >
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-ink-muted">
                    {m.role === "user" ? "You" : "Assistant"}
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
          {status ? (
            <p
              className="border-t border-white/10 px-4 py-2 text-xs text-ink-muted"
              role="status"
            >
              {status}
            </p>
          ) : null}
        </section>
        <section className="flex min-h-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <label className="text-xs text-ink-muted" htmlFor="ai_chat-input">
            Message
          </label>
          <textarea
            id="ai_chat-input"
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
            rows={6}
            disabled={busy || !nervas?.ready}
            placeholder="Ask the companion…"
            className="min-h-[8rem] flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={busy || !message.trim() || !nervas?.ready}
            className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal hover:bg-signal/20 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </section>
      </div>
    </div>
  );
}
