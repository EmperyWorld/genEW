/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure helpers for building {@link WindowInitialPayload} and filtering restored windows for `desktop-open-app` deep links.
 *
 * Invariants:
 * - Only documented keys from callers are copied into payloads; stray keys on `DesktopOpenAppDetail` do not leak.
 * - Professional Worlds cross-app draft keys may target several apps, but still travel only as a one-shot
 *   sessionStorage pointer.
 *
 * Related:
 * - `hooks/useDesktopWorkspaceOpenAppEvent.ts`, `utils/desktopDeepLink.ts`
 */
import { DEFAULT_APPS } from '../constants';
import type {
	DesktopItem,
	DocEditorActiveTab,
	DocEditorOpenTarget,
	DocEditorTabSource,
	DocEditorTabTarget,
	PersistedWindowState,
	WindowInitialPayload,
} from '../types/desktop.types';
import {
	isEphemeralDesktopWindowComponent,
	isLegacyHiddenDesktopAppComponent,
} from './desktopAppRegistry';
import type { DesktopOpenAppDetail } from './desktopDeepLink';
import { normalizeContentManagerInitialFilterPayload } from './contentManagerFilterShortcut';

/**
 * Builds {@link WindowInitialPayload} for GAF Chat from `desktop-open-app` detail.
 * Only `targetUsername` / `targetChatId` are read so stray keys on `DesktopOpenAppDetail` never reach window state.
 */
export function buildGafChatOpenPayload(
	detail: DesktopOpenAppDetail | undefined | null
): WindowInitialPayload | undefined {
	if (!detail) return undefined;
	const targetUsername =
		typeof detail.targetUsername === 'string'
			? detail.targetUsername.trim()
			: '';
	const targetChatId =
		typeof detail.targetChatId === 'string' ? detail.targetChatId.trim() : '';
	if (!targetUsername && !targetChatId) return undefined;
	const out: WindowInitialPayload = {};
	if (targetUsername) out.targetUsername = targetUsername;
	if (targetChatId) out.targetChatId = targetChatId;
	return out;
}

/**
 * Builds {@link WindowInitialPayload} for Social Hub deep links.
 */
export function buildSocialHubOpenPayload(
	detail: DesktopOpenAppDetail | undefined | null
): WindowInitialPayload | undefined {
	if (!detail) return undefined;
	const rawTab = detail.socialHubTab;
	const tab =
		rawTab === 'overview' ||
		rawTab === 'inbox' ||
		rawTab === 'friends' ||
		rawTab === 'circles' ||
		rawTab === 'privacy' ||
		rawTab === 'profile' ||
		rawTab === 'mobile-app'
			? rawTab
			: undefined;
	const friendUserId = trimStringOrEmpty(detail.socialHubFriendUserId);
	if (!tab && !friendUserId) return undefined;
	return {
		...(tab ? { socialHubTab: tab } : {}),
		...(friendUserId ? { socialHubFriendUserId: friendUserId } : {}),
	};
}

/** GAF composer attachment from deep-link detail (companion image share, desktop file actions). */
export function buildGafComposerAttachmentOpenPayload(
	detail: DesktopOpenAppDetail | undefined | null
): WindowInitialPayload | undefined {
	if (!detail) return undefined;
	const contentId = trimStringOrEmpty(detail.gafComposerAttachmentContentId);
	if (!contentId) return undefined;
	const out: WindowInitialPayload = {
		gafComposerAttachmentContentId: contentId,
	};
	const fileName = trimStringOrEmpty(detail.gafComposerAttachmentFileName);
	if (fileName) out.gafComposerAttachmentFileName = fileName;
	const mimeType = trimStringOrEmpty(detail.gafComposerAttachmentMimeType);
	if (mimeType) out.gafComposerAttachmentMimeType = mimeType;
	const sizeRaw = detail.gafComposerAttachmentSize;
	if (typeof sizeRaw === 'number' && Number.isFinite(sizeRaw)) {
		out.gafComposerAttachmentSize = sizeRaw;
	}
	return out;
}

/**
 * Builds {@link WindowInitialPayload} for Professional Worlds cross-app draft opens.
 */
export const PROFESSIONAL_WORLDS_DRAFT_DESTINATION_APP_COMPONENTS = new Set([
	'EWRP',
	'Presentations',
	'PresentationsArchive',
	'GAFChatApp',
	'UserSiteStudio',
	'EWDeskApp',
]);

export function isProfessionalWorldsDraftDestinationAppComponent(
	appComponent: string | null | undefined
): boolean {
	const normalized = trimStringOrEmpty(appComponent);
	return (
		normalized.length > 0 &&
		PROFESSIONAL_WORLDS_DRAFT_DESTINATION_APP_COMPONENTS.has(normalized)
	);
}

export function buildProfessionalWorldsDraftOpenPayload(
	detail: DesktopOpenAppDetail | undefined | null
): WindowInitialPayload | undefined {
	if (!detail) return undefined;
	if (!isProfessionalWorldsDraftDestinationAppComponent(detail.appComponent)) {
		return undefined;
	}
	const draftKey = trimStringOrEmpty(detail.professionalWorldsCrossAppDraftKey);
	if (!draftKey) return undefined;
	return { professionalWorldsCrossAppDraftKey: draftKey };
}

/** Legacy name kept for EWRP tests/callers; the payload is destination-agnostic. */
export const buildEwrpOpenPayload = buildProfessionalWorldsDraftOpenPayload;

/** Build window payload when companion opens EWRP for a specific job id. */
export function buildEwrpJobOpenPayload(
	detail: DesktopOpenAppDetail | undefined | null
): WindowInitialPayload | undefined {
	if (!detail) return undefined;
	const app = trimStringOrEmpty(detail.appComponent);
	if (
		app !== 'EWRP' &&
		app !== 'Presentations' &&
		app !== 'PresentationsArchive'
	) {
		return undefined;
	}
	const jobId = trimStringOrEmpty(detail.ewrpJobId ?? detail.ewrp_job_id);
	if (!jobId) return undefined;
	return { ewrpJobId: jobId };
}

/**
 * Builds {@link WindowInitialPayload} for Content Manager from `desktop-open-app` detail
 * (marketing cabinet and other callers). Only documented keys are copied.
 */
export function buildContentManagerOpenPayload(
	detail: DesktopOpenAppDetail | undefined | null
): WindowInitialPayload | undefined {
	if (!detail) return undefined;
	const projectId =
		typeof detail.contentManagerProjectId === 'string'
			? detail.contentManagerProjectId.trim()
			: '';
	const companyId =
		typeof detail.contentManagerCompanyId === 'string'
			? detail.contentManagerCompanyId.trim()
			: '';
	const projectName =
		typeof detail.contentManagerProjectName === 'string'
			? detail.contentManagerProjectName.trim()
			: '';
	const cabinetView = detail.contentManagerCabinetView === true;
	const folderItemId =
		typeof detail.contentManagerFolderItemId === 'string'
			? detail.contentManagerFolderItemId.trim()
			: '';
	const focusUnifiedId =
		typeof detail.contentManagerFocusUnifiedContentId === 'string'
			? detail.contentManagerFocusUnifiedContentId.trim()
			: '';
	const out: WindowInitialPayload = {};
	if (projectId) out.contentManagerProjectId = projectId;
	if (companyId) out.contentManagerCompanyId = companyId;
	if (projectName) out.contentManagerProjectName = projectName;
	if (cabinetView) out.contentManagerCabinetView = true;
	if (folderItemId) out.contentManagerFolderItemId = folderItemId;
	if (focusUnifiedId) out.contentManagerFocusUnifiedContentId = focusUnifiedId;
	if (detail.contentManagerOpenAssignProject === true) {
		out.contentManagerOpenAssignProject = true;
	}
	const filterSnap = normalizeContentManagerInitialFilterPayload(
		detail.contentManagerInitialFilter
	);
	if (filterSnap) out.contentManagerInitialFilter = filterSnap;
	return Object.keys(out).length > 0 ? out : undefined;
}

function trimStringOrEmpty(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function docEditorTargetTypeToTabSource(
	targetType: DocEditorOpenTarget['targetType']
): DocEditorTabSource {
	return targetType === 'unifiedContent' ? 'unifiedContent' : 'docEditor';
}

function docEditorTabSourceToTargetType(
	source: DocEditorTabSource
): DocEditorOpenTarget['targetType'] {
	return source === 'unifiedContent' ? 'unifiedContent' : 'docEditor';
}

function docEditorTabKey(tab: {
	source: DocEditorTabSource;
	id: string;
}): string {
	return `${tab.source}:${tab.id}`;
}

function normalizeDocEditorTabTarget(
	value: unknown
): DocEditorTabTarget | null {
	if (!value || typeof value !== 'object') return null;
	const sourceRaw = (value as { source?: unknown }).source;
	const source =
		sourceRaw === 'docEditor' || sourceRaw === 'unifiedContent'
			? sourceRaw
			: null;
	if (!source) return null;
	const id = trimStringOrEmpty((value as { id?: unknown }).id);
	if (!id) return null;
	const title = trimStringOrEmpty((value as { title?: unknown }).title);
	const requestId = trimStringOrEmpty(
		(value as { requestId?: unknown }).requestId
	);
	return {
		source,
		id,
		...(title ? { title } : {}),
		...(requestId ? { requestId } : {}),
	};
}

function normalizeDocEditorActiveTab(
	value: unknown
): DocEditorActiveTab | null {
	if (!value || typeof value !== 'object') return null;
	const sourceRaw = (value as { source?: unknown }).source;
	const source =
		sourceRaw === 'docEditor' || sourceRaw === 'unifiedContent'
			? sourceRaw
			: null;
	if (!source) return null;
	const id = trimStringOrEmpty((value as { id?: unknown }).id);
	if (!id) return null;
	return { source, id };
}

function getLegacyDocEditorTabs(payload: WindowInitialPayload | undefined): {
	tabs: DocEditorTabTarget[];
	activeLegacy: DocEditorActiveTab | null;
} {
	if (!payload) return { tabs: [], activeLegacy: null };
	const docIds =
		Array.isArray(payload.documentIds) && payload.documentIds.length > 0
			? payload.documentIds
					.map((id) => trimStringOrEmpty(id))
					.filter((id) => id.length > 0)
			: trimStringOrEmpty(payload.documentId)
				? [trimStringOrEmpty(payload.documentId)]
				: [];
	const tabs: DocEditorTabTarget[] = docIds.map((id) => ({
		source: 'docEditor',
		id,
	}));
	const unifiedContentId = trimStringOrEmpty(payload.unifiedContentId);
	if (unifiedContentId) {
		tabs.push({
			source: 'unifiedContent',
			id: unifiedContentId,
		});
	}
	const activeDocId = trimStringOrEmpty(
		payload.activeDocumentId ?? payload.documentId
	);
	if (unifiedContentId) {
		return {
			tabs,
			activeLegacy: { source: 'unifiedContent', id: unifiedContentId },
		};
	}
	if (activeDocId) {
		return {
			tabs,
			activeLegacy: { source: 'docEditor', id: activeDocId },
		};
	}
	return {
		tabs,
		activeLegacy:
			tabs.length > 0 ? { source: tabs[0].source, id: tabs[0].id } : null,
	};
}

export function normalizeDocEditorTabsAndActive(
	payload: WindowInitialPayload | undefined
): {
	tabs: DocEditorTabTarget[];
	active: DocEditorActiveTab | null;
} {
	const outTabs: DocEditorTabTarget[] = [];
	const seen = new Set<string>();
	const pushUnique = (tab: DocEditorTabTarget | null) => {
		if (!tab) return;
		const key = docEditorTabKey(tab);
		if (seen.has(key)) return;
		seen.add(key);
		outTabs.push(tab);
	};

	for (const rawTab of payload?.docEditorTabs ?? []) {
		pushUnique(normalizeDocEditorTabTarget(rawTab));
	}
	const legacy = getLegacyDocEditorTabs(payload);
	for (const tab of legacy.tabs) {
		pushUnique(tab);
	}

	const explicitActive = normalizeDocEditorActiveTab(
		payload?.activeDocEditorTab
	);
	let active = explicitActive ?? legacy.activeLegacy;
	if (!active && outTabs.length > 0) {
		active = { source: outTabs[0].source, id: outTabs[0].id };
	}
	if (active && !seen.has(docEditorTabKey(active))) {
		const tab: DocEditorTabTarget = { source: active.source, id: active.id };
		seen.add(docEditorTabKey(tab));
		outTabs.push(tab);
	}
	return { tabs: outTabs, active };
}

function buildDocEditorPayloadFromTabs(
	base: WindowInitialPayload,
	tabs: DocEditorTabTarget[],
	active: DocEditorActiveTab | null,
	requestId?: string
): WindowInitialPayload {
	const docIds = tabs
		.filter((tab) => tab.source === 'docEditor')
		.map((tab) => tab.id);
	const activeDocId = active?.source === 'docEditor' ? active.id : undefined;
	const activeUnifiedId =
		active?.source === 'unifiedContent' ? active.id : undefined;
	return {
		...base,
		docEditorTabs: tabs,
		activeDocEditorTab: active ?? undefined,
		documentIds: docIds.length > 0 ? docIds : undefined,
		documentId: activeDocId,
		activeDocumentId: activeDocId,
		unifiedContentId: activeUnifiedId,
		...(requestId ? { docOpenRequestId: requestId } : {}),
	};
}

/**
 * Parse a strict DocEditor opening target from desktop deep-link detail.
 * Preference is `unifiedContentId` when both keys are present.
 */
export function resolveDocEditorOpenTarget(
	detail: DesktopOpenAppDetail | undefined | null
): DocEditorOpenTarget | null {
	if (!detail) return null;
	const requestId = trimStringOrEmpty(detail.docOpenRequestId);
	const title = trimStringOrEmpty(detail.docEditorTitle);
	const unifiedContentId = trimStringOrEmpty(detail.unifiedContentId);
	if (unifiedContentId) {
		return {
			targetType: 'unifiedContent',
			id: unifiedContentId,
			...(title ? { title } : {}),
			...(requestId ? { requestId } : {}),
			...(detail.forceNewWindow === true ? { forceNewWindow: true } : {}),
			...(detail.openCollabPanel === true ? { openCollabPanel: true } : {}),
			...(detail.autoJoinCollaboration === true
				? { autoJoinCollaboration: true }
				: {}),
		};
	}

	const documentId = trimStringOrEmpty(detail.documentId);
	if (!documentId) return null;
	return {
		targetType: 'docEditor',
		id: documentId,
		...(title ? { title } : {}),
		...(requestId ? { requestId } : {}),
		...(detail.forceNewWindow === true ? { forceNewWindow: true } : {}),
		...(detail.openCollabPanel === true ? { openCollabPanel: true } : {}),
		...(detail.autoJoinCollaboration === true
			? { autoJoinCollaboration: true }
			: {}),
	};
}

/**
 * Build normalized payload for opening a new DocEditor window.
 */
export function buildDocEditorOpenPayload(
	target: DocEditorOpenTarget
): WindowInitialPayload {
	const source = docEditorTargetTypeToTabSource(target.targetType);
	const base = buildDocEditorPayloadFromTabs(
		{},
		[
			{
				source,
				id: target.id,
				...(target.title ? { title: target.title } : {}),
				...(target.requestId ? { requestId: target.requestId } : {}),
			},
		],
		{ source, id: target.id },
		target.requestId
	);
	return {
		...base,
		...(target.requestId ? { docOpenRequestId: target.requestId } : {}),
		...(target.openCollabPanel ? { openCollabPanel: true } : {}),
		...(target.autoJoinCollaboration ? { autoJoinCollaboration: true } : {}),
	};
}

/**
 * Build normalized payload for opening Document Editor V2 from desktop deep links.
 */
export function buildDocEditorV2OpenPayload(
	detail: DesktopOpenAppDetail | undefined | null
): WindowInitialPayload | undefined {
	if (!detail) return undefined;
	const unifiedContentId = trimStringOrEmpty(detail.unifiedContentId);
	const documentId = trimStringOrEmpty(detail.documentId);
	const title =
		trimStringOrEmpty(detail.docEditorTitle) ||
		trimStringOrEmpty(
			typeof detail.initialTitle === 'string' ? detail.initialTitle : ''
		);
	if (!unifiedContentId && !documentId && !title) {
		return undefined;
	}
	return {
		...(documentId ? { documentId } : {}),
		...(unifiedContentId ? { unifiedContentId } : {}),
		...(title ? { docEditorTitle: title } : {}),
	};
}

/**
 * Merge target into existing DocEditor window payload consistently.
 * - unified content target always resets legacy doc keys
 * - doc editor target appends to `documentIds` and sets active id
 */
export function mergeDocEditorPayload(
	existing: WindowInitialPayload | undefined,
	target: DocEditorOpenTarget
): WindowInitialPayload {
	const base: WindowInitialPayload = { ...(existing ?? {}) };
	const normalized = normalizeDocEditorTabsAndActive(base);
	const source = docEditorTargetTypeToTabSource(target.targetType);
	const nextTab: DocEditorTabTarget = {
		source,
		id: target.id,
		...(target.title ? { title: target.title } : {}),
		...(target.requestId ? { requestId: target.requestId } : {}),
	};
	const mergedTabs = [...normalized.tabs];
	const existingTabIndex = mergedTabs.findIndex(
		(tab) => docEditorTabKey(tab) === docEditorTabKey(nextTab)
	);
	if (existingTabIndex === -1) {
		mergedTabs.push(nextTab);
	} else if (nextTab.title) {
		const existingTab = mergedTabs[existingTabIndex];
		mergedTabs[existingTabIndex] = {
			...existingTab,
			title: nextTab.title,
			...(nextTab.requestId ? { requestId: nextTab.requestId } : {}),
		};
	}
	const nextActive: DocEditorActiveTab = { source, id: target.id };
	const mergedPayload = buildDocEditorPayloadFromTabs(
		base,
		mergedTabs,
		nextActive,
		target.requestId
	);
	return {
		...mergedPayload,
		...(target.requestId ? { docOpenRequestId: target.requestId } : {}),
		...(target.openCollabPanel ? { openCollabPanel: true } : {}),
		...(target.autoJoinCollaboration ? { autoJoinCollaboration: true } : {}),
	};
}

/**
 * Resolve current open target from payload for retry/focus logic.
 */
export function resolveDocEditorPayloadTarget(
	payload: WindowInitialPayload | undefined
): DocEditorOpenTarget | null {
	const requestId = trimStringOrEmpty(payload?.docOpenRequestId);
	const normalized = normalizeDocEditorTabsAndActive(payload);
	if (normalized.active) {
		return {
			targetType: docEditorTabSourceToTargetType(normalized.active.source),
			id: normalized.active.id,
			...(requestId ? { requestId } : {}),
			...(payload?.openCollabPanel === true ? { openCollabPanel: true } : {}),
			...(payload?.autoJoinCollaboration === true
				? { autoJoinCollaboration: true }
				: {}),
		};
	}
	return null;
}

export function windowPayloadContainsDocEditorTarget(
	payload: WindowInitialPayload | undefined,
	target: DocEditorOpenTarget
): boolean {
	const keys = getDocEditorDocumentKeysFromPayload(payload);
	return keys.has(getDocEditorDocumentKey(target.targetType, target.id));
}

export function getDocEditorDocumentKey(
	targetType: DocEditorOpenTarget['targetType'],
	id: string
): string {
	const normalizedId = id.trim();
	return targetType === 'unifiedContent'
		? `unifiedContent:${normalizedId}`
		: `docEditor:${normalizedId}`;
}

export function getDocEditorDocumentKeysFromPayload(
	payload: WindowInitialPayload | undefined
): Set<string> {
	const normalized = normalizeDocEditorTabsAndActive(payload);
	return new Set(
		normalized.tabs.map((tab) =>
			getDocEditorDocumentKey(
				docEditorTabSourceToTargetType(tab.source),
				tab.id
			)
		)
	);
}

export function resolveDocEditorActiveTabTitle(
	payload: WindowInitialPayload | undefined
): string | null {
	const normalized = normalizeDocEditorTabsAndActive(payload);
	const active = normalized.active;
	if (!active) return null;
	const titleFromMap = trimStringOrEmpty(payload?.tabTitles?.[active.id]);
	if (titleFromMap) return titleFromMap;
	const titleFromTab = trimStringOrEmpty(
		normalized.tabs.find(
			(tab) => tab.source === active.source && tab.id === active.id
		)?.title
	);
	return titleFromTab || null;
}

export function maskDocEditorWindowTitle(rawTitle: string): string {
	const title = rawTitle.trim();
	if (!title) return '';
	const chars = Array.from(title);
	if (chars.length <= 6) return title;
	return `${chars.slice(0, 3).join('')}***${chars.slice(-3).join('')}`;
}

export function resolveDocEditorMaskedWindowTitle(
	payload: WindowInitialPayload | undefined,
	fallbackTitle: string
): string {
	const activeTitle = resolveDocEditorActiveTabTitle(payload);
	if (!activeTitle) {
		return fallbackTitle;
	}
	const masked = maskDocEditorWindowTitle(activeTitle);
	return masked || fallbackTitle;
}

/** Merged first so opening Content Manager without cabinet keys does not keep stale scope on an existing window. */
export const CONTENT_MANAGER_WINDOW_PAYLOAD_RESET: WindowInitialPayload = {
	contentManagerProjectId: undefined,
	contentManagerCompanyId: undefined,
	contentManagerProjectName: undefined,
	contentManagerCabinetView: undefined,
	contentManagerFolderItemId: undefined,
	contentManagerInitialFilter: undefined,
	contentManagerFocusUnifiedContentId: undefined,
	contentManagerOpenAssignProject: undefined,
};

/** Helper: never restore legacy voice windows from persisted snapshot. Exported for tests. */
export function filterRestoredWindows(
	windows: PersistedWindowState[] | undefined,
	installedApps: { appComponent?: string | null }[]
): PersistedWindowState[] {
	if (!windows?.length) return [];

	const installedComponents = new Set(
		installedApps
			.map((app) => app.appComponent)
			.filter((c): c is string => Boolean(c))
	);

	return windows.filter((w) => {
		if (isLegacyHiddenDesktopAppComponent(w.appComponent)) return false;
		if (isEphemeralDesktopWindowComponent(w.appComponent)) return false;
		if (!w.appComponent) return true;
		const defaultApp = DEFAULT_APPS.find(
			(a) => a.appComponent === w.appComponent
		);
		const isSystemApp = defaultApp?.isSystem || defaultApp?.id === 'app-store';
		if (isSystemApp) return true;
		return installedComponents.has(w.appComponent);
	});
}

export function findVoiceCommandLauncherItem(
	items: DesktopItem[]
): DesktopItem | undefined {
	return (
		items.find(
			(item) => item.type === 'app' && item.appComponent === 'StudioGU'
		) ??
		DEFAULT_APPS.find(
			(item) => item.type === 'app' && item.appComponent === 'StudioGU'
		)
	);
}

export function canResolveInstalledDesktopApps(
	isLoading: boolean,
	storeApps: unknown
): boolean {
	return !isLoading && Array.isArray(storeApps);
}
