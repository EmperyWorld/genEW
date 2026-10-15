/**
 * MusicForge mount — adapted from EliteEW MusicForge
 * (reference/eliteew/packs/music_forge/). Calls Empery music_forge → AceStep Comfy.
 */
import { useEffect, useState } from "react";
import {
  audioUrl,
  generateMusic,
  musicForgeHealth,
  waitForJob,
  type AudioRef,
} from "@/api/musicForge";
import { cn } from "@/lib/cn";
import { downloadFromUrl } from "@/shell/downloadMedia";
import {
  onStudioHandoff,
  takeCompanionPromptHandoff,
} from "@/shell/studioHandoff";
import type { MountProps } from "./registry";

export function MusicForgeMount(_props: MountProps) {
  const [prompt, setPrompt] = useState("");
  const [instrumental, setInstrumental] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [peer, setPeer] = useState("checking Comfy…");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AudioRef | null>(null);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);

  const consumeCompanion = () => {
    const handoff = takeCompanionPromptHandoff("music_forge");
    if (!handoff) return;
    setPrompt(handoff.text);
    setResult(null);
    setHandoffNote("From EWA Companion");
    setStatus("Intent received — edit and Generate");
  };

  useEffect(() => {
    let cancelled = false;
    void musicForgeHealth().then((h) => {
      if (cancelled) return;
      setPeer(h.ready ? `Comfy ready (${h.detail})` : `Comfy down: ${h.detail}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    consumeCompanion();
    return onStudioHandoff(() => consumeCompanion());
  }, []);

  const onDownload = async () => {
    if (!result) return;
    try {
      await downloadFromUrl(
        audioUrl(result),
        result.filename || "music_forge.mp3",
      );
      setStatus("Downloaded audio");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "download failed");
    }
  };

  const onGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setStatus("Enter a music intent first.");
      return;
    }
    setBusy(true);
    setResult(null);
    setStatus("Queuing on ComfyUI (AceStep)…");
    try {
      const { prompt_id } = await generateMusic({
        prompt: trimmed,
        instrumental,
      });
      setStatus(`Job ${prompt_id.slice(0, 8)}… running`);
      const job = await waitForJob(prompt_id);
      if (job.status === "failed") {
        setStatus(job.error || "Generation failed");
        return;
      }
      const track = job.audio[0];
      if (!track) {
        setStatus("Completed but no audio returned");
        return;
      }
      setResult(track);
      setStatus("Done");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "generate failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="border-b border-white/10 pb-2">
        <p className="font-display text-ink">MusicForge</p>
        <p className="text-xs text-ink-muted">
          Text-to-music via <code className="text-signal">music_forge</code> → AceStep 1.5 · {peer}
        </p>
        {handoffNote ? (
          <p className="mt-1 text-xs text-signal">{handoffNote}</p>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="flex min-h-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <label className="text-xs text-ink-muted" htmlFor="music-forge-prompt">
            Intent
          </label>
          <textarea
            id="music-forge-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            rows={6}
            disabled={busy}
            placeholder="Describe the track…"
            className="min-h-[8rem] flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40 disabled:opacity-60"
          />
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={instrumental}
              disabled={busy}
              onChange={(e) => setInstrumental(e.currentTarget.checked)}
            />
            Instrumental
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onGenerate()}
              disabled={busy}
              className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal hover:bg-signal/20 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate"}
            </button>
            <button
              type="button"
              onClick={() => void onDownload()}
              disabled={!result || busy}
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-ink hover:bg-white/5 disabled:opacity-50"
            >
              Download
            </button>
          </div>
          {status ? (
            <p className="text-xs text-ink-muted" role="status">
              {status}
            </p>
          ) : null}
        </section>

        <section
          className={cn(
            "flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15",
            "bg-black/10 p-4 text-center text-sm text-ink-muted",
          )}
        >
          {result ? (
            <audio
              key={`${result.subfolder}/${result.filename}`}
              src={audioUrl(result)}
              controls
              className="w-full max-w-md"
            />
          ) : (
            <>
              <p className="font-display text-ink">Player</p>
              <p className="mt-1 max-w-xs text-xs">
                AceStep results appear here after ComfyUI finishes the job.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
