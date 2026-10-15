/**
 * Site Studio mount — adapted from EliteEW UserSiteStudio journey (setup → AI fill → review).
 * Calls Empery site_studio → EIC Nervas for HTML preview. Admin/provisioning out of scope.
 */
import { useEffect, useState } from "react";
import {
  generatePreview,
  siteStudioHealth,
  type PreviewResponse,
} from "@/api/siteStudio";
import { cn } from "@/lib/cn";
import {
  offerSiteToDoc,
  onStudioHandoff,
  requestLaunchApp,
  takeCompanionPromptHandoff,
  takeDocToSiteHandoff,
} from "@/shell/studioHandoff";
import type { MountProps } from "./registry";

const STEPS = ["setup", "ai_fill", "review"] as const;

function textToSiteFields(text: string): {
  title: string;
  topic: string;
  brief: string;
} {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0] || "From Companion";
  return {
    title: first.slice(0, 80),
    topic: first.slice(0, 120),
    brief: text.trim().slice(0, 4000),
  };
}

function downloadHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SiteStudioMount(_props: MountProps) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [brief, setBrief] = useState("");
  const [peer, setPeer] = useState("checking Nervas…");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [step, setStep] = useState<(typeof STEPS)[number]>("setup");
  const [handoffNote, setHandoffNote] = useState<string | null>(null);

  const consumeHandoff = () => {
    const fromDoc = takeDocToSiteHandoff();
    if (fromDoc) {
      setTitle(fromDoc.title);
      setTopic(fromDoc.topic);
      setBrief(fromDoc.brief);
      setPreview(null);
      setStep("setup");
      setHandoffNote(`From Doc Editor · ${fromDoc.title || "Untitled"}`);
      setStatus("Document received — review fields and Generate preview");
      return;
    }
    const fromCompanion = takeCompanionPromptHandoff("site_studio");
    if (!fromCompanion) return;
    const fields = textToSiteFields(fromCompanion.text);
    setTitle(fields.title);
    setTopic(fields.topic);
    setBrief(fields.brief);
    setPreview(null);
    setStep("setup");
    setHandoffNote("From EWA Companion");
    setStatus("Brief received — review fields and Generate preview");
  };

  useEffect(() => {
    let cancelled = false;
    void siteStudioHealth().then((h) => {
      if (cancelled) return;
      setPeer(h.ready ? `Nervas ready (${h.detail})` : `Nervas down: ${h.detail}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    consumeHandoff();
    return onStudioHandoff(() => consumeHandoff());
  }, []);

  const onGenerate = async () => {
    if (!title.trim() || !topic.trim() || !brief.trim()) {
      setStatus("Fill title, topic, and brief first.");
      setStep("setup");
      return;
    }
    setBusy(true);
    setStep("ai_fill");
    setStatus("Generating landing HTML via Nervas…");
    setPreview(null);
    try {
      const res = await generatePreview({
        title: title.trim(),
        topic: topic.trim(),
        brief: brief.trim(),
        language: "ru",
      });
      setPreview(res);
      setStep("review");
      setStatus(
        res.model ? `via ${res.backend} · ${res.model}` : res.backend || "ready",
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "preview failed");
      setStep("setup");
    } finally {
      setBusy(false);
    }
  };

  const onDownload = () => {
    if (!preview?.html) return;
    const name = (preview.title || title || "site-preview")
      .trim()
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 64);
    downloadHtml(name || "site-preview", preview.html);
    setStatus("Downloaded HTML preview");
  };

  const onOpenInDoc = () => {
    if (!preview?.html) return;
    // TipTap wants a fragment, not a full document — prefer <body> contents.
    let fragment = preview.html;
    try {
      const doc = new DOMParser().parseFromString(preview.html, "text/html");
      fragment = doc.body?.innerHTML?.trim() || preview.html;
    } catch {
      /* keep full html */
    }
    offerSiteToDoc({
      title: preview.title || title || "Site preview",
      html: fragment,
    });
    requestLaunchApp("doc_editor");
    setStatus("Opened Doc Editor with site HTML");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="border-b border-white/10 pb-2">
        <p className="font-display text-ink">Site Studio</p>
        <p className="text-xs text-ink-muted">
          User journey preview via <code className="text-signal">site_studio</code> →
          Nervas · {peer}
        </p>
        {handoffNote ? (
          <p className="mt-1 text-xs text-signal">{handoffNote}</p>
        ) : null}
        <ol className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-ink-muted">
          {STEPS.map((id) => (
            <li
              key={id}
              className={cn(
                "rounded border px-2 py-0.5",
                step === id
                  ? "border-signal/50 text-signal"
                  : "border-white/10",
              )}
            >
              {id.replace("_", " ")}
            </li>
          ))}
        </ol>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <section className="flex min-h-0 flex-col gap-2 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3">
          <label className="text-xs text-ink-muted" htmlFor="site-title">
            Title
          </label>
          <input
            id="site-title"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.currentTarget.value)}
            placeholder="Aurora Cafe"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40 disabled:opacity-60"
          />
          <label className="text-xs text-ink-muted" htmlFor="site-topic">
            Topic
          </label>
          <input
            id="site-topic"
            value={topic}
            disabled={busy}
            onChange={(e) => setTopic(e.currentTarget.value)}
            placeholder="neighborhood coffee shop"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40 disabled:opacity-60"
          />
          <label className="text-xs text-ink-muted" htmlFor="site-brief">
            Brief
          </label>
          <textarea
            id="site-brief"
            value={brief}
            disabled={busy}
            onChange={(e) => setBrief(e.currentTarget.value)}
            rows={7}
            placeholder="Tone, audience, must-have sections…"
            className="min-h-[8rem] flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-signal/40 disabled:opacity-60"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onGenerate()}
              disabled={busy}
              className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal hover:bg-signal/20 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate preview"}
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={!preview?.html || busy}
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-ink hover:bg-white/5 disabled:opacity-50"
            >
              Download HTML
            </button>
            <button
              type="button"
              onClick={onOpenInDoc}
              disabled={!preview?.html || busy}
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-ink hover:bg-white/5 disabled:opacity-50"
            >
              Open in Doc Editor
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
            "flex min-h-0 flex-col overflow-hidden rounded-xl border border-dashed border-white/15",
            "bg-black/10",
          )}
        >
          {preview ? (
            <iframe
              title={preview.title || "Site preview"}
              srcDoc={preview.html}
              sandbox=""
              className="h-full min-h-[16rem] w-full flex-1 bg-white"
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-4 text-center text-sm text-ink-muted">
              <p className="font-display text-ink">Preview</p>
              <p className="mt-1 max-w-xs text-xs">
                Landing HTML from Nervas appears here. Publish/runtime provisioning
                stays out of scope.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
