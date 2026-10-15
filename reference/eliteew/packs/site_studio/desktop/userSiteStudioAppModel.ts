/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared types, empty-state constants, and pure helpers for UserSiteStudioApp.
 *
 * Invariants:
 * - No React hooks or HTTP side effects.
 *
 * Related:
 * - features/site-studio/desktop/UserSiteStudioApp.tsx
 */
import type { ProfessionalWorldsSiteStudioDraft } from '@/features/professional-worlds/desktop/professionalWorldsCrossAppDraft';
import type {
	SiteStudioContentDraft,
	SiteStudioDraftState,
	SiteStudioFirstRunForm,
	SiteStudioImageDraft,
	SiteStudioInstance,
	SiteStudioSeoDraft,
} from './api';

export type SiteStudioTab =
	| 'setup'
	| 'ai'
	| 'content'
	| 'media'
	| 'autofill'
	| 'admin';
export type SiteStudioPanelKey =
	| 'setup'
	| 'ai'
	| 'content'
	| 'media'
	| 'autofill'
	| 'admin';

/** One-shot migrate legacy peer-tab id `imperorg` → `autofill`. */
export function normalizeSiteStudioTabId(tabId: string): SiteStudioTab | null {
	const raw = tabId === 'imperorg' ? 'autofill' : tabId;
	if (
		raw === 'setup' ||
		raw === 'ai' ||
		raw === 'content' ||
		raw === 'media' ||
		raw === 'autofill' ||
		raw === 'admin'
	) {
		return raw;
	}
	return null;
}
export type VoiceTarget = 'brief' | 'assistant';

export type UserSiteStudioAppProps = {
	/** Professional Worlds realtor handoff; only prefills Site Studio setup/assistant surfaces. */
	initialProfessionalWorldsDraft?: ProfessionalWorldsSiteStudioDraft | null;
};

export const EMPTY_FORM: SiteStudioFirstRunForm = {
	site_title: '',
	site_topic: '',
	brief: '',
};
export const EMPTY_DRAFT_STATE: SiteStudioDraftState = {
	brief: '',
	siteBlueprint: null,
	assistantMessages: [],
	contentDrafts: [],
	seoDrafts: [],
	imageDrafts: [],
};
export const EMPTY_PANEL_ERRORS: Record<SiteStudioPanelKey, string | null> = {
	setup: null,
	ai: null,
	content: null,
	media: null,
	autofill: null,
	admin: null,
};
export const WORKSPACE_SCROLL_AREA_CLASS =
	'min-h-0 flex-1 overflow-y-auto pr-1';

export function getRequestStatusCode(error: unknown): number | null {
	if (typeof error !== 'object' || error === null) {
		return null;
	}
	const e = error as {
		statusCode?: unknown;
		response?: { status?: unknown };
		status?: unknown;
	};
	const rawStatus = e.statusCode ?? e.response?.status ?? e.status;
	return typeof rawStatus === 'number' ? rawStatus : null;
}

export function getUnknownErrorMessage(
	error: unknown,
	fallback: string
): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return fallback;
}

/** Fallback when `GET .../ai/drafts` is unavailable; canonical drafts come from that endpoint in `refreshWorkspace`. */
export function deriveDraftStateFromInstance(
	instance: SiteStudioInstance | null
): SiteStudioDraftState {
	if (!instance) {
		return EMPTY_DRAFT_STATE;
	}

	const raw = instance.brief_json ?? {};
	const siteBlueprint =
		raw.siteBlueprint &&
		typeof raw.siteBlueprint === 'object' &&
		!Array.isArray(raw.siteBlueprint)
			? (raw.siteBlueprint as Record<string, unknown>)
			: null;

	return {
		brief: String(raw.brief ?? instance.site_topic ?? ''),
		siteBlueprint,
		assistantMessages: Array.isArray(raw.assistantMessages)
			? (raw.assistantMessages as SiteStudioDraftState['assistantMessages'])
			: [],
		contentDrafts: Array.isArray(raw.contentDrafts)
			? (raw.contentDrafts as SiteStudioContentDraft[])
			: [],
		seoDrafts: Array.isArray(raw.seoDrafts)
			? (raw.seoDrafts as SiteStudioSeoDraft[])
			: [],
		imageDrafts: Array.isArray(raw.imageDrafts)
			? (raw.imageDrafts as SiteStudioImageDraft[])
			: [],
	};
}

export function appendVoiceText(previous: string, nextText: string): string {
	const trimmedNext = nextText.trim();
	if (!trimmedNext) return previous;
	return previous.trim() ? `${previous.trim()}\n${trimmedNext}` : trimmedNext;
}

export function getBlueprintValue(
	blueprint: Record<string, unknown> | null | undefined,
	key: string
): string {
	if (!blueprint) return '';
	const value = blueprint[key];
	if (Array.isArray(value)) {
		return value.map((item) => String(item)).join(', ');
	}
	return typeof value === 'string' ? value : '';
}
