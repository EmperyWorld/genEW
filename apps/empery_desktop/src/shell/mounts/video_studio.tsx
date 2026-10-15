/**
 * Video Studio mount — adapted from EliteEW VideoStudio
 * (reference/eliteew/packs/video_studio/). Calls Empery video_studio → Comfy Wan I2V.
 * Accepts Image Studio handoff (source image + motion hint).
 */
import { useEffect, useState } from "react";
import {
  generateVideo,
  videoStudioHealth,
  videoUrl,
  waitForJob,
  type VideoRef,
} from "@/api/videoStudio";
import { cn } from "@/lib/cn";
import { downloadFromUrl } from "@/shell/downloadMedia";
import {
  onStudioHandoff,
  takeCompanionPromptHandoff,
  takeImageToVideoHandoff,
} from "@/shell/studioHandoff";
import type { MountProps } from "./registry";

export function VideoStudioMount(_props: MountProps) {
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [peer, setPeer] = useState("checking Comfy…");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VideoRef | null>(null);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);

  const consumeHandoff = () => {
    const fromImage = takeImageToVideoHandoff();
    if (fromImage) {
      setFile(fromImage.file);
      if (fromImage.promptHint) {
        setPrompt(fromImage.promptHint);
      }
      setResult(null);
      setHandoffNote(`From Image Studio · ${fromImage.file.name}`);
      setStatus("Source image received — edit motion prompt and Generate");
      return;
    }
    const fromCompanion = takeCompanionPromptHandoff("video_studio");
    if (!fromCompanion) return;
    setPrompt(fromCompanion.text);
    setResult(null);
    setHandoffNote("From EWA Companion");
    setStatus(
      "Motion prompt received — choose a source image if needed, then Generate",
    );
  };

  useEffect(() => {
    let cancelled = false;
    void videoStudioHealth().then((h) => {
      if (cancelled) return;
      setPeer(h.ready ? `Comfy ready (${h.detail})` : `Comfy down: ${h.detail}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    consumeHandoff();
    return onStudioHandoff(() => consumeHandoff());
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onDownload = async () => {
    if (!result) return;
    try {
      await downloadFromUrl(
        videoUrl(result),
        result.filename || "video_studio.mp4",
      );
      setStatus("Downloaded video");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "download failed");
    }
  };

  const onGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setStatus("Enter a motion prompt first.");
      return;
    }
    if (!file) {
      setStatus("Choose a source image for Wan I2V.");
      return;
    }
    setBusy(true);
    setResult(null);
    setStatus("Uploading + queuing on ComfyUI…");
    try {
      const { prompt_id } = await generateVideo({
        prompt: trimmed,
        image: file,
      });
      setStatus(`Job ${prompt_id.slice(0, 8)}… running (Wan can take several minutes)`);
      const job = await waitForJob(prompt_id);
      if (job.status === "failed") {
        setStatus(job.error || "Generation failed");
        return;
      }
      const vid = job.videos[0];
      if (!vid) {
        setStatus("Completed but no video returned");
        return;
      }
      setResult(vid);
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
        <p className="font-display text-ink">Video Studio</p>
        <p className="text-xs text-ink-muted">
          Image-to-video via <code className="text-signal">video_studio</code> → Wan 2.2 · {peer}
        </p>
        {handoffNote ? (
          <p className="mt-1 text-[10px] text-signal">{handoffNote}</p>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="flex min-h-0 flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <label className="text-xs text-ink-muted" htmlFor="video-studio-image">
            Source image
          </label>
          <input
            id="video-studio-image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => {
              setFile(e.currentTarget.files?.[0] ?? null);
              setHandoffNote(null);
            }}
            className="text-xs text-ink-muted file:mr-2 file:rounded-md file:border file:border-white/15 file:bg-black/30 file:px-2 file:py-1 file:text-ink"
          />
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Source"
              className="max-h-28 w-auto rounded-md object-contain"
            />
          ) : null}
          <label className="text-xs text-ink-muted" htmlFor="video-studio-prompt">
            Motion prompt
          </label>
          <textarea
            id="video-studio-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            rows={5}
            disabled={busy}
            placeholder="Describe camera motion / scene motion…"
            className="min-h-[7rem] flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40 disabled:opacity-60"
          />
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
            <video
              key={`${result.subfolder}/${result.filename}`}
              src={videoUrl(result)}
              controls
              className="max-h-full max-w-full rounded-lg"
            />
          ) : (
            <>
              <p className="font-display text-ink">Preview</p>
              <p className="mt-1 max-w-xs text-xs">
                Wan I2V results appear here after ComfyUI finishes the job.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
