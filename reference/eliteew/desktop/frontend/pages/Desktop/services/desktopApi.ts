/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * HTTP client for user desktop configuration and **`/api/v1/desktop/shell-state`** (MRU, virtual desktops, window snapshot,
 * EWA hints). Thin GET/PATCH primitives plus a small in-memory shell-state cache for deduplicated GET / merged PATCH.
 *
 * Invariants:
 * - Desktop base URL segment is **`/api/v1/desktop`** (`DESKTOP_USER_API_PREFIX`).
 * - **`getDesktopShellState`** / **`patchDesktopShellState`** — single HTTP round-trip each; etag/retry/reload belongs in mutation pipeline.
 * - **`patchDesktopShellStateMerged`** updates the module shell-state cache for the same tab session (no 412 retry here); leader success broadcasts `shell-state-invalidated` for follower RAM invalidate.
 * - **`patchDesktopShellStateKeepalive`** — best-effort PATCH on `pagehide` (fetch keepalive + `If-Match`); leader tab only.
 * - **`clearDesktopShellStateCache`** also clears music IndexedDB audio blobs (logout / user switch).
 *
 * Related:
 * - `EliteEW/api/routers/desktop.py`
 * - `src/pages/Desktop/hooks/useDesktopShellWindowPersistence.ts`
 */

import type { components } from '@/generated/desktop-openapi';
import { authSession } from '@/services/authSession';
import { APIError, api, apiClient } from '../../../services/api/client';
import type { DesktopItem } from '../types/desktop.types';
import {
	buildDesktopItemMetaForApi,
	readFolderIconIdFromMeta,
} from '../utils/desktopFolderIconMeta';
import { normalizeDefaultDesktopStoreAppUserFacingCopy } from '../utils/desktopDefaultAppUserFacingCopy';
import { clearDesktopPersistPatchQueue } from '../utils/desktopPersistPatchQueue';
import { clearDesktopWidgetOutbox } from '../utils/desktopWidgetOutboxQueue';
import { resetCoalescedDesktopShellStateWriter } from '../utils/desktopShellStateWriteCoordinator';
import { resetGafChatSoundShellCache } from '../utils/gafChatShellSound';
import { clearCachedAudioBlobs } from '../utils/musicAudioBlobCache';
import { getBrowserTabLeaderRole } from '@/utils/browserTabLeaderState';
import { readAxiosResponseEtag } from '../../../services/api/conditionalJsonGet';
import { logCacheInvalidation } from '../../../services/api/cacheInvalidationLogger';
import {
	desktopConditionalJsonGet,
	getDesktopConditionalCacheEtag,
	invalidateDesktopConditionalCache,
	updateDesktopConditionalCache,
} from './desktopConditionalGet';

/** Canonical v1 mount (`EliteEW/api/domains/desktop.py`). */
export const DESKTOP_API_V1_BASE = '/api/v1' as const;
/** User desktop router segment (`EliteEW/api/routers/desktop.py` prefix `/desktop`). */
export const DESKTOP_USER_API_PREFIX = '/desktop' as const;

/** Use baseURL so requests hit /api/v1/desktop/* */
const DESKTOP_API_OPTIONS = { baseURL: DESKTOP_API_V1_BASE };
const API_PATH = DESKTOP_USER_API_PREFIX;
export const SHELL_STATE_CONFLICT_MESSAGE =
	'Desktop shell state changed in another session';
const SHELL_STATE_FIELD_ETAGS_HEADER = 'x-shell-state-field-etags';
const SHELL_STATE_IF_MATCH_FIELDS_HEADER = 'X-Shell-State-If-Match-Fields';

export class DesktopShellStateConflictError extends Error {
	constructor(
		message = SHELL_STATE_CONFLICT_MESSAGE,
		public readonly currentEtag?: string | null,
		public readonly serverDetail?: Record<string, unknown> | null
	) {
		super(message);
		this.name = 'DesktopShellStateConflictError';
		Object.setPrototypeOf(this, DesktopShellStateConflictError.prototype);
	}
}

export function isDesktopShellStateConflictError(
	error: unknown
): error is DesktopShellStateConflictError {
	return error instanceof DesktopShellStateConflictError;
}

export function isDesktopShellStateConflictMessage(
	message: string | null | undefined
): boolean {
	if (!message) return false;
	return message.includes(SHELL_STATE_CONFLICT_MESSAGE);
}

// ============= Types =============

type Schema = components['schemas'];

export type Position = Schema['Position'];
export type IconSize = Schema['IconSize'];
export type Theme = Schema['Theme'];
export type ItemType = Schema['ItemType'];

/** Backend string token (e.g. top-right); see OpenAPI `DesktopConfigResponse`. */
export type WidgetsPanelPosition =
	Schema['DesktopConfigResponse']['widgets_panel_position'];

export type DesktopConfigResponse = Schema['DesktopConfigResponse'];
export type DesktopConfigUpdate = Schema['DesktopConfigUpdate'];
export type DesktopItemResponse = Schema['DesktopItemResponse'];
export type DesktopItemCreate = Schema['DesktopItemCreate'];

// ============= API Functions =============

/**
 * Get user's desktop configuration
 */
export async function getDesktopConfig(): Promise<DesktopConfigResponse> {
	return desktopConditionalJsonGet<DesktopConfigResponse>(
		'config',
		`${API_PATH}/config`,
		DESKTOP_API_OPTIONS
	);
}

/**
 * Update user's desktop configuration
 */
export async function updateDesktopConfig(
	data: DesktopConfigUpdate
): Promise<DesktopConfigResponse> {
	const next = await api.patch<DesktopConfigResponse>(
		`${API_PATH}/config`,
		data,
		DESKTOP_API_OPTIONS
	);
	invalidateDesktopConditionalCache('config');
	return next;
}

// ============= Shell state (MRU apps, virtual desktops, windows, …) =============

/** Clipboard row in shell_state (`timestamp` is ISO string from API). */
export interface DesktopClipboardShellRecord {
	id: string;
	type: 'text' | 'image' | 'html';
	content: string;
	preview?: string;
	timestamp: string;
	pinned: boolean;
	source?: string;
}

/** Desktop music resume state in shell_state (snake_case in API JSON). */
export interface DesktopNowPlayingShellState {
	track: {
		id: string;
		name: string;
		thumbnail_url?: string | null;
		version?: string | null;
	} | null;
	current_time: number;
	volume: number;
}

/** Music playback mode + queue persisted separately from `now_playing` transport state. */
export interface DesktopMusicPlaybackShellState {
	playback_rate?: number;
	shuffle?: boolean;
	repeat?: 'none' | 'all' | 'one';
	queue?: Array<{
		id: string;
		name: string;
		thumbnail_url?: string | null;
		version?: string | null;
	}>;
}

/** Music player playlists in shell_state (snake_case in API JSON). */
export interface MusicPlaylistShellRow {
	id: string;
	name: string;
	track_ids: string[];
}

export type DesktopShellState = Schema['DesktopShellStateOut'] & {
	music_playback?: DesktopMusicPlaybackShellState | null;
};
export type DesktopShellStatePatch = Schema['DesktopShellStatePatch'] & {
	music_playback?: DesktopMusicPlaybackShellState | null;
};

export type {
	CoalescedDesktopShellStatePatch,
	ExpansionShellSlicePatch,
	ExpansionShellState,
	ExpansionShellStatePatch,
	EXPANSION_SHELL_STATE_PATCH_KEYS,
} from '../types/desktopShellStatePatch.types';

export type DesktopShellStateHttpResult = {
	state: DesktopShellState;
	etag: string | null;
	fieldEtags: Record<string, string> | null;
};

export type PatchDesktopShellStateOptions = {
	ifMatch?: string | null;
};

function extractShellStateConflictDetail(
	error: APIError
): Record<string, unknown> | null {
	const body =
		error.details && typeof error.details === 'object'
			? (error.details as Record<string, unknown>)
			: null;
	const detail =
		body?.detail && typeof body.detail === 'object'
			? (body.detail as Record<string, unknown>)
			: body;
	return detail && typeof detail === 'object' ? detail : null;
}

function raiseDesktopShellStateConflictError(error: APIError): never {
	const detail = extractShellStateConflictDetail(error);
	const currentEtag =
		typeof detail?.current_etag === 'string' ? detail.current_etag : null;
	logCacheInvalidation('shell_state 412 conflict', {
		currentEtag,
		code:
			typeof detail?.code === 'string'
				? detail.code
				: 'desktop_shell_state_conflict',
	});
	throw new DesktopShellStateConflictError(
		typeof detail?.message === 'string'
			? detail.message
			: SHELL_STATE_CONFLICT_MESSAGE,
		currentEtag,
		detail
	);
}

function readShellStateFieldEtags(
	headers: Record<string, unknown> | undefined
): Record<string, string> | null {
	const raw =
		headers?.[SHELL_STATE_FIELD_ETAGS_HEADER] ??
		headers?.['X-Shell-State-Field-ETags'];
	if (typeof raw !== 'string' || !raw.trim()) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return null;
		}
		const out: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === 'string' && key.trim()) {
				out[key] = value;
			}
		}
		return Object.keys(out).length > 0 ? out : null;
	} catch {
		return null;
	}
}

function buildShellStateIfMatchFieldsHeader(
	patch: DesktopShellStatePatch
): string | null {
	if (!shellStateFieldEtags) return null;
	const fields: Record<string, string> = {};
	for (const [key, value] of Object.entries(patch)) {
		if (value == null) continue;
		const fieldEtag = shellStateFieldEtags[key];
		if (fieldEtag) {
			fields[key] = fieldEtag;
		}
	}
	return Object.keys(fields).length > 0 ? JSON.stringify(fields) : null;
}

/** Single GET — returns body + ETag; no retry or module cache updates. */
export async function getDesktopShellState(): Promise<DesktopShellStateHttpResult> {
	const response = await apiClient.get<DesktopShellState>(
		`${API_PATH}/shell-state`,
		DESKTOP_API_OPTIONS
	);
	return {
		state: response.data,
		etag: readAxiosResponseEtag(response.headers),
		fieldEtags: readShellStateFieldEtags(response.headers),
	};
}

/** Apply server `current_etag` from a 412 before reload/retry (best-effort). */
export function applyDesktopShellStateConflictEtag(
	error: DesktopShellStateConflictError
): void {
	const etag = error.currentEtag?.trim();
	if (!etag) return;
	const detailFieldEtags = readShellStateFieldEtags({
		[SHELL_STATE_FIELD_ETAGS_HEADER]: JSON.stringify(
			error.serverDetail?.current_field_etags ?? null
		),
	});
	if (detailFieldEtags) {
		shellStateFieldEtags = detailFieldEtags;
	}
	const cached = shellStateCache ?? ({} as DesktopShellState);
	updateDesktopConditionalCache('shell-state', cached, etag);
}

/** BroadcastChannel name shared with `desktopRealtimeLeader.ts` (`DESKTOP_REALTIME_BC`). */
const DESKTOP_REALTIME_BC = 'eliteew-desktop-realtime-v1';
/** Follower tabs invalidate RAM shell_state on this message after leader PATCH success. */
export const SHELL_STATE_INVALIDATED_BC = 'shell-state-invalidated';

function notifyFollowersShellStateInvalidated(): void {
	if (typeof BroadcastChannel === 'undefined') {
		return;
	}
	try {
		const ch = new BroadcastChannel(DESKTOP_REALTIME_BC);
		ch.postMessage({ type: SHELL_STATE_INVALIDATED_BC });
		ch.close();
	} catch {
		/* private mode / quota */
	}
}

/** Drop follower RAM shell_state without logout teardown (leader PATCH cross-tab sync). */
export function invalidateDesktopShellStateRamCache(): void {
	logCacheInvalidation('invalidateDesktopShellStateRamCache');
	shellStateCache = null;
	shellStateInflight = null;
	shellStateFieldEtags = null;
	invalidateDesktopConditionalCache('shell-state');
}

/** Drop in-memory shell-state cache and refetch GET (fresh ETag for conflict recovery). */
export async function reloadDesktopShellStateForce(): Promise<DesktopShellState> {
	shellStateCache = null;
	shellStateInflight = null;
	invalidateDesktopConditionalCache('shell-state');
	const { state, etag, fieldEtags } = await getDesktopShellState();
	updateDesktopConditionalCache('shell-state', state, etag);
	shellStateCache = state;
	shellStateFieldEtags = fieldEtags;
	return state;
}

/** Single PATCH with optional `If-Match`; on **412** throws {@link DesktopShellStateConflictError} (no retry). */
export async function patchDesktopShellState(
	patch: DesktopShellStatePatch,
	options?: PatchDesktopShellStateOptions
): Promise<DesktopShellStateHttpResult> {
	const ifMatch = options?.ifMatch;
	try {
		const ifMatchFields = buildShellStateIfMatchFieldsHeader(patch);
		const response = await apiClient.patch<DesktopShellState>(
			`${API_PATH}/shell-state`,
			patch,
			{
				...DESKTOP_API_OPTIONS,
				headers: {
					...(ifMatch ? { 'If-Match': ifMatch } : {}),
					...(ifMatchFields
						? { [SHELL_STATE_IF_MATCH_FIELDS_HEADER]: ifMatchFields }
						: {}),
				},
			}
		);
		return {
			state: response.data,
			etag: readAxiosResponseEtag(response.headers),
			fieldEtags: readShellStateFieldEtags(response.headers),
		};
	} catch (error) {
		if (error instanceof APIError && error.statusCode === 412) {
			raiseDesktopShellStateConflictError(error);
		}
		throw error;
	}
}

let shellStateCache: DesktopShellState | null = null;
let shellStateInflight: Promise<DesktopShellState> | null = null;
let shellStateFieldEtags: Record<string, string> | null = null;

/** Read-through of the last shell-state from GET or merged PATCH (no network). For merge-only PATCH builders. */
export function peekDesktopShellStateCache(): DesktopShellState | null {
	return shellStateCache;
}

/** One in-flight GET per page load; invalidated on merged PATCH response. */
export async function fetchDesktopShellStateDeduplicated(options?: {
	force?: boolean;
}): Promise<DesktopShellState> {
	if (options?.force) {
		return reloadDesktopShellStateForce();
	}
	if (shellStateCache) {
		return shellStateCache;
	}
	if (!shellStateInflight) {
		shellStateInflight = getDesktopShellState()
			.then(({ state, etag, fieldEtags }) => {
				updateDesktopConditionalCache('shell-state', state, etag);
				shellStateFieldEtags = fieldEtags;
				shellStateCache = state;
				return state;
			})
			.finally(() => {
				shellStateInflight = null;
			});
	}
	return shellStateInflight;
}

export async function patchDesktopShellStateMerged(
	patch: DesktopShellStatePatch
): Promise<DesktopShellState> {
	if (!getDesktopConditionalCacheEtag('shell-state')) {
		await fetchDesktopShellStateDeduplicated();
	}
	const ifMatch = getDesktopConditionalCacheEtag('shell-state');
	const { state, etag, fieldEtags } = await patchDesktopShellState(patch, {
		ifMatch,
	});
	updateDesktopConditionalCache('shell-state', state, etag);
	shellStateFieldEtags = fieldEtags;
	shellStateCache = state;
	if (getBrowserTabLeaderRole() === 'leader') {
		notifyFollowersShellStateInvalidated();
	}
	return state;
}

/**
 * Best-effort shell_state PATCH during tab unload (`pagehide` / `beforeunload`).
 * Uses fetch `keepalive` — intentional exception to axios client (same as icon PUT flush).
 */
export function patchDesktopShellStateKeepalive(
	patch: DesktopShellStatePatch
): void {
	if (typeof window === 'undefined') return;
	if (getBrowserTabLeaderRole() !== 'leader') return;
	const token = authSession.token;
	if (!token) return;
	if (Object.keys(patch).length === 0) return;

	const ifMatch = getDesktopConditionalCacheEtag('shell-state');
	const url = `${window.location.origin}${DESKTOP_API_V1_BASE}${API_PATH}/shell-state`;
	void fetch(url, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			...(ifMatch ? { 'If-Match': ifMatch } : {}),
		},
		body: JSON.stringify(patch),
		keepalive: true,
	}).catch(() => {
		/* ignore — unload path */
	});
	// keepalive response is not readable; drop stale etag/body before the next PATCH.
	shellStateCache = null;
	shellStateFieldEtags = null;
	invalidateDesktopConditionalCache('shell-state');
}

/** Call on logout / user switch so the next session refetches. */
export function clearDesktopShellStateCache(): void {
	logCacheInvalidation('clearDesktopShellStateCache');
	clearDesktopPersistPatchQueue();
	clearDesktopWidgetOutbox();
	resetCoalescedDesktopShellStateWriter();
	shellStateCache = null;
	shellStateInflight = null;
	shellStateFieldEtags = null;
	invalidateDesktopConditionalCache('all');
	resetGafChatSoundShellCache();
	void clearCachedAudioBlobs();
}

/**
 * Get all user's desktop items
 */
export async function getDesktopItems(): Promise<DesktopItemResponse[]> {
	const response = await api.get<{ items: DesktopItemResponse[] }>(
		`${API_PATH}/items`,
		DESKTOP_API_OPTIONS
	);
	return response.items;
}

/**
 * Create or update a desktop item
 */
export async function upsertDesktopItem(
	itemId: string,
	data: DesktopItemCreate
): Promise<DesktopItemResponse> {
	return api.put<DesktopItemResponse>(
		`${API_PATH}/items/${itemId}`,
		data,
		DESKTOP_API_OPTIONS
	);
}

/**
 * Update a desktop item (partial)
 */
export async function updateDesktopItem(
	itemId: string,
	data: Partial<DesktopItemCreate>
): Promise<DesktopItemResponse> {
	return api.patch<DesktopItemResponse>(
		`${API_PATH}/items/${itemId}`,
		data,
		DESKTOP_API_OPTIONS
	);
}

/**
 * Delete a desktop item
 */
export async function deleteDesktopItem(itemId: string): Promise<void> {
	await api.delete(`${API_PATH}/items/${itemId}`, DESKTOP_API_OPTIONS);
}

/**
 * Replace all desktop items (bulk update)
 */
export async function replaceDesktopItems(
	items: DesktopItemCreate[]
): Promise<DesktopItemResponse[]> {
	const response = await api.put<{ items: DesktopItemResponse[] }>(
		`${API_PATH}/items`,
		{ items },
		DESKTOP_API_OPTIONS
	);
	return response.items;
}

// ============= App Store & Installed =============

/** @deprecated Use `DesktopAccessGroupRef` naming from OpenAPI; kept as alias. */
export type StoreAccessGroupRef = Schema['DesktopAccessGroupRef'];

export type StoreAppResponse = Schema['StoreAppResponse'];
export type StoreAppDetailResponse = Schema['StoreAppDetailResponse'];
export type EwWalletResponse = Schema['EwWalletResponse'];
export type StoreResponse = Schema['StoreResponse'];
export type InstalledResponse = Schema['InstalledResponse'];

/** No-cache options for store/installed so refetch after install/uninstall returns fresh data */
const DESKTOP_STORE_API_OPTIONS = {
	...DESKTOP_API_OPTIONS,
	headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } as Record<
		string,
		string
	>,
};

/**
 * Elite Worlds wallet for desktop store (balance + family flag from token)
 */
export async function getEwWallet(): Promise<EwWalletResponse> {
	return api.get<EwWalletResponse>(
		`${API_PATH}/ew-wallet`,
		DESKTOP_STORE_API_OPTIONS
	);
}

/**
 * Get app store catalog with installed flags for current user
 */
export async function getStore(): Promise<StoreResponse> {
	const response = await api.get<StoreResponse>(
		`${API_PATH}/store`,
		DESKTOP_STORE_API_OPTIONS
	);
	return {
		...response,
		apps: response.apps.map(normalizeDefaultDesktopStoreAppUserFacingCopy),
	};
}

/**
 * Get single app detail from store (with access check)
 */
export async function getStoreApp(
	appId: string
): Promise<StoreAppDetailResponse> {
	const response = await api.get<StoreAppDetailResponse>(
		`${API_PATH}/store/${appId}`,
		DESKTOP_STORE_API_OPTIONS
	);
	return normalizeDefaultDesktopStoreAppUserFacingCopy(response);
}

/**
 * Get list of installed app_ids for current user
 */
export async function getInstalled(): Promise<InstalledResponse> {
	return desktopConditionalJsonGet<InstalledResponse>(
		'installed',
		`${API_PATH}/installed`,
		DESKTOP_STORE_API_OPTIONS
	);
}

/**
 * Install an app for current user
 */
export async function installApp(appId: string): Promise<void> {
	await api.post(
		`${API_PATH}/installed`,
		{ app_id: appId },
		DESKTOP_API_OPTIONS
	);
	invalidateDesktopConditionalCache('installed');
}

/**
 * Uninstall an app for current user
 */
export async function uninstallApp(appId: string): Promise<void> {
	await api.delete(`${API_PATH}/installed/${appId}`, DESKTOP_API_OPTIONS);
	invalidateDesktopConditionalCache('installed');
}

// ============= Widget Notes & Todos (DB-backed) =============

export type WidgetNoteResponse = Schema['WidgetNoteResponse'];
export type WidgetTodoResponse = Schema['WidgetTodoResponse'];

export async function getWidgetNotes(): Promise<WidgetNoteResponse[]> {
	return api.get<WidgetNoteResponse[]>(
		`${API_PATH}/widget-notes`,
		DESKTOP_API_OPTIONS
	);
}

export async function createWidgetNote(data: {
	content?: string;
	color?: string;
	position?: Position;
	tags?: string[];
}): Promise<WidgetNoteResponse> {
	return api.post<WidgetNoteResponse>(
		`${API_PATH}/widget-notes`,
		data,
		DESKTOP_API_OPTIONS
	);
}

export async function updateWidgetNote(
	noteId: string,
	data: Partial<{
		content: string;
		color: string;
		position: Position;
		tags: string[];
	}>
): Promise<WidgetNoteResponse> {
	return api.patch<WidgetNoteResponse>(
		`${API_PATH}/widget-notes/${noteId}`,
		data,
		DESKTOP_API_OPTIONS
	);
}

export async function deleteWidgetNote(noteId: string): Promise<void> {
	await api.delete(`${API_PATH}/widget-notes/${noteId}`, DESKTOP_API_OPTIONS);
}

export async function getWidgetTodos(): Promise<WidgetTodoResponse[]> {
	return api.get<WidgetTodoResponse[]>(
		`${API_PATH}/widget-todos`,
		DESKTOP_API_OPTIONS
	);
}

export async function createWidgetTodo(data: {
	text: string;
	completed?: boolean;
	priority?: string;
	tags?: string[];
}): Promise<WidgetTodoResponse> {
	return api.post<WidgetTodoResponse>(
		`${API_PATH}/widget-todos`,
		data,
		DESKTOP_API_OPTIONS
	);
}

export async function updateWidgetTodo(
	todoId: string,
	data: Partial<{
		text: string;
		completed: boolean;
		priority: string;
		tags: string[];
	}>
): Promise<WidgetTodoResponse> {
	return api.patch<WidgetTodoResponse>(
		`${API_PATH}/widget-todos/${todoId}`,
		data,
		DESKTOP_API_OPTIONS
	);
}

export async function deleteWidgetTodo(todoId: string): Promise<void> {
	await api.delete(`${API_PATH}/widget-todos/${todoId}`, DESKTOP_API_OPTIONS);
}

// ============= Dashboard Favorites (FavoritesWidget) =============

export type DashboardFavoriteResponse = Schema['DashboardFavoriteResponse'];
export type DashboardFavoriteCreate = Schema['DashboardFavoriteCreate'];

export async function getDashboardFavorites(): Promise<
	DashboardFavoriteResponse[]
> {
	return api.get<DashboardFavoriteResponse[]>(
		`${API_PATH}/favorites`,
		DESKTOP_API_OPTIONS
	);
}

export async function createDashboardFavorite(
	data: DashboardFavoriteCreate
): Promise<DashboardFavoriteResponse> {
	return api.post<DashboardFavoriteResponse>(
		`${API_PATH}/favorites`,
		data,
		DESKTOP_API_OPTIONS
	);
}

export async function deleteDashboardFavorite(
	favoriteId: string
): Promise<void> {
	return api.delete(`${API_PATH}/favorites/${favoriteId}`, DESKTOP_API_OPTIONS);
}

export async function reorderDashboardFavorites(
	favoriteIds: string[]
): Promise<void> {
	await api.patch(
		`${API_PATH}/favorites/reorder`,
		{ favorite_ids: favoriteIds },
		DESKTOP_API_OPTIONS
	);
}

// ============= Wave B: transactional widget-sync =============

export type DesktopWidgetSyncOpKind =
	| 'note_create'
	| 'note_update'
	| 'note_delete'
	| 'todo_create'
	| 'todo_update'
	| 'todo_delete'
	| 'favorite_create'
	| 'favorite_delete'
	| 'favorite_reorder';

export type DesktopWidgetSyncOp = {
	op_id: string;
	kind: DesktopWidgetSyncOpKind;
	client_id?: string | null;
	server_id?: string | null;
	ts?: string | null;
	payload?: Record<string, unknown>;
};

export type DesktopWidgetSyncOpResult = {
	op_id: string;
	status: 'applied' | 'skipped_lww' | 'noop' | 'error';
	server_id?: string | null;
	detail?: string | null;
};

export type DesktopWidgetSyncResponse = {
	results: DesktopWidgetSyncOpResult[];
};

/**
 * POST /desktop/widget-sync — one Postgres transaction + Redis Idempotency-Key.
 * Throws on non-2xx (including network abort) so the client outbox is retained.
 */
export async function syncDesktopWidgets(
	body: { ops: DesktopWidgetSyncOp[] },
	idempotencyKey: string
): Promise<DesktopWidgetSyncResponse> {
	return api.post<DesktopWidgetSyncResponse>(`${API_PATH}/widget-sync`, body, {
		...DESKTOP_API_OPTIONS,
		headers: {
			'Idempotency-Key': idempotencyKey,
		},
	});
}

// ============= Converters =============

/**
 * Convert frontend DesktopItem to API format
 */
export function toApiItem(item: DesktopItem): DesktopItemCreate {
	const meta = buildDesktopItemMetaForApi(item);
	return {
		item_id: item.id,
		item_type: item.type.toUpperCase() as ItemType,
		name: item.name,
		position: item.position,
		color: item.color || null,
		gradient: item.gradient || null,
		is_pinned: item.isPinned || false,
		app_component: item.appComponent || null,
		parent_id: item.parentId ?? null,
		parent_item_id: item.parentId ?? null,
		...(meta ? { meta } : {}),
	};
}

/**
 * Normalize position from API (ensure { x, y } numbers)
 */
function normalizePosition(pos: unknown): { x: number; y: number } {
	if (pos && typeof pos === 'object' && 'x' in pos && 'y' in pos) {
		const p = pos as { x?: unknown; y?: unknown };
		return {
			x: typeof p.x === 'number' ? p.x : Number(p.x) || 20,
			y: typeof p.y === 'number' ? p.y : Number(p.y) || 20,
		};
	}
	return { x: 20, y: 20 };
}

/**
 * Convert API item to frontend DesktopItem format
 */
export function fromApiItem(item: DesktopItemResponse): Partial<DesktopItem> {
	const normalizedName =
		item.app_component === 'GAFChatApp' ? 'GAF Chat' : item.name;
	return {
		id: item.item_id,
		name: normalizedName,
		type: item.item_type.toLowerCase() as 'folder' | 'file' | 'app',
		position: normalizePosition(item.position),
		color: item.color || undefined,
		gradient: item.gradient || undefined,
		isPinned: item.is_pinned,
		appComponent: item.app_component || undefined,
		isSystem: item.is_system ?? false,
		systemKey: item.system_key ?? undefined,
		parentId: item.parent_item_id ?? item.parent_id ?? undefined,
		meta: item.meta ?? undefined,
		folderIconId: readFolderIconIdFromMeta(item.meta),
		created_at: item.created_at,
		updated_at: item.updated_at,
	};
}

/**
 * Convert icon size from API to frontend format
 */
export function fromApiIconSize(size: IconSize): 'small' | 'medium' | 'large' {
	return size.toLowerCase() as 'small' | 'medium' | 'large';
}

/**
 * Convert icon size from frontend to API format
 */
export function toApiIconSize(size: 'small' | 'medium' | 'large'): IconSize {
	return size.toUpperCase() as IconSize;
}

/**
 * Convert theme from API to frontend format
 */
export function fromApiTheme(theme: Theme): 'dark' | 'light' | 'auto' {
	return theme.toLowerCase() as 'dark' | 'light' | 'auto';
}

/**
 * Convert theme from frontend to API format
 */
export function toApiTheme(theme: 'dark' | 'light' | 'auto'): Theme {
	return theme.toUpperCase() as Theme;
}
