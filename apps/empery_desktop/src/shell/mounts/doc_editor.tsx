/**
 * TipTap doc editor mount — adapted from EliteEW DocEditorV2Core
 * (reference/eliteew/packs/doc_editor/). Local draft + Nervas rewrite/improve.
 */
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState } from "react";
import {
  assistDocument,
  nervasHealth,
  type AssistMode,
} from "@/api/docEditorAssist";
import { cn } from "@/lib/cn";
import {
  offerDocToSite,
  onStudioHandoff,
  requestLaunchApp,
  takeCompanionPromptHandoff,
  takeSiteToDocHandoff,
} from "@/shell/studioHandoff";
import type { MountProps } from "./registry";

function htmlToPlain(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body?.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

const STORAGE_KEY = "empery.desktop.doc_editor.draft";

type Draft = {
  title: string;
  contentHtml: string;
  plainText: string;
};

const EMPTY: Draft = {
  title: "Untitled",
  contentHtml: "<p></p>",
  plainText: "",
};

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      title: typeof parsed.title === "string" ? parsed.title : EMPTY.title,
      contentHtml:
        typeof parsed.contentHtml === "string"
          ? parsed.contentHtml
          : EMPTY.contentHtml,
      plainText:
        typeof parsed.plainText === "string" ? parsed.plainText : EMPTY.plainText,
    };
  } catch {
    return EMPTY;
  }
}

function persist(draft: Draft) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "<p></p>";
  return paragraphs
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function DocEditorMount(_props: MountProps) {
  const [draft, setDraft] = useState<Draft>(() => loadDraft());
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [peer, setPeer] = useState("checking Nervas…");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: draft.contentHtml,
    editable: true,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "doc-editor-prosemirror min-h-[20rem] outline-none text-base leading-8 text-ink",
        "aria-label": "Document editor",
      },
    },
    onUpdate: ({ editor: next }) => {
      setDraft((prev) => ({
        ...prev,
        contentHtml: next.getHTML(),
        plainText: next.getText({ blockSeparator: "\n\n" }),
      }));
    },
  });

  useEffect(() => {
    let cancelled = false;
    void nervasHealth().then((h) => {
      if (cancelled) return;
      setPeer(h.ready ? `Nervas ready (${h.detail})` : `Nervas down: ${h.detail}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const consumeInbound = () => {
      const fromSite = takeSiteToDocHandoff();
      if (fromSite) {
        const plain = htmlToPlain(fromSite.html);
        const next: Draft = {
          title: fromSite.title || "From Site Studio",
          contentHtml: fromSite.html,
          plainText: plain,
        };
        setDraft(next);
        persist(next);
        setStatus("HTML received from Site Studio");
        setSavedAt(new Date().toLocaleTimeString());
        return;
      }
      const handoff = takeCompanionPromptHandoff("doc_editor");
      if (!handoff) return;
      const html = textToHtml(handoff.text);
      setDraft((prev) => {
        const title =
          prev.title.trim() && prev.title !== "Untitled"
            ? prev.title
            : "From Companion";
        const next: Draft = {
          title,
          contentHtml: html,
          plainText: handoff.text,
        };
        persist(next);
        return next;
      });
      setStatus("Text received from EWA Companion");
      setSavedAt(new Date().toLocaleTimeString());
    };
    consumeInbound();
    return onStudioHandoff(() => consumeInbound());
  }, []);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.getHTML() === draft.contentHtml) return;
    editor.commands.setContent(draft.contentHtml, { emitUpdate: false });
  }, [draft.contentHtml, editor]);

  const save = () => {
    const next: Draft = editor
      ? {
          ...draft,
          contentHtml: editor.getHTML(),
          plainText: editor.getText({ blockSeparator: "\n\n" }),
        }
      : draft;
    setDraft(next);
    persist(next);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const openInSiteStudio = () => {
    if (!editor) return;
    const selected = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      "\n\n",
    );
    const body =
      selected.trim() ||
      editor.getText({ blockSeparator: "\n\n" }) ||
      draft.plainText;
    const title = draft.title.trim() || "Untitled";
    const topic =
      body
        .split(/\n+/)
        .map((line) => line.trim())
        .find(Boolean)
        ?.slice(0, 120) || title;
    const brief = body.trim().slice(0, 4000) || title;
    if (!brief.trim()) {
      setStatus("Add some document text before opening Site Studio.");
      return;
    }
    offerDocToSite({ title, topic, brief });
    requestLaunchApp("site_studio");
    setStatus("Opened Site Studio with this document");
  };

  const runAssist = async (mode: AssistMode) => {
    if (!editor || busy) return;
    const selected = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      "\n\n",
    );
    const source = selected.trim() || editor.getText({ blockSeparator: "\n\n" });
    setBusy(true);
    setStatus(mode === "rewrite" ? "Rewriting via Nervas…" : "Improving via Nervas…");
    try {
      const res = await assistDocument(mode, source);
      if (selected.trim()) {
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: editor.state.selection.from, to: editor.state.selection.to },
            textToHtml(res.text),
          )
          .run();
      } else {
        editor.commands.setContent(textToHtml(res.text), { emitUpdate: true });
      }
      const next: Draft = {
        ...draft,
        contentHtml: editor.getHTML(),
        plainText: editor.getText({ blockSeparator: "\n\n" }),
      };
      setDraft(next);
      persist(next);
      setSavedAt(new Date().toLocaleTimeString());
      setStatus(res.model ? `via ${res.backend} · ${res.model}` : res.backend);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "assist failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-1 pb-2">
        <div className="min-w-0 flex-1">
          <input
            value={draft.title}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, title: e.currentTarget.value }))
            }
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-ink outline-none focus:border-white/20 focus:bg-white/5"
            aria-label="Document title"
          />
          <p className="px-2 text-[10px] text-ink-muted">{peer}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted">
            {savedAt ? `Saved ${savedAt}` : "Local draft"}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAssist("improve")}
            className="rounded-md border border-white/15 px-2 py-1 text-xs text-ink hover:bg-white/5 disabled:opacity-50"
          >
            Improve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAssist("rewrite")}
            className="rounded-md border border-white/15 px-2 py-1 text-xs text-ink hover:bg-white/5 disabled:opacity-50"
          >
            Rewrite
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={openInSiteStudio}
            className="rounded-md border border-white/15 px-2 py-1 text-xs text-ink hover:bg-white/5 disabled:opacity-50"
          >
            Open in Site Studio
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md border border-signal/40 bg-signal/10 px-2 py-1 text-xs text-signal hover:bg-signal/20 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
      {status ? (
        <p className="border-b border-white/10 px-3 py-1 text-xs text-ink-muted" role="status">
          {status}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div
          className={cn(
            "mx-auto min-h-full max-w-3xl rounded-xl border border-white/10",
            "bg-black/20 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
          )}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
