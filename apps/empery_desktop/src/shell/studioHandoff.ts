/**
 * Cross-studio handoffs on Empery Desktop
 * (Image → Video, Doc ↔ Site, Companion → Image/Music/Doc/Site/Video).
 * In-memory only — blobs are not persisted.
 */

export type ImageToVideoHandoff = {
  file: File;
  promptHint?: string;
  from: "image_studio";
  at: number;
};

export type DocToSiteHandoff = {
  title: string;
  topic: string;
  brief: string;
  from: "doc_editor";
  at: number;
};

export type CompanionPromptTarget =
  | "image_studio"
  | "music_forge"
  | "doc_editor"
  | "site_studio"
  | "video_studio";

export type CompanionPromptHandoff = {
  text: string;
  target: CompanionPromptTarget;
  from: "ewa_companion";
  at: number;
};

export type SiteToDocHandoff = {
  title: string;
  html: string;
  from: "site_studio";
  at: number;
};

const LAUNCH_EVENT = "empery:launch-app";
const HANDOFF_EVENT = "empery:studio-handoff";

let pendingImageToVideo: ImageToVideoHandoff | null = null;
let pendingDocToSite: DocToSiteHandoff | null = null;
let pendingCompanionPrompt: CompanionPromptHandoff | null = null;
let pendingSiteToDoc: SiteToDocHandoff | null = null;

export function offerImageToVideo(file: File, promptHint?: string): void {
  pendingImageToVideo = {
    file,
    promptHint: promptHint?.trim() || undefined,
    from: "image_studio",
    at: Date.now(),
  };
  window.dispatchEvent(
    new CustomEvent(HANDOFF_EVENT, { detail: { kind: "image_to_video" } }),
  );
}

export function takeImageToVideoHandoff(): ImageToVideoHandoff | null {
  const value = pendingImageToVideo;
  pendingImageToVideo = null;
  return value;
}

export function peekImageToVideoHandoff(): ImageToVideoHandoff | null {
  return pendingImageToVideo;
}

export function offerDocToSite(payload: {
  title: string;
  topic: string;
  brief: string;
}): void {
  pendingDocToSite = {
    title: payload.title.trim(),
    topic: payload.topic.trim(),
    brief: payload.brief.trim(),
    from: "doc_editor",
    at: Date.now(),
  };
  window.dispatchEvent(
    new CustomEvent(HANDOFF_EVENT, { detail: { kind: "doc_to_site" } }),
  );
}

export function takeDocToSiteHandoff(): DocToSiteHandoff | null {
  const value = pendingDocToSite;
  pendingDocToSite = null;
  return value;
}

export function peekDocToSiteHandoff(): DocToSiteHandoff | null {
  return pendingDocToSite;
}

export function offerCompanionPrompt(
  target: CompanionPromptTarget,
  text: string,
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  pendingCompanionPrompt = {
    text: trimmed,
    target,
    from: "ewa_companion",
    at: Date.now(),
  };
  window.dispatchEvent(
    new CustomEvent(HANDOFF_EVENT, {
      detail: { kind: "companion_prompt", target },
    }),
  );
}

export function takeCompanionPromptHandoff(
  target: CompanionPromptTarget,
): CompanionPromptHandoff | null {
  if (!pendingCompanionPrompt || pendingCompanionPrompt.target !== target) {
    return null;
  }
  const value = pendingCompanionPrompt;
  pendingCompanionPrompt = null;
  return value;
}

export function offerSiteToDoc(payload: { title: string; html: string }): void {
  const html = payload.html.trim();
  if (!html) return;
  pendingSiteToDoc = {
    title: payload.title.trim() || "Site preview",
    html,
    from: "site_studio",
    at: Date.now(),
  };
  window.dispatchEvent(
    new CustomEvent(HANDOFF_EVENT, { detail: { kind: "site_to_doc" } }),
  );
}

export function takeSiteToDocHandoff(): SiteToDocHandoff | null {
  const value = pendingSiteToDoc;
  pendingSiteToDoc = null;
  return value;
}

export function requestLaunchApp(appComponent: string): void {
  window.dispatchEvent(
    new CustomEvent(LAUNCH_EVENT, { detail: { appComponent } }),
  );
}

export function onLaunchAppRequest(
  handler: (appComponent: string) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ appComponent?: string }>).detail;
    const app = detail?.appComponent?.trim();
    if (app) handler(app);
  };
  window.addEventListener(LAUNCH_EVENT, listener);
  return () => window.removeEventListener(LAUNCH_EVENT, listener);
}

export function onStudioHandoff(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(HANDOFF_EVENT, listener);
  return () => window.removeEventListener(HANDOFF_EVENT, listener);
}
