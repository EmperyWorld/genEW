/**
 * EWA Companion mount — adapted from EliteEW CompanionSlim
 * (reference/eliteew/packs/ewa_companion/). Calls EIC Nervas → living LLM.
 */
import { useEffect, useRef, useState } from "react";
import {
  companionChat,
  companionHealth,
  type ChatMessage,
} from "@/api/ewaCompanion";
import { cn } from "@/lib/cn";
import {
  offerCompanionPrompt,
  requestLaunchApp,
  type CompanionPromptTarget,
} from "@/shell/studioHandoff";
import type { MountProps } from "./registry";

export function EwaCompanionMount(_props: MountProps) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [peer, setPeer] = useState<string>("checking Nervas…");
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const handoffText = (): string => {
    const draft = message.trim();
    if (draft) return draft;
    for (let i = transcript.length - 1; i >= 0; i -= 1) {
      const turn = transcript[i];
      if (turn.role === "user" && turn.content.trim()) return turn.content.trim();
    }
    for (let i = transcript.length - 1; i >= 0; i -= 1) {
      const turn = transcript[i];
      if (turn.role === "assistant" && turn.content.trim()) {
        return turn.content.trim();
      }
    }
    return "";
  };

  const sendToStudio = (target: CompanionPromptTarget) => {
    const text = handoffText();
    if (!text) {
      setStatus("Type or chat something first, then send it to a studio.");
      return;
    }
    offerCompanionPrompt(target, text);
    requestLaunchApp(target);
    const labels: Record<CompanionPromptTarget, string> = {
      image_studio: "Image Studio",
      music_forge: "MusicForge",
      doc_editor: "Doc Editor",
      site_studio: "Site Studio",
      video_studio: "Video Studio",
    };
    setStatus(`Opened ${labels[target]} with this text`);
  };

  useEffect(() => {
    let cancelled = false;
    void companionHealth().then((h) => {
      if (cancelled) return;
      setPeer(h.ready ? `Nervas ready (${h.detail})` : `Nervas down: ${h.detail}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, busy]);

  const onSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setStatus("Thinking…");
    setMessage("");
    const prior = transcript;
    setTranscript((t) => [...t, { role: "user", content: trimmed }]);
    try {
      const res = await companionChat(prior, trimmed);
      const reply = res.message?.content?.trim() || "(empty reply)";
      setTranscript((t) => [
        ...t,
        { role: "assistant", content: reply },
      ]);
      setStatus(res.model ? `via ${res.backend} · ${res.model}` : res.backend);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "chat failed");
      setTranscript((t) => [
        ...t,
        {
          role: "assistant",
          content: "Sorry — Nervas request failed. Check EIC :8007 and the living brain.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="border-b border-white/10 pb-2">
        <p className="font-display text-ink">EWA Companion</p>
        <p className="text-xs text-ink-muted">{peer}</p>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10",
            "bg-black/10",
          )}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 text-sm">
            {transcript.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Ask anything — replies come from EIC Nervas → living LLM
                (no FakeAI).
              </p>
            ) : (
              transcript.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={cn(
                    "rounded-lg px-3 py-2",
                    m.role === "user"
                      ? "ml-8 bg-signal/10 text-ink"
                      : "mr-8 bg-white/5 text-ink",
                  )}
                >
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-ink-muted">
                    {m.role === "user" ? "You" : "Companion"}
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
          {status ? (
            <p className="border-t border-white/10 px-4 py-2 text-xs text-ink-muted" role="status">
              {status}
            </p>
          ) : null}
        </section>

        <section className="flex min-h-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <label className="text-xs text-ink-muted" htmlFor="ewa-companion-input">
            Message
          </label>
          <textarea
            id="ewa-companion-input"
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
            rows={6}
            disabled={busy}
            placeholder="Ask the companion…"
            className="min-h-[8rem] flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={busy}
            className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal hover:bg-signal/20 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send"}
          </button>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => sendToStudio("image_studio")}
              className="rounded-md border border-white/15 px-2 py-1 text-xs text-ink hover:bg-white/5 disabled:opacity-50"
            >
              → Image Studio
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => sendToStudio("music_forge")}
              className="rounded-md border border-white/15 px-2 py-1 text-xs text-ink hover:bg-white/5 disabled:opacity-50"
            >
              → MusicForge
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => sendToStudio("doc_editor")}
              className="rounded-md border border-white/15 px-2 py-1 text-xs text-ink hover:bg-white/5 disabled:opacity-50"
            >
              → Doc Editor
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => sendToStudio("site_studio")}
              className="rounded-md border border-white/15 px-2 py-1 text-xs text-ink hover:bg-white/5 disabled:opacity-50"
            >
              → Site Studio
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => sendToStudio("video_studio")}
              className="rounded-md border border-white/15 px-2 py-1 text-xs text-ink hover:bg-white/5 disabled:opacity-50"
            >
              → Video Studio
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
