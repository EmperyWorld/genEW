/**
 * Image Studio mount — chrome adapted from EliteEW CreativeStudio / ImageStudio
 * (reference/eliteew/packs/studios/). Calls Empery image_studio → ComfyUI.
 * Handoff: Animate → Video Studio (Wan I2V).
 */
import { useEffect, useState } from "react";
import {
  generateImage,
  imageUrl,
  waitForJob,
  type ImageRef,
} from "@/api/imageStudio";
import { cn } from "@/lib/cn";
import { downloadFromUrl } from "@/shell/downloadMedia";
import {
  offerImageToVideo,
  onStudioHandoff,
  requestLaunchApp,
  takeCompanionPromptHandoff,
} from "@/shell/studioHandoff";
import type { MountProps } from "./registry";

export function ImageStudioMount(_props: MountProps) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [result, setResult] = useState<ImageRef | null>(null);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);

  const consumeCompanion = () => {
    const handoff = takeCompanionPromptHandoff("image_studio");
    if (!handoff) return;
    setPrompt(handoff.text);
    setResult(null);
    setHandoffNote("From EWA Companion");
    setStatus("Prompt received — edit and Generate");
  };

  useEffect(() => {
    consumeCompanion();
    return onStudioHandoff(() => consumeCompanion());
  }, []);

  const onGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setStatus("Enter a prompt first.");
      return;
    }
    setBusy(true);
    setResult(null);
    setStatus("Queuing on ComfyUI…");
    try {
      const { prompt_id } = await generateImage({ prompt: trimmed });
      setStatus(`Job ${prompt_id.slice(0, 8)}… running`);
      const job = await waitForJob(prompt_id);
      if (job.status === "failed") {
        setStatus(job.error || "Generation failed");
        return;
      }
      const img = job.images[0];
      if (!img) {
        setStatus("Completed but no image returned");
        return;
      }
      setResult(img);
      setStatus("Done");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "generate failed");
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async () => {
    if (!result) return;
    try {
      await downloadFromUrl(
        imageUrl(result),
        result.filename || "image_studio.png",
      );
      setStatus("Downloaded image");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "download failed");
    }
  };

  const onAnimate = async () => {
    if (!result || handoffBusy) return;
    setHandoffBusy(true);
    setStatus("Sending to Video Studio…");
    try {
      const res = await fetch(imageUrl(result));
      if (!res.ok) {
        throw new Error(`fetch image failed: ${res.status}`);
      }
      const blob = await res.blob();
      const name = result.filename || "image_studio.png";
      const file = new File([blob], name, {
        type: blob.type || "image/png",
      });
      const motionHint = prompt.trim()
        ? `Subtle cinematic motion from: ${prompt.trim()}`
        : "Camera slowly orbits the subject, cinematic light";
      offerImageToVideo(file, motionHint);
      requestLaunchApp("video_studio");
      setStatus("Opened Video Studio with this image");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "handoff failed");
    } finally {
      setHandoffBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="border-b border-white/10 pb-2">
        <p className="font-display text-ink">Image Studio</p>
        <p className="text-xs text-ink-muted">
          Text-to-image via{" "}
          <code className="text-signal">image_studio</code> → ComfyUI
        </p>
        {handoffNote ? (
          <p className="mt-1 text-xs text-signal">{handoffNote}</p>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="flex min-h-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <label className="text-xs text-ink-muted" htmlFor="image-studio-prompt">
            Prompt
          </label>
          <textarea
            id="image-studio-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            rows={6}
            disabled={busy}
            placeholder="Describe the image…"
            className="min-h-[8rem] flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40 disabled:opacity-60"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onGenerate()}
              disabled={busy || handoffBusy}
              className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal hover:bg-signal/20 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate"}
            </button>
            <button
              type="button"
              onClick={() => void onAnimate()}
              disabled={!result || busy || handoffBusy}
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-ink hover:bg-white/5 disabled:opacity-50"
            >
              {handoffBusy ? "Sending…" : "Animate in Video Studio"}
            </button>
            <button
              type="button"
              onClick={() => void onDownload()}
              disabled={!result || busy || handoffBusy}
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
            <img
              src={imageUrl(result)}
              alt={prompt || "Generated"}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          ) : (
            <>
              <p className="font-display text-ink">Canvas</p>
              <p className="mt-1 max-w-xs text-xs">
                Results appear here after ComfyUI finishes the job.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
