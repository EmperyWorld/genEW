/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Central registry of minimum desktop window sizes by `appComponent` and folder type.
 * Consumed by EnhancedWindow, useWindowManager, App Store detail, and layout presets.
 *
 * Invariants:
 * - Every first-party `appComponent` mounted via desktopWindowAppContent must have an explicit entry or documented fallback tier.
 * - GAF Chat windows without `appComponent` still resolve via title aliases (`isGafDesktopWindow`).
 * - Unknown third-party / future components fall back to {@link DESKTOP_WINDOW_MIN_SIZE_DEFAULTS.app}.
 *
 * Related:
 * - documentation/product/desktop/DESKTOP-WINDOW-MIN-SIZES.md
 * - src/pages/Desktop/components/EnhancedWindow.tsx
 * - src/pages/Desktop/components/desktopWindowAppContent.tsx
 */

import type { WindowState } from '../types/desktop.types';

export type DesktopWindowMinSize = {
	minWidth: number;
	minHeight: number;
};

/** Fallback when `appComponent` is absent or not in {@link DESKTOP_APP_WINDOW_MIN_SIZES}. */
export const DESKTOP_WINDOW_MIN_SIZE_DEFAULTS = {
	folder: { minWidth: 520, minHeight: 360 },
	app: { minWidth: 600, minHeight: 420 },
} as const satisfies Record<'folder' | 'app', DesktopWindowMinSize>;

/** Named tiers — reuse when assigning new first-party apps. */
export const DESKTOP_WINDOW_MIN_SIZE_TIERS = {
	compact: { minWidth: 560, minHeight: 440 },
	feed: { minWidth: 720, minHeight: 520 },
	doc: { minWidth: 720, minHeight: 480 },
	social: { minWidth: 760, minHeight: 560 },
	studio: { minWidth: 760, minHeight: 560 },
	chat: { minWidth: 840, minHeight: 560 },
	video: { minWidth: 860, minHeight: 560 },
	editor: { minWidth: 880, minHeight: 560 },
	presentation: { minWidth: 960, minHeight: 520 },
	workspace: { minWidth: 980, minHeight: 680 },
	iframe: { minWidth: 800, minHeight: 560 },
} as const satisfies Record<string, DesktopWindowMinSize>;

const T = DESKTOP_WINDOW_MIN_SIZE_TIERS;

/**
 * Explicit minimum sizes for first-party desktop apps (`appComponent` keys).
 * Source of truth for resize clamps — do not duplicate numbers in app components.
 */
export const DESKTOP_APP_WINDOW_MIN_SIZES: Readonly<
	Record<string, DesktopWindowMinSize>
> = {
	AppStore: T.feed,
	AssistantApp: T.workspace,
	ClipboardManager: T.compact,
	ContentManagerPro: T.doc,
	CustomerCabinet: T.workspace,
	DesktopAiChatApp: T.chat,
	DesktopAppMaintenance: DESKTOP_WINDOW_MIN_SIZE_DEFAULTS.app,
	DesktopDashboardFavoritesApp: T.compact,
	DesktopShellSettings: T.feed,
	DesktopWidgetShelfApp: T.compact,
	DocEditor: T.doc,
	DocEditorV2: T.editor,
	EWDeskApp: T.feed,
	EWRP: T.presentation,
	EwaApp: T.workspace,
	FeedbackHubApp: T.social,
	SurveyHubApp: T.social,
	GAFChatApp: T.chat,
	ImageStudio: T.editor,
	KirsClientSite: T.workspace,
	KirsCuration: T.workspace,
	LocalServiceIframeApp: T.iframe,
	MarketingCabinet: T.workspace,
	MusicEvolutionApp: T.studio,
	MusicForgeApp: T.studio,
	MusicGenerator: T.studio,
	MusicPlayer: T.compact,
	NotificationsApp: T.compact,
	PoemmaApp: T.workspace,
	Presentations: T.presentation,
	PresentationsArchive: T.presentation,
	ProfessionalWorlds: T.workspace,
	ProjectAboutApp: T.presentation,
	EmperyNexusChronicleApp: T.compact,
	SiteManagerOps: T.workspace,
	SocialHubApp: T.social,
	StudioGU: T.studio,
	UGS: T.workspace,
	UGSHubApp: T.workspace,
	UnifiedAdminApp: T.workspace,
	UserSiteStudio: T.workspace,
	VideoCallApp: T.video,
	VideoStudio: T.editor,
	// Legacy aliases still opened from persisted shell windows / deep links.
	FriendsApp: T.social,
	UserProfile: T.social,
};

/** Заглушка для расчёта мин. размера только по `appComponent` (витрина, подсказки). */
const WINDOW_MIN_SIZE_LOOKUP_STUB: WindowState = {
	id: '__min-size-lookup__',
	title: '',
	type: 'app',
	position: { x: 0, y: 0 },
	size: { width: 800, height: 600 },
	isMinimized: false,
	isMaximized: false,
	zIndex: 1,
	path: [],
};

/**
 * Минимальный размер окна приложения по ключу `appComponent` без полного {@link WindowState}.
 * Для папок и спец- случаев по-прежнему используйте {@link getDesktopWindowMinSize}.
 */
export function getDesktopWindowMinSizeForAppComponent(
	appComponent: string | null | undefined
): DesktopWindowMinSize | null {
	const id = appComponent?.trim();
	if (!id) return null;
	return getDesktopWindowMinSize({
		...WINDOW_MIN_SIZE_LOOKUP_STUB,
		appComponent: id,
	});
}

/** Titles that identify a GAF Chat window when appComponent is missing or localized. */
export const GAF_DESKTOP_TITLE_ALIASES = new Set([
	'GAF Chat',
	'ГАФМе',
	'GAF',
	'ГАФ',
	'GAF Me',
	'ГАФ Ме',
	'GAF Ме',
]);

export function isGafDesktopWindow(win: WindowState): boolean {
	if (win.appComponent === 'GAFChatApp') return true;
	return !!(win.title && GAF_DESKTOP_TITLE_ALIASES.has(win.title));
}

export function resolveDesktopAppWindowMinSize(
	appComponent: string | null | undefined
): DesktopWindowMinSize {
	const id = appComponent?.trim();
	if (id && id in DESKTOP_APP_WINDOW_MIN_SIZES) {
		return DESKTOP_APP_WINDOW_MIN_SIZES[id];
	}
	return DESKTOP_WINDOW_MIN_SIZE_DEFAULTS.app;
}

export function getDesktopWindowMinSize(
	desktopWindow: WindowState
): DesktopWindowMinSize {
	if (desktopWindow.type === 'folder') {
		return DESKTOP_WINDOW_MIN_SIZE_DEFAULTS.folder;
	}

	if (isGafDesktopWindow(desktopWindow)) {
		return T.chat;
	}

	return resolveDesktopAppWindowMinSize(desktopWindow.appComponent);
}
