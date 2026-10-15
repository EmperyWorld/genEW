/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Deep-link helpers between Desktop apps: dispatch `desktop-open-app`, optional `sessionStorage`
 * bridges, and typed entry points (Content Manager, DocEditor, Music Player, GAF chat).
 *
 * Invariants:
 * - Helpers no-op without `window`; dispatch errors are swallowed so UI handlers never throw.
 * - Telemetry must not log PII from `desktop-open-app` detail (see GAF chat helper).
 *
 * Related:
 * - src/pages/Desktop/components/DesktopWorkspaceContent.tsx — listener and payload merge
 * - src/pages/Desktop/utils/desktopTelemetry.ts
 *
 * Flow: write optional `sessionStorage` keys, then dispatch `desktop-open-app` so
 * `DesktopWorkspaceContent` opens or focuses the target app. Companion ``doc_editor_set_body`` uses
 * `DESKTOP_DOC_EDITOR_COMPANION_SET_BODY_EVENT` for in-place HTML replacement; shell hook installs
 * **fanout** (`ensureDesktopDocEditorCompanionSetBodyFanout`) so lazy Doc Editor chunks still receive payloads
 * when JS bundles are mismatched across CDN deployments. Consumers read/clear their keys on mount.
 *
 * @see {@link requestOpenDesktopApp} — core `CustomEvent` dispatch
 */

import type { DocEditorOpenTarget } from '../types/desktop.types';
import type { StartMenuTab } from '../types/desktopStartMenu';
import {
	normalizeUnifiedContentId,
	type AudioSourceSurface,
} from '@/services/audio/playerAudioContracts';

const DEEPLINK_CONTENT_MANAGER = 'eliteew.desktop.deepLink.contentManager';

const DESKTOP_OPEN_APP = 'desktop-open-app';
/** Открыть меню «Пуск» на панели задач (не окно приложения). */
export const DESKTOP_OPEN_START_MENU_EVENT = 'desktop-open-start-menu';
/**
 * Закрыть меню «Пуск» (и связанные taskbar popovers) перед окном настроек / другими
 * окнами, которые открываются под PANEL z-index.
 */
export const DESKTOP_CLOSE_START_MENU_EVENT = 'desktop-close-start-menu';
/** Переключить центр уведомлений на панели задач (Win+N). */
export const DESKTOP_TOGGLE_NOTIFICATIONS_EVENT =
	'desktop-toggle-notifications';
/** Открыть панель настроек рабочего стола (персонализация, иконки, …). */
export const DESKTOP_OPEN_SHELL_SETTINGS_EVENT = 'desktop-open-shell-settings';
/** Закрыть самое свежее окно с данным `appComponent` (используется для undo действий спутника EWA). */
export const DESKTOP_CLOSE_NEWEST_APP_EVENT = 'desktop-close-newest-app';
/** Передать фокус самому «верхнему» окну с данным ``appComponent`` (companion ``focus_app``). */
export const DESKTOP_FOCUS_NEWEST_APP_EVENT = 'desktop-focus-newest-app';
/** Свернуть самое «верхнее» окно с данным ``appComponent`` (companion ``minimize_app``). */
export const DESKTOP_MINIMIZE_NEWEST_APP_EVENT = 'desktop-minimize-newest-app';

/**
 * Server-injected companion action: заменить тело документа в открытом **Doc Editor** без вывода полного текста в чат.
 * Глобальный **fanout** + регистратор (`registerDesktopDocEditorCompanionSetBodyConsumer`) в **`UltimateDocEditorInner`**.
 */
export const DESKTOP_DOC_EDITOR_COMPANION_SET_BODY_EVENT =
	'desktop-doc-editor-companion-set-body';

export interface DesktopDocEditorCompanionSetBodyDetail {
	bodyHtml: string;
	unifiedContentId?: string;
	rationale?: string;
}

/** One Ultimate Doc Editor instance applies HTML when the companion fanout notifies it. */
export type DesktopDocEditorCompanionSetBodyConsumer = (
	detail: DesktopDocEditorCompanionSetBodyDetail
) => void;

const _companionDocBodyConsumers =
	new Set<DesktopDocEditorCompanionSetBodyConsumer>();
let _companionDocBodyFanoutInstalled = false;

function _fanoutCompanionDocBody(ev: Event): void {
	const raw = (ev as CustomEvent<DesktopDocEditorCompanionSetBodyDetail>)
		.detail;
	if (!raw || typeof raw.bodyHtml !== 'string' || !raw.bodyHtml.trim()) return;
	for (const fn of _companionDocBodyConsumers) {
		try {
			fn(raw);
		} catch {
			/* consumer errors must not break other editors */
		}
	}
}

/**
 * Single `window` listener that forwards **`DESKTOP_DOC_EDITOR_COMPANION_SET_BODY_EVENT`** to every mounted
 * Doc Editor that registered with **`registerDesktopDocEditorCompanionSetBodyConsumer`**.
 *
 * Mounted from **`useDesktopWorkspaceGlobalWindowEvents`** so the listener rides the desktop workspace bundle —
 * survives lazy-load / CDN version skew versus the **`UltimateDocEditor`** chunk.
 */
export function ensureDesktopDocEditorCompanionSetBodyFanout(): void {
	if (typeof window === 'undefined' || _companionDocBodyFanoutInstalled) return;
	_companionDocBodyFanoutInstalled = true;
	window.addEventListener(
		DESKTOP_DOC_EDITOR_COMPANION_SET_BODY_EVENT,
		_fanoutCompanionDocBody as EventListener
	);
}

/** Register a Doc Editor instance; unsubscribe on unmount. */
export function registerDesktopDocEditorCompanionSetBodyConsumer(
	consumer: DesktopDocEditorCompanionSetBodyConsumer
): () => void {
	ensureDesktopDocEditorCompanionSetBodyFanout();
	_companionDocBodyConsumers.add(consumer);
	return () => {
		_companionDocBodyConsumers.delete(consumer);
	};
}

export interface DesktopCloseNewestAppDetail {
	appComponent: string;
	/** When set, only windows whose ``initialPayload.videoCallId`` matches are closed. */
	videoCallId?: string;
}

export type DesktopFocusNewestAppDetail = DesktopCloseNewestAppDetail;

/** Dispatched after desktop-open-app so an already-open Content Manager can open the file. */
export const CONTENT_MANAGER_OPEN_CONTENT = 'content-manager-open-content';

/** Вкладки панели настроек оболочки (см. `DesktopSettingsPanel`). */
export type DesktopShellSettingsTab =
	| 'personalize'
	| 'icons'
	| 'chrome'
	| 'shell'
	| 'performance';

/**
 * Detail passed to `desktop-open-app`; `appComponent` selects which desktop app to open.
 * Content Manager (cabinet): optional `contentManagerProjectId`, `contentManagerCompanyId`,
 * `contentManagerProjectName`, `contentManagerCabinetView` — see `buildContentManagerOpenPayload`
 * in `DesktopWorkspaceContent`.
 * Desktop folder window: optional `contentManagerFolderItemId` (`item_id` папки или `content`).
 * AMKA (`EwaApp`): optional `ewaDesktopSessionId` for orchestration session continuity.
 * (`amkaCompanyId` / `amkaProjectId` — legacy keys for external callers; `EwaApp` ignores them.)
 */
export interface DesktopOpenAppDetail {
	appComponent: string;
	/** Desktop apps: request explicit new window (enforced by app policy and duplicate guards). */
	forceNewWindow?: boolean;
	/** DocEditor: optional display title for active tab/window mask. */
	docEditorTitle?: string;
	/** DocEditor: сквозной trace id deep-link -> load telemetry. */
	docOpenRequestId?: string;
	/** Feedback hub: фокус в поле текста (трей). */
	feedbackQuickMode?: 'text';
	/** Feedback hub: черновик основного текста (из Справочника и т.п.). */
	feedbackDraftBody?: string;
	/** Social Hub: открыть конкретную вкладку. */
	socialHubTab?:
		| 'overview'
		| 'inbox'
		| 'friends'
		| 'circles'
		| 'privacy'
		| 'profile'
		| 'mobile-app';
	/** Social Hub: выделить карточку друга после загрузки overview. */
	socialHubFriendUserId?: string;
	/** Doc Editor: после загрузки документа открыть панель «Совместная работа». */
	openCollabPanel?: boolean;
	/** Doc Editor: после загрузки включить совместное редактирование (как «Подключиться»). */
	autoJoinCollaboration?: boolean;
	[key: string]: unknown;
}

/**
 * Dispatches `desktop-open-app` with the given detail. Safe on SSR (no-op without `window`).
 * Swallows dispatch errors so deep-link helpers never throw into UI handlers.
 */
export function requestOpenDesktopApp(detail: DesktopOpenAppDetail): void {
	if (typeof window === 'undefined') return;
	try {
		window.dispatchEvent(new CustomEvent(DESKTOP_OPEN_APP, { detail }));
	} catch (_) {
		// ignore
	}
}

/** Открыть меню «Пуск» (кнопка слева на панели задач). */
export function requestOpenStartMenu(tab?: StartMenuTab): void {
	if (typeof window === 'undefined') return;
	try {
		window.dispatchEvent(
			new CustomEvent(DESKTOP_OPEN_START_MENU_EVENT, { detail: { tab } })
		);
	} catch (_) {
		// ignore
	}
}

/** Закрыть меню «Пуск» на панели задач (перед окном настроек и аналогами). */
export function requestCloseStartMenu(): void {
	if (typeof window === 'undefined') return;
	try {
		window.dispatchEvent(new CustomEvent(DESKTOP_CLOSE_START_MENU_EVENT));
	} catch (_) {
		// ignore
	}
}

/** Переключить центр уведомлений (Win+N). */
export function requestToggleDesktopNotifications(): void {
	if (typeof window === 'undefined') return;
	try {
		window.dispatchEvent(new CustomEvent(DESKTOP_TOGGLE_NOTIFICATIONS_EVENT));
	} catch (_) {
		// ignore
	}
}

/** Открыть настройки рабочего стола EliteEW в стандартном окне оболочки. */
export function requestOpenDesktopShellSettings(
	tab: DesktopShellSettingsTab = 'personalize'
): void {
	if (typeof window === 'undefined') return;
	try {
		window.dispatchEvent(
			new CustomEvent(DESKTOP_OPEN_SHELL_SETTINGS_EVENT, { detail: { tab } })
		);
	} catch (_) {
		// ignore
	}
}

/**
 * Закрыть самое свежее окно с указанным ``appComponent``. Используется EWA-спутником для undo-карточек:
 * если LLM попросил открыть приложение в авто-режиме, а пользователь нажал «Закрыть», шлём этот сигнал.
 * Listener — в ``DesktopWorkspaceContent`` (через ``useDesktopWorkspaceCloseAppEvent``).
 */
export function requestCloseDesktopAppLatest(
	appComponent: string,
	options?: { videoCallId?: string }
): void {
	if (typeof window === 'undefined') return;
	const trimmed = (appComponent || '').trim();
	if (!trimmed) return;
	const videoCallId = (options?.videoCallId || '').trim() || undefined;
	try {
		window.dispatchEvent(
			new CustomEvent<DesktopCloseNewestAppDetail>(
				DESKTOP_CLOSE_NEWEST_APP_EVENT,
				{
					detail: { appComponent: trimmed, videoCallId },
				}
			)
		);
	} catch (_) {
		// ignore
	}
}

/** Close the VideoCall desktop window for a specific internal call id. */
export function requestCloseDesktopVideoCall(callId: string): void {
	const trimmed = (callId || '').trim();
	if (!trimmed) return;
	requestCloseDesktopAppLatest('VideoCallApp', { videoCallId: trimmed });
}

/** Фокус на самом свежем окне указанного ``appComponent`` (см. ``useDesktopWorkspaceCompanionFocusMinimizeEvents``). */
export function requestFocusDesktopAppLatest(appComponent: string): void {
	if (typeof window === 'undefined') return;
	const trimmed = (appComponent || '').trim();
	if (!trimmed) return;
	try {
		window.dispatchEvent(
			new CustomEvent<DesktopFocusNewestAppDetail>(
				DESKTOP_FOCUS_NEWEST_APP_EVENT,
				{
					detail: { appComponent: trimmed },
				}
			)
		);
	} catch (_) {
		// ignore
	}
}

/** Сворачивает самое свежее окно ``appComponent`` (companion minimize). */
export function requestMinimizeDesktopAppLatest(appComponent: string): void {
	if (typeof window === 'undefined') return;
	const trimmed = (appComponent || '').trim();
	if (!trimmed) return;
	try {
		window.dispatchEvent(
			new CustomEvent<DesktopFocusNewestAppDetail>(
				DESKTOP_MINIMIZE_NEWEST_APP_EVENT,
				{
					detail: { appComponent: trimmed },
				}
			)
		);
	} catch (_) {
		// ignore
	}
}

/** Применить HTML тела из ответа спутника (серверный ``doc_editor_set_body``). */
export function dispatchDocEditorCompanionSetBody(
	detail: DesktopDocEditorCompanionSetBodyDetail
): void {
	if (typeof window === 'undefined') return;
	const html = (detail.bodyHtml || '').trim();
	if (!html) return;
	try {
		window.dispatchEvent(
			new CustomEvent<DesktopDocEditorCompanionSetBodyDetail>(
				DESKTOP_DOC_EDITOR_COMPANION_SET_BODY_EVENT,
				{ detail: { ...detail, bodyHtml: detail.bodyHtml } }
			)
		);
	} catch (_) {
		// ignore
	}
}

const PENDING_MUSIC_PLAY = 'eliteew.desktop.deepLink.pendingMusicPlay';

/** Dispatched when {@link requestPlayInMusicPlayer} targets the global playback domain (and optional Music Player UI). */
export const DESKTOP_MUSIC_PLAY_TRACK_EVENT = 'desktop-music-play-track';
/** Dispatched when a surface requests queue append in Music Player domain. */
export const DESKTOP_MUSIC_ENQUEUE_TRACK_EVENT = 'desktop-music-enqueue-track';

export interface PendingMusicPlayTrack {
	id: string;
	name: string;
	thumbnail_url?: string | null;
	version?: string | null;
	mime_type?: string | null;
	source_surface?: AudioSourceSurface;
}

export function coerceDesktopMusicPlayTrackDetail(
	raw: unknown
): PendingMusicPlayTrack | null {
	if (!raw || typeof raw !== 'object') return null;
	const rec = raw as Record<string, unknown>;
	const id = normalizeUnifiedContentId(rec);
	if (!id) return null;
	const trackName =
		(typeof rec.name === 'string' && rec.name.trim()) ||
		(typeof rec.track_name === 'string' && rec.track_name.trim()) ||
		(typeof rec.trackName === 'string' && rec.trackName.trim()) ||
		id;
	const thumbnail =
		typeof rec.thumbnail_url === 'string'
			? rec.thumbnail_url.trim()
			: typeof rec.thumbnailUrl === 'string'
				? rec.thumbnailUrl.trim()
				: null;
	const version =
		typeof rec.version === 'string' && rec.version.trim()
			? rec.version.trim()
			: null;
	const mimeType =
		typeof rec.mime_type === 'string' && rec.mime_type.trim()
			? rec.mime_type.trim()
			: typeof rec.mimeType === 'string' && rec.mimeType.trim()
				? rec.mimeType.trim()
				: null;
	const sourceSurface =
		typeof rec.source_surface === 'string' && rec.source_surface.trim()
			? (rec.source_surface.trim() as AudioSourceSurface)
			: typeof rec.sourceSurface === 'string' && rec.sourceSurface.trim()
				? (rec.sourceSurface.trim() as AudioSourceSurface)
				: 'unknown';
	return {
		id,
		name: trackName,
		thumbnail_url: thumbnail,
		version,
		mime_type: mimeType,
		source_surface: sourceSurface,
	};
}

/**
 * Starts playback of a unified-content audio track via the desktop-wide `desktop-music-play-track` event.
 * {@link MusicPlaybackDomainProvider} listens globally so audio + widget work without opening the MusicPlayer window.
 * `MusicPlayerPage` still consumes {@link PENDING_MUSIC_PLAY} on cold mount for legacy deep-links only.
 */
export function requestPlayInMusicPlayer(track: PendingMusicPlayTrack): void {
	if (typeof window === 'undefined') return;
	const payload = coerceDesktopMusicPlayTrackDetail(track);
	if (!payload) return;
	try {
		window.dispatchEvent(
			new CustomEvent(DESKTOP_MUSIC_PLAY_TRACK_EVENT, { detail: payload })
		);
	} catch (_) {
		// ignore
	}
}

/** Adds a track to Music Player queue through the global desktop event contract. */
export function requestEnqueueInMusicPlayer(
	track: PendingMusicPlayTrack
): void {
	if (typeof window === 'undefined') return;
	const payload = coerceDesktopMusicPlayTrackDetail(track);
	if (!payload) return;
	try {
		window.dispatchEvent(
			new CustomEvent(DESKTOP_MUSIC_ENQUEUE_TRACK_EVENT, { detail: payload })
		);
	} catch (_) {
		// ignore
	}
}

/** Read-and-clear pending track for Music Player cold start (first mount). */
export function consumePendingMusicPlayFromStorage(): PendingMusicPlayTrack | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(PENDING_MUSIC_PLAY);
		if (!raw) return null;
		sessionStorage.removeItem(PENDING_MUSIC_PLAY);
		return coerceDesktopMusicPlayTrackDetail(JSON.parse(raw));
	} catch {
		return null;
	}
}

/**
 * Opens Content Manager and stores `contentId` for first-paint selection.
 * Also emits {@link CONTENT_MANAGER_OPEN_CONTENT} for an already-mounted instance.
 *
 * @param contentId — non-empty id from the content catalog (not validated here)
 */
export function requestOpenContentManager(contentId: string): void {
	if (typeof window === 'undefined') return;
	try {
		sessionStorage.setItem(DEEPLINK_CONTENT_MANAGER, contentId);
		requestOpenDesktopApp({ appComponent: 'ContentManagerPro' });
		window.dispatchEvent(
			new CustomEvent(CONTENT_MANAGER_OPEN_CONTENT, { detail: { contentId } })
		);
	} catch (_) {
		// ignore
	}
}

/**
 * Opens Document Editor with a unified content file (not legacy `/documents/:id`).
 */
export function requestOpenDocEditorWithUnifiedContent(
	contentId: string,
	options?: { forceNewWindow?: boolean; title?: string }
): void {
	requestOpenDocEditor({
		targetType: 'unifiedContent',
		id: contentId,
		...(options?.forceNewWindow ? { forceNewWindow: true } : {}),
		...(typeof options?.title === 'string' ? { title: options.title } : {}),
	});
}

/**
 * Opens a fresh Document Editor V2 window for new documents.
 * Existing/legacy document opens still go through {@link requestOpenDocEditor}.
 */
export function requestOpenNewDocEditorV2(options?: {
	title?: string;
	forceNewWindow?: boolean;
}): void {
	const title = typeof options?.title === 'string' ? options.title.trim() : '';
	requestOpenDesktopApp({
		appComponent: 'DocEditorV2',
		forceNewWindow: options?.forceNewWindow ?? true,
		...(title ? { docEditorTitle: title, initialTitle: title } : {}),
	});
}

/**
 * Opens Document Editor V2 with a unified content file while legacy editor actions stay on DocEditor.
 */
export function requestOpenDocEditorV2WithUnifiedContent(
	contentId: string,
	options?: { forceNewWindow?: boolean; title?: string }
): void {
	const normalizedId = contentId.trim();
	if (!normalizedId) return;
	const title = typeof options?.title === 'string' ? options.title.trim() : '';
	requestOpenDesktopApp({
		appComponent: 'DocEditorV2',
		forceNewWindow: options?.forceNewWindow ?? true,
		unifiedContentId: normalizedId,
		...(title ? { docEditorTitle: title, initialTitle: title } : {}),
	});
}

/**
 * Open or focus DocEditor with a normalized target contract.
 */
export function requestOpenDocEditor(target: DocEditorOpenTarget): void {
	if (typeof window === 'undefined') return;
	const normalizedId = target.id.trim();
	if (!normalizedId) return;
	const requestId =
		typeof target.requestId === 'string' && target.requestId.trim()
			? target.requestId.trim()
			: typeof window.crypto?.randomUUID === 'function'
				? window.crypto.randomUUID()
				: `doc-open-${Date.now().toString(36)}-${Math.random()
						.toString(36)
						.slice(2, 8)}`;
	const normalizedTitle =
		typeof target.title === 'string' ? target.title.trim() : '';
	requestOpenDesktopApp({
		appComponent: 'DocEditor',
		...(target.forceNewWindow ? { forceNewWindow: true } : {}),
		docOpenRequestId: requestId,
		...(normalizedTitle ? { docEditorTitle: normalizedTitle } : {}),
		...(target.targetType === 'unifiedContent'
			? { unifiedContentId: normalizedId }
			: { documentId: normalizedId }),
		...(target.openCollabPanel ? { openCollabPanel: true } : {}),
		...(target.autoJoinCollaboration ? { autoJoinCollaboration: true } : {}),
	});
}

/**
 * Upper bound for GAF deep-link username, aligned with API `ByUsernameBody.username` max_length.
 * Keeps `CustomEvent` payloads small; server still validates on chat create.
 */
const GAF_CHAT_DEEPLINK_USERNAME_MAX_LEN = 255;

/** BMP scalars that must not appear in a deep-linked username (spoofing / layout / controls). */
function isDisallowedGafUsernameScalar(code: number): boolean {
	if (code <= 0x001f || code === 0x007f) return true;
	// C1 controls
	if (code >= 0x0080 && code <= 0x009f) return true;
	// Line / paragraph separator (treat as invalid single-line username)
	if (code === 0x2028 || code === 0x2029) return true;
	// Bidi embedding / override
	if (code >= 0x202a && code <= 0x202e) return true;
	if (code >= 0x2066 && code <= 0x2069) return true;
	// Zero-width space through RTL marks, BOM
	if (code >= 0x200b && code <= 0x200f) return true;
	if (code === 0xfeff) return true;
	// Lone surrogate code units are not valid user-facing scalars
	if (code >= 0xd800 && code <= 0xdfff) return true;
	return false;
}

/**
 * Normalize and validate a username for {@link requestOpenGafChatByUsername}.
 *
 * @returns Trimmed login without a single leading `@`, or `null` if unsafe/invalid for deep link
 *   (including over 255 Unicode scalars, matching API `ByUsernameBody`).
 */
function normalizeGafChatDeepLinkUsername(input: unknown): string | null {
	if (typeof input !== 'string') return null;
	let s = input.trim();
	// Single leading @ (e.g. pasted handles); do not strip elsewhere — usernames are opaque to this layer.
	if (s.startsWith('@')) {
		s = s.slice(1).trim();
	}
	if (!s) return null;
	let scalarCount = 0;
	for (const ch of s) {
		scalarCount++;
		if (scalarCount > GAF_CHAT_DEEPLINK_USERNAME_MAX_LEN) return null;
		const c = ch.codePointAt(0);
		if (c === undefined) return null;
		if (isDisallowedGafUsernameScalar(c)) return null;
	}
	return s;
}

/**
 * Opens GAF Chat focused on a 1:1 chat with the given username (chat created via API if missing).
 *
 * **Telemetry / privacy:** Analytics must not log `targetUsername` from `desktop-open-app` detail
 * (PII). To count opens without usernames, subscribe to `desktop-telemetry` and extend
 * `DesktopTelemetryEvent` in `desktopTelemetry.ts` with a dedicated event (e.g. name only, no
 * `username` field), or aggregate server-side from GAF chat API after consent. Invalid input is a
 * no-op here; {@link GAFChatApp} trims again and surfaces API errors as toasts.
 *
 * @param username — partner login as shown in Friends (string typed at call sites)
 */
export function requestOpenGafChatByUsername(username: string): void {
	if (typeof window === 'undefined') return;
	const normalized = normalizeGafChatDeepLinkUsername(username);
	if (!normalized) return;
	requestOpenDesktopApp({
		appComponent: 'GAFChatApp',
		targetUsername: normalized,
	});
}

/**
 * Reads and clears the Content Manager deep-link id from `sessionStorage`, then falls back to
 * hash `#unified-content?contentId=…`, stripping that fragment after read.
 *
 * @returns Content id to select, or `null`
 */
export function readContentManagerDeepLink(): string | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(DEEPLINK_CONTENT_MANAGER);
		sessionStorage.removeItem(DEEPLINK_CONTENT_MANAGER);
		if (raw) return raw;
		// URL deep link: #unified-content?contentId=xxx
		const hash = window.location.hash.slice(1) || '';
		const match = hash.match(/unified-content\?.*contentId=([^&]+)/);
		if (match) {
			const id = decodeURIComponent(match[1]);
			// Очищаем contentId из URL после чтения (чтобы не обрабатывать повторно)
			try {
				window.history.replaceState(
					null,
					'',
					`${window.location.pathname}#unified-content`
				);
			} catch (_) {
				/* ignore */
			}
			return id;
		}
		return null;
	} catch (_) {
		return null;
	}
}

/**
 * Builds a shareable URL that {@link readContentManagerDeepLink} can consume via hash.
 *
 * @param contentId — id to encode in the fragment
 */
export function buildContentManagerUrl(contentId: string): string {
	if (typeof window === 'undefined') return '';
	const base = `${window.location.origin}${window.location.pathname}`;
	return `${base}#unified-content?contentId=${encodeURIComponent(contentId)}`;
}
