/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop data persistence hook: loads/saves config and icons through the Desktop API, keeps local optimistic state,
 * and bridges legacy localStorage fallbacks.
 *
 * Invariants:
 * - Desktop config is loaded from API/PostgreSQL and is not cached as the source of truth in localStorage.
 * - Icon/app snapshots are enriched with safe built-in metadata without changing stable app ids or appComponent values.
 * - Shell state (windows, virtual desktops, MRU) is persisted through `/desktop/shell-state`.
 *
 * Related:
 * - src/pages/Desktop/constants/index.ts
 * - src/pages/Desktop/services/desktopApi.ts
 * - `services/unifiedContentEvents.ts` (DESKTOP_ITEMS_REFRESH_EVENT)
 */

import { notify } from '@/notifications';
import {
	DESKTOP_ITEMS_REFRESH_EVENT,
	type DesktopItemsRefreshDetail,
} from '@/services/unifiedContentEvents';
import { isHttpRequestAbortLikeError } from '@/services/auth/authSessionHttpAbort';
import { contentApi } from '../../../services/contentApi';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../services/api/client';
import authSession from '../../../services/authSession';
import { log } from '../../../utils/logger';
import {
	BootstrappingPhase,
	setBootstrappingPhase,
} from '@/services/boot/bootstrappingState';
import {
	logBootPerformanceSummary,
	markBootPerformance,
} from '@/services/boot/bootPerformance';
import {
	API_ENDPOINTS,
	DEFAULT_APPS,
	DEFAULT_FOLDERS,
	DESKTOP_API_BASE,
	DESKTOP_GRID,
	DESKTOP_GRID_STEPS,
	DESKTOP_ICON_SIZES,
	DESKTOP_FLOATING_WIDGET_POSITION_SEED,
	STORAGE_KEYS,
	WALLPAPERS,
} from '../constants';
import type {
	DesktopConfigUpdate,
	DesktopItemResponse,
} from '../services/desktopApi';
import {
	fromApiIconSize,
	fromApiItem,
	fromApiTheme,
	toApiIconSize,
	toApiItem,
	toApiTheme,
	updateDesktopConfig,
	updateDesktopItem,
	upsertDesktopItem,
} from '../services/desktopApi';
import {
	classifyDesktopLoadFailure,
	type DesktopLoadFailureInfo,
} from '../utils/desktopUi';
import {
	DESKTOP_STORAGE_CONFIG_SAVE_ERROR,
	DESKTOP_STORAGE_SYNC_ERROR,
	type DesktopStorageConfigSaveErrorCode,
	type DesktopStorageSyncErrorCode,
} from '../utils/desktopStorageSyncError';
import { parseDesktopAccentFromApi } from '../utils/desktopAccentColor';
import { normalizeDefaultDesktopAppUserFacingCopy } from '../utils/desktopDefaultAppUserFacingCopy';
import {
	isLegacyHiddenDesktopApp,
	migrateLegacyDesktopChatAppItem,
	shouldMigrateLegacyDesktopChatApp,
} from '../utils/desktopAppRegistry';
import {
	buildDesktopConfigApiPatchPayload,
	coerceDesktopWidgetPosition,
	mergeDesktopConfigWithApiResponse,
} from '../utils/desktopConfigPatch';
import { enqueueDesktopPersistConfigPatch } from '../utils/desktopPersistPatchQueue';
import {
	buildDesktopMarkdownFileItem,
	createEmptyMarkdownBlob,
	inferDesktopFileTypeFromName,
	resolveNextMarkdownFilename,
} from '../utils/createDesktopMarkdownFile';
import {
	collectDesktopFileParentScopeChanges,
	syncDesktopFileContentFolderScopes,
} from '../utils/desktopFileContentFolderScope';
import {
	type UserFolderIconId,
	resolveUserFolderIconNode,
} from '../constants/folderIcons';
import {
	defaultCreateFolderIconId,
	withFolderIconOnItem,
} from '../utils/desktopFolderIconMeta';
import { isDesktopSystemFolder } from '../utils/desktopItemTree';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';
import type {
	DesktopConfig,
	DesktopItem,
	DesktopItemConfig,
} from '../types/desktop.types';
function normalizeDesktopWallpaper(
	primary: string | null | undefined,
	secondary?: string | null
): string {
	const fallback = WALLPAPERS[0]?.style ?? '';
	for (const v of [primary, secondary]) {
		if (typeof v === 'string' && v.trim() !== '') {
			return v.trim();
		}
	}
	return fallback;
}
const SYNC_DEBOUNCE_MS = 600;
const STORAGE_SYNC_META_KEY = `${STORAGE_KEYS.CONFIG}:sync_meta`;

export type DesktopConfigPersistOptions = {
	/**
	 * If false, merge into local desktop config state only — no PATCH to the API.
	 * Default true (when omitted).
	 */
	persistRemote?: boolean;
};

export interface UseDesktopStorageReturn {
	// Config
	config: DesktopConfig | null;
	updateConfig: (
		updates: Partial<DesktopConfig>,
		options?: DesktopConfigPersistOptions
	) => Promise<void>;
	/** Replace merged config locally without PATCH (e.g. cancel «try-on» session). */
	applyDesktopConfigSnapshotLocal: (snapshot: DesktopConfig) => void;
	/** True while a config PATCH request is in flight. */
	isConfigSaving: boolean;
	/** Stable code for config save failures — translate in settings UI. */
	configSaveError: DesktopStorageConfigSaveErrorCode | null;
	/** Apply queued config PATCH body (persist queue flush). */
	applyPersistedConfigPatch: (
		payload: Record<string, unknown>
	) => Promise<void>;

	// Items (folders, apps on desktop)
	items: DesktopItem[];
	updateItemPosition: (
		itemId: string,
		position: { x: number; y: number }
	) => Promise<void>;
	createFolder: (
		name: string,
		options?: { parentId?: string; folderIconId?: UserFolderIconId }
	) => Promise<DesktopItem>;
	updateFolderIcon: (
		itemId: string,
		folderIconId: UserFolderIconId
	) => Promise<void>;
	createMarkdownFile: (options?: {
		parentId?: string;
	}) => Promise<{ contentId: string; item: DesktopItem } | null>;
	deleteItem: (itemId: string) => Promise<void>;
	togglePinItem: (itemId: string) => Promise<void>;
	/** Replace full items list (e.g. after sort). Persists locally and syncs items to server. */
	replaceItems: (next: DesktopItem[]) => void;

	// State
	isLoading: boolean;
	/** True while desktop icons load in the background after shell config is ready. */
	isItemsHydrating: boolean;
	isSyncing: boolean;
	error: DesktopStorageSyncErrorCode | null;
	isOnline: boolean;
	/** True when another tab changed desktop config/items (storage event). User may refresh to reconcile. */
	tabConflictDetected: boolean;
	clearTabConflict: () => void;

	// Actions
	refresh: () => Promise<void>;
	syncToServer: (overrideItems?: DesktopItem[]) => Promise<void>;

	/** Initial load / refresh failed after retries; use with `desktopUi` i18n keys. */
	loadFailure: DesktopLoadFailureInfo | null;
	/** True if loading took unusually long (stale spinner); show manual retry. */
	isLoadingStalled: boolean;
	clearLoadFailure: () => void;
}

const DEFAULT_CONFIG: DesktopConfig = {
	user_id: '',
	wallpaper: WALLPAPERS[0]?.style || '',
	icon_size: 'medium',
	show_widget: false,
	widget_position: { ...DESKTOP_FLOATING_WIDGET_POSITION_SEED },
	theme: 'dark',
	liveWallpaper: false,
	snap_to_grid: true,
	grid_step: 'medium',
	widgets_panel_position: 'top-right',
	compact_widgets: false,
	show_widgets_panel: false,
};

export function useDesktopStorage(): UseDesktopStorageReturn {
	const { t } = useTranslation('desktopUi');
	const [config, setConfig] = useState<DesktopConfig | null>(null);
	const [items, setItems] = useState<DesktopItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isItemsHydrating, setIsItemsHydrating] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [error, setError] = useState<DesktopStorageSyncErrorCode | null>(null);
	const [isOnline, setIsOnline] = useState(navigator.onLine);
	const [tabConflictDetected, setTabConflictDetected] = useState(false);
	const [isConfigSaving, setIsConfigSaving] = useState(false);
	const [configSaveError, setConfigSaveError] =
		useState<DesktopStorageConfigSaveErrorCode | null>(null);
	const [loadFailure, setLoadFailure] = useState<DesktopLoadFailureInfo | null>(
		null
	);
	const [isLoadingStalled, setIsLoadingStalled] = useState(false);

	const pendingUpdates = useRef<Map<string, Partial<DesktopItemConfig>>>(
		new Map()
	);
	const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const itemsRef = useRef<DesktopItem[]>(items);
	itemsRef.current = items;
	const tabIdRef = useRef(
		`desktop-tab-${Math.random().toString(36).slice(2, 10)}`
	);
	const fullSyncInFlightRef = useRef(false);
	const queuedFullSyncItemsRef = useRef<DesktopItem[] | null>(null);
	const loadFromAPIRetryCount = useRef(0);
	const hasLoadedServerSnapshotRef = useRef(false);
	const LOAD_RETRY_MAX = 2;
	const LOAD_RETRY_DELAY_MS = 900;
	const LOAD_STALL_MS = 12_000;

	const clearLoadFailure = useCallback(() => setLoadFailure(null), []);

	useEffect(() => {
		if (!isLoading) {
			setIsLoadingStalled(false);
			return;
		}
		const timer = window.setTimeout(
			() => setIsLoadingStalled(true),
			LOAD_STALL_MS
		);
		return () => window.clearTimeout(timer);
	}, [isLoading]);

	const broadcastDesktopMutation = useCallback((scope: 'config' | 'items') => {
		try {
			localStorage.setItem(
				STORAGE_SYNC_META_KEY,
				JSON.stringify({
					scope,
					tabId: tabIdRef.current,
					updatedAt: Date.now(),
				})
			);
		} catch {
			// ignore storage failures
		}
	}, []);

	// Monitor online status
	useEffect(() => {
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}, []);

	// Detect when another tab changes desktop config/items (storage event only fires for other tabs)
	useEffect(() => {
		const handleStorage = (e: StorageEvent) => {
			if (e.key === STORAGE_KEYS.ITEMS) {
				setTabConflictDetected(true);
				return;
			}
			if (e.key === STORAGE_SYNC_META_KEY && e.newValue) {
				try {
					const payload = JSON.parse(e.newValue) as { tabId?: string };
					if (payload.tabId && payload.tabId !== tabIdRef.current) {
						setTabConflictDetected(true);
					}
				} catch {
					setTabConflictDetected(true);
				}
			}
		};
		window.addEventListener('storage', handleStorage);
		return () => window.removeEventListener('storage', handleStorage);
	}, []);

	const clearTabConflict = useCallback(() => setTabConflictDetected(false), []);

	// При уходе со страницы (обновление/закрытие) срочно отправить pending PUT, иначе данные теряются.
	// Браузерный `fetch` + `keepalive: true` вместо axios `api`: короткое окно в `beforeunload`/`pagehide`,
	// best-effort без таймаутов/очереди инстанса; см. правило «не сырой /api» — это намеренное исключение.
	useEffect(() => {
		const flushPendingSync = () => {
			if (pendingUpdates.current.size === 0) return;
			if (!hasLoadedServerSnapshotRef.current) return;
			const token = authSession.token;
			if (!token) return;
			const base = `${window.location.origin}${DESKTOP_API_BASE}`;
			const currentItems = itemsRef.current;
			pendingUpdates.current.forEach((update, itemId) => {
				const item = currentItems.find((i) => i.id === itemId);
				if (!item) return;
				const payload = {
					...toApiItem(item),
					position: update.position || item.position,
				};
				const url = `${base}${API_ENDPOINTS.ITEM(itemId)}`;
				fetch(url, {
					method: 'PUT',
					body: JSON.stringify(payload),
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					keepalive: true,
				}).catch(() => {});
			});
		};
		const onUnload = () => flushPendingSync();
		window.addEventListener('beforeunload', onUnload);
		window.addEventListener('pagehide', onUnload);
		return () => {
			window.removeEventListener('beforeunload', onUnload);
			window.removeEventListener('pagehide', onUnload);
		};
	}, []);

	// Lay out ALL items in a grid so nothing overlaps (folders first, then apps, then files; then by name)
	const _layoutAllItemsInGrid = useCallback(
		(list: DesktopItem[]): DesktopItem[] => {
			// Use the same offset and grid size as desktop drag/snap (medium step)
			const GRID_OFFSET = DESKTOP_GRID.OFFSET;
			const GRID_SIZE = DESKTOP_GRID_STEPS.medium;
			const cols = Math.max(
				1,
				Math.floor(
					(typeof window !== 'undefined' ? window.innerWidth : 1200) / GRID_SIZE
				)
			);
			const sorted = [...list].sort((a, b) => {
				const typeOrder = { folder: 0, app: 1, file: 2 };
				const ta = typeOrder[a.type] ?? 99;
				const tb = typeOrder[b.type] ?? 99;
				if (ta !== tb) return ta - tb;
				return a.name.localeCompare(b.name, 'ru-RU', {
					sensitivity: 'base',
					numeric: true,
				});
			});
			return sorted.map((item, index) => {
				const col = index % cols;
				const row = Math.floor(index / cols);
				return {
					...item,
					position: {
						x: GRID_OFFSET + col * GRID_SIZE,
						y: GRID_OFFSET + row * GRID_SIZE,
					},
				};
			});
		},
		[]
	);

	// Enrich API items with default app/folder metadata (icon, colors).
	// ВАЖНО: не добавляем новые приложения из DEFAULT_APPS, если их нет в БД —
	// источник правды по наличию иконок на рабочем столе теперь только API (/desktop/items).
	const mergeItemsWithDefaults = useCallback(
		(savedItems: DesktopItem[]): DesktopItem[] => {
			const defaultAppsMap = new Map(DEFAULT_APPS.map((app) => [app.id, app]));
			const gafDefault = defaultAppsMap.get('app-gaf-chat');
			const eliteChatMigrated = savedItems.map((item) => {
				if (!shouldMigrateLegacyDesktopChatApp(item) || !gafDefault) {
					return item;
				}
				return migrateLegacyDesktopChatAppItem(item, gafDefault);
			});
			const dedupedEliteChat = eliteChatMigrated.filter((item, index, arr) => {
				if (item.type === 'app' && item.id === 'app-gaf-chat') {
					return (
						arr.findIndex(
							(x) => x.type === 'app' && x.id === 'app-gaf-chat'
						) === index
					);
				}
				return true;
			});

			const filteredSavedItems = dedupedEliteChat.filter(
				(item) => !(item.type === 'app' && isLegacyHiddenDesktopApp(item))
			);
			const legacyVoiceIds = new Set([
				'app-voice',
				'app-voicecmd',
				'app-transcription',
			]);
			const legacyVoiceComponents = new Set([
				'VoiceStudio',
				'VoiceCommand',
				'AudioTranscriptionPro',
			]);

			const migratedItems = filteredSavedItems
				.map((item) => {
					if (
						item.type !== 'app' ||
						(!legacyVoiceIds.has(item.id) &&
							!(
								item.appComponent &&
								legacyVoiceComponents.has(item.appComponent)
							))
					) {
						return item;
					}
					const studioDefault = defaultAppsMap.get('app-studio-gu');
					if (!studioDefault) return item;
					return {
						...studioDefault,
						...item,
						id: 'app-studio-gu',
						appComponent: 'StudioGU',
						name: studioDefault.name,
						icon: studioDefault.icon,
						description: studioDefault.description ?? item.description,
					};
				})
				.filter((item, index, arr) => {
					if (item.type === 'app' && item.id === 'app-studio-gu') {
						return (
							arr.findIndex(
								(x) => x.type === 'app' && x.id === 'app-studio-gu'
							) === index
						);
					}
					return true;
				});

			const legacySocialIds = new Set(['app-friends', 'app-user-profile']);
			const legacySocialComponents = new Set(['FriendsApp', 'UserProfile']);
			const socialMigrated = migratedItems.map((item) => {
				if (
					item.type !== 'app' ||
					(!legacySocialIds.has(item.id) &&
						!(
							item.appComponent && legacySocialComponents.has(item.appComponent)
						))
				) {
					return item;
				}
				const hubDefault = defaultAppsMap.get('app-social-hub');
				if (!hubDefault) return item;
				return {
					...hubDefault,
					...item,
					id: 'app-social-hub',
					appComponent: 'SocialHubApp',
					name: hubDefault.name,
					icon: hubDefault.icon,
					description: hubDefault.description ?? item.description,
				};
			});
			const dedupedSocial = socialMigrated.filter((item, index, arr) => {
				if (item.type === 'app' && item.id === 'app-social-hub') {
					return (
						arr.findIndex(
							(x) => x.type === 'app' && x.id === 'app-social-hub'
						) === index
					);
				}
				return true;
			});

			const defaultFoldersMap = new Map(
				DEFAULT_FOLDERS.map((folder) => [folder.id, folder])
			);

			const updatedItems = dedupedSocial.map((item) => {
				const defaultApp = defaultAppsMap.get(item.id);
				if (item.type === 'app' && defaultApp) {
					return normalizeDefaultDesktopAppUserFacingCopy({
						...defaultApp,
						...item,
						icon: defaultApp.icon,
						appComponent: item.appComponent ?? defaultApp.appComponent,
						description: item.description ?? defaultApp.description,
						category: item.category ?? defaultApp.category,
						color: item.color ?? defaultApp.color,
						gradient: item.gradient ?? defaultApp.gradient,
						isPinned: item.isPinned ?? defaultApp.isPinned,
					});
				}
				const defaultFolder = defaultFoldersMap.get(item.id);
				if (item.type === 'folder' && defaultFolder) {
					return {
						...item,
						icon: defaultFolder.icon,
						color: item.color ?? defaultFolder.color,
						gradient: item.gradient ?? defaultFolder.gradient,
					};
				}
				if (item.type === 'file') {
					return {
						...item,
						fileType: item.fileType ?? inferDesktopFileTypeFromName(item.name),
					};
				}
				if (
					item.type === 'folder' &&
					!isDesktopSystemFolder(item) &&
					item.folderIconId
				) {
					const iconNode = resolveUserFolderIconNode(item.folderIconId);
					if (iconNode) {
						return { ...item, icon: iconNode };
					}
				}
				return item;
			});

			// Больше не создаём "виртуальные" иконки приложений из DEFAULT_APPS.
			// Если приложение не пришло из API, оно считается не установленным/не доступным.
			return updatedItems;
		},
		[]
	);

	// Offline / без сессии: только дефолты в памяти; источник правды для авторизованных — API.
	const loadFromLocalStorage = useCallback(() => {
		try {
			hasLoadedServerSnapshotRef.current = false;
			try {
				localStorage.removeItem(STORAGE_KEYS.CONFIG);
			} catch {
				// ignore
			}
			const savedItems = localStorage.getItem(STORAGE_KEYS.ITEMS);

			setConfig({ ...DEFAULT_CONFIG, show_widget: false });

			const fallbackItems = mergeItemsWithDefaults([]);
			setItems(fallbackItems);

			if (savedItems) {
				localStorage.removeItem(STORAGE_KEYS.ITEMS);
			}
		} catch (e) {
			log.error(
				'Desktop',
				'Failed to load from localStorage',
				e instanceof Error ? e : undefined
			);
		}
	}, [mergeItemsWithDefaults]);

	/** No-op: desktop config не пишем в localStorage (сервер — источник правды). */
	const saveToLocalStorage = useCallback(
		(_newConfig?: DesktopConfig, _newItems?: DesktopItem[]) => {},
		[]
	);

	// One item per id (API or merge may return duplicates)
	const dedupeItemsById = useCallback((list: DesktopItem[]): DesktopItem[] => {
		const seen = new Set<string>();
		return list.filter((item) => {
			if (seen.has(item.id)) return false;
			seen.add(item.id);
			return true;
		});
	}, []);

	const { isAuthenticated, loading: authLoading, user: authUser } = useAuth();
	const persistSubjectKey = authUser?.id ?? null;
	const hasAuthenticatedSession = isAuthenticated || Boolean(authSession.token);

	// Load from API (only when authenticated; avoids 401 → localStorage overwrite on first paint)
	const loadFromAPI = useCallback(
		async (signal?: AbortSignal) => {
			let retryScheduled = false;
			const aborted = () => Boolean(signal?.aborted);
			try {
				if (aborted()) return;
				setIsLoading(true);
				setLoadFailure(null);
				setBootstrappingPhase(BootstrappingPhase.SYNCING_WORKSPACE);

				const apiOpts = {
					baseURL: DESKTOP_API_BASE,
					signal,
					headers: {
						'Cache-Control': 'no-cache',
						Pragma: 'no-cache',
					} as Record<string, string>,
				};
				const { ensureDesktopShellBootstrap, peekDesktopShellBootstrap } =
					await import('../services/desktopShellBootstrap');
				await ensureDesktopShellBootstrap({ forceDesktop: true });
				if (aborted()) return;
				const bootConfig = peekDesktopShellBootstrap()?.desktop_config;
				const configResponse =
					bootConfig ??
					(await api.get<
						import('../services/desktopApi').DesktopConfigResponse
					>(API_ENDPOINTS.CONFIG, apiOpts));
				if (aborted()) return;
				const accentRaw = (configResponse.accent_color ?? 'purple').trim();
				const accentParsed = parseDesktopAccentFromApi(accentRaw);
				const accentNormalized =
					accentParsed.id === 'custom'
						? accentParsed.customHex
						: accentRaw.toLowerCase();

				const normalizedConfig: DesktopConfig = {
					...configResponse,
					widget_position: coerceDesktopWidgetPosition(
						configResponse.widget_position
					),
					show_widget: false,
					wallpaper: normalizeDesktopWallpaper(configResponse.wallpaper),
					theme: fromApiTheme(configResponse.theme),
					icon_size: fromApiIconSize(configResponse.icon_size),
					accent: accentNormalized,
					liveWallpaper: configResponse.live_wallpaper ?? false,
					snap_to_grid: configResponse.snap_to_grid !== false,
					grid_step: ['small', 'medium', 'large'].includes(
						configResponse.grid_step ?? ''
					)
						? (configResponse.grid_step as 'small' | 'medium' | 'large')
						: 'medium',
					widgets_panel_position: [
						'top-right',
						'top-left',
						'bottom-right',
						'bottom-left',
					].includes(configResponse.widgets_panel_position ?? '')
						? (configResponse.widgets_panel_position as
								| 'top-right'
								| 'top-left'
								| 'bottom-right'
								| 'bottom-left')
						: 'top-right',
					compact_widgets:
						typeof configResponse.compact_widgets === 'boolean'
							? configResponse.compact_widgets
							: false,
					show_widgets_panel:
						typeof configResponse.show_widgets_panel === 'boolean'
							? configResponse.show_widgets_panel
							: false,
					wallpaper_history: Array.isArray(configResponse.wallpapers_history)
						? configResponse.wallpapers_history
						: undefined,
				};

				loadFromAPIRetryCount.current = 0;
				setConfig(normalizedConfig);
				try {
					localStorage.removeItem(STORAGE_KEYS.CONFIG);
				} catch {
					// ignore
				}
				setIsLoading(false);
				markBootPerformance('desktop-config-ready');

				setIsItemsHydrating(true);
				const itemsResponse = await api.get<{ items: DesktopItemResponse[] }>(
					API_ENDPOINTS.ITEMS,
					apiOpts
				);
				if (aborted()) return;
				const rawItems = itemsResponse?.items;
				if (rawItems && rawItems.length > 0) {
					const loadedItems = rawItems.map(
						(row) => ({ ...fromApiItem(row), children: [] }) as DesktopItem
					);
					const deduped = dedupeItemsById(loadedItems);
					const mergedItems = mergeItemsWithDefaults(deduped);

					const appItems = mergedItems.filter((i) => i.type === 'app');
					const missingComponent = appItems.filter(
						(i) => !i.appComponent || i.appComponent.trim() === ''
					);
					if (missingComponent.length > 0) {
						console.warn(
							'[Desktop:Debug] Items without appComponent from API',
							JSON.stringify(
								missingComponent.map((i) => ({ id: i.id, name: i.name }))
							)
						);
					}
					setItems(mergedItems);
					hasLoadedServerSnapshotRef.current = true;
				} else {
					const fallbackItems = mergeItemsWithDefaults([]);
					setItems(fallbackItems);
					hasLoadedServerSnapshotRef.current = true;
				}
				setBootstrappingPhase(BootstrappingPhase.READY);
				markBootPerformance('desktop-items-ready');
				logBootPerformanceSummary();
			} catch (e: unknown) {
				if (aborted() || isHttpRequestAbortLikeError(e)) {
					return;
				}
				hasLoadedServerSnapshotRef.current = false;
				const err = e as { response?: { status: number }; message?: string };
				const status = err.response?.status;
				if (status === 404) {
					setConfig(DEFAULT_CONFIG);
					try {
						const createPayload = {
							...DEFAULT_CONFIG,
							theme: toApiTheme(DEFAULT_CONFIG.theme),
							icon_size: toApiIconSize(DEFAULT_CONFIG.icon_size),
						};
						await api.post(API_ENDPOINTS.CONFIG, createPayload, {
							baseURL: DESKTOP_API_BASE,
							signal,
						});
					} catch (createErr) {
						if (!isHttpRequestAbortLikeError(createErr)) {
							// ignore non-abort create failures
						}
					}
				} else {
					const classified = classifyDesktopLoadFailure(e);
					if (classified.kind === 'aborted') {
						return;
					}
					log.warn(
						'Desktop',
						`Load from API failed: ${status != null ? `HTTP ${status}` : err.message} (${classified.kind})`
					);
					const retriable =
						status === 401 ||
						classified.kind === 'network' ||
						classified.kind === 'timeout' ||
						classified.kind === 'server';

					if (retriable && loadFromAPIRetryCount.current < LOAD_RETRY_MAX) {
						loadFromAPIRetryCount.current += 1;
						retryScheduled = true;
						const delay = LOAD_RETRY_DELAY_MS * loadFromAPIRetryCount.current;
						await new Promise<void>((resolve, reject) => {
							const timer = window.setTimeout(() => resolve(), delay);
							const onAbort = () => {
								window.clearTimeout(timer);
								reject(
									typeof DOMException !== 'undefined'
										? new DOMException('Aborted', 'AbortError')
										: new Error('Aborted')
								);
							};
							if (signal?.aborted) {
								onAbort();
								return;
							}
							signal?.addEventListener('abort', onAbort, { once: true });
						}).catch(() => undefined);
						if (aborted()) return;
						await loadFromAPI(signal);
						return;
					}
					setLoadFailure({
						kind: status === 401 ? 'auth' : classified.kind,
						httpStatus: classified.httpStatus,
					});
				}
			} finally {
				if (!aborted()) {
					setIsItemsHydrating(false);
					if (!retryScheduled) {
						setIsLoading(false);
					}
				}
			}
		},
		[dedupeItemsById, mergeItemsWithDefaults]
	);

	// Initial load: API когда авторизован; иначе дефолты в памяти (без кэша конфига в localStorage).
	useEffect(() => {
		const ac = new AbortController();
		if (!isOnline) {
			loadFromLocalStorage();
			setIsLoading(false);
			return () => ac.abort();
		}
		if (hasAuthenticatedSession) {
			void loadFromAPI(ac.signal);
			return () => ac.abort();
		}
		if (authLoading) {
			setIsLoading(true);
			return () => ac.abort();
		}
		if (!isAuthenticated) {
			loadFromLocalStorage();
			setIsLoading(false);
			return () => ac.abort();
		}
		return () => ac.abort();
	}, [
		authLoading,
		hasAuthenticatedSession,
		isAuthenticated,
		isOnline,
		loadFromAPI,
		loadFromLocalStorage,
	]);

	// Debounced sync to server
	const scheduleSyncToServer = useCallback(() => {
		if (syncTimeoutRef.current) {
			clearTimeout(syncTimeoutRef.current);
		}

		syncTimeoutRef.current = setTimeout(async () => {
			if (
				!isOnline ||
				pendingUpdates.current.size === 0 ||
				!hasLoadedServerSnapshotRef.current
			)
				return;

			setIsSyncing(true);
			setError(null);
			try {
				const updates = Array.from(pendingUpdates.current.entries());
				const currentItems = itemsRef.current;
				const results = await Promise.all(
					updates.map(async ([itemId, update]) => {
						const item = currentItems.find((i) => i.id === itemId);
						if (!item) return { itemId, ok: true };

						const payload = {
							...toApiItem(item),
							position: update.position || item.position,
						};

						try {
							await api.put(API_ENDPOINTS.ITEM(itemId), payload, {
								baseURL: DESKTOP_API_BASE,
							});
							return { itemId, ok: true };
						} catch (e) {
							const status = (e as { response?: { status?: number } })?.response
								?.status;
							log.warn(
								'Desktop',
								`Failed to sync item ${itemId}`,
								status != null ? `HTTP ${status}` : e
							);
							return { itemId, ok: false };
						}
					})
				);

				const succeeded = results.filter((r) => r.ok);
				const failed = results.filter((r) => !r.ok);
				succeeded.forEach((r) => {
					pendingUpdates.current.delete(r.itemId);
				});
				if (failed.length > 0) {
					setError(DESKTOP_STORAGE_SYNC_ERROR.SYNC_FAILED);
					log.warn(
						'Desktop',
						`Sync failed for ${failed.length} items:`,
						failed.map((f) => f.itemId)
					);
				}
			} catch (e) {
				setError(DESKTOP_STORAGE_SYNC_ERROR.SYNC_FAILED);
				log.error(
					'Desktop',
					'Failed to sync to server',
					e instanceof Error ? e : undefined
				);
			} finally {
				setIsSyncing(false);
			}
		}, SYNC_DEBOUNCE_MS);
	}, [isOnline]);

	const applyPersistedConfigPatch = useCallback(
		async (payload: Record<string, unknown>) => {
			const response = await updateDesktopConfig(
				payload as DesktopConfigUpdate
			);
			setConfig((prev) =>
				mergeDesktopConfigWithApiResponse(prev ?? DEFAULT_CONFIG, response)
			);
			broadcastDesktopMutation('config');
			setConfigSaveError(null);
		},
		[broadcastDesktopMutation]
	);

	// Update config (convert theme/icon_size to API uppercase when sending)
	const updateConfig = useCallback(
		async (
			updates: Partial<DesktopConfig>,
			options?: DesktopConfigPersistOptions
		) => {
			const persistRemote = options?.persistRemote !== false;
			const base = config ?? DEFAULT_CONFIG;
			const newConfig = { ...base, ...updates } as DesktopConfig;
			setConfig(newConfig);

			if (!persistRemote) {
				return;
			}

			const patchPayload = buildDesktopConfigApiPatchPayload(updates);
			if (!patchPayload || Object.keys(patchPayload).length === 0) {
				return;
			}

			if (!isOnline) {
				if (persistSubjectKey) {
					enqueueDesktopPersistConfigPatch(persistSubjectKey, patchPayload);
				}
				return;
			}

			try {
				setIsConfigSaving(true);
				setConfigSaveError(null);
				const response = await updateDesktopConfig(
					patchPayload as DesktopConfigUpdate
				);
				setConfig(mergeDesktopConfigWithApiResponse(newConfig, response));
				broadcastDesktopMutation('config');
			} catch (e) {
				if (persistSubjectKey) {
					enqueueDesktopPersistConfigPatch(persistSubjectKey, patchPayload);
				}
				const status =
					(e as { response?: { status?: number }; statusCode?: number })
						?.response?.status ?? (e as { statusCode?: number })?.statusCode;
				if (status === 503) {
					log.warn(
						'Desktop',
						'Config PATCH failed: server temporarily unavailable (503)'
					);
					setConfigSaveError(
						DESKTOP_STORAGE_CONFIG_SAVE_ERROR.QUEUED_SERVER_UNAVAILABLE
					);
				} else {
					log.warn('Desktop', 'Failed to save config to server', e);
					setConfigSaveError(
						DESKTOP_STORAGE_CONFIG_SAVE_ERROR.FAILED_LOCAL_KEPT
					);
				}
			} finally {
				setIsConfigSaving(false);
			}
		},
		[broadcastDesktopMutation, config, isOnline, persistSubjectKey]
	);

	const applyDesktopConfigSnapshotLocal = useCallback(
		(snapshot: DesktopConfig) => {
			setConfig(snapshot);
			setConfigSaveError(null);
		},
		[]
	);

	// Update item position
	const updateItemPosition = useCallback(
		async (itemId: string, position: { x: number; y: number }) => {
			const existing = itemsRef.current.find((i) => i.id === itemId);
			if (
				existing &&
				existing.position.x === position.x &&
				existing.position.y === position.y
			) {
				return;
			}

			setItems((prev) => {
				const updated = prev.map((item) =>
					item.id === itemId ? { ...item, position } : item
				);
				saveToLocalStorage(undefined, updated);
				return updated;
			});

			// Queue for server sync
			pendingUpdates.current.set(itemId, { position });
			broadcastDesktopMutation('items');
			scheduleSyncToServer();
		},
		[broadcastDesktopMutation, saveToLocalStorage, scheduleSyncToServer]
	);

	// Create folder
	const createFolder = useCallback(
		async (
			name: string,
			options?: { parentId?: string; folderIconId?: UserFolderIconId }
		): Promise<DesktopItem> => {
			const parentId = options?.parentId;
			const folderIconId = options?.folderIconId ?? defaultCreateFolderIconId();
			let position = { x: 350, y: 20 };
			if (parentId) {
				const parent = items.find((row) => row.id === parentId);
				position = parent
					? {
							x: parent.position.x + 24,
							y: parent.position.y + 24,
						}
					: { x: 350, y: 40 };
			}
			const iconNode = resolveUserFolderIconNode(folderIconId);
			const newFolder: DesktopItem = withFolderIconOnItem(
				{
					id: `folder-${Date.now()}`,
					name,
					type: 'folder',
					position,
					parentId,
					isPinned: false,
					children: [],
					icon: iconNode,
				},
				folderIconId
			);

			setItems((prev) => {
				const updated = [...prev, newFolder];
				saveToLocalStorage(undefined, updated);
				return updated;
			});

			if (isOnline) {
				try {
					await api.post(API_ENDPOINTS.ITEMS, toApiItem(newFolder), {
						baseURL: DESKTOP_API_BASE,
					});
				} catch (e) {
					log.warn('Desktop', 'Failed to create folder on server', e);
				}
			}

			return newFolder;
		},
		[isOnline, items, saveToLocalStorage]
	);

	const updateFolderIcon = useCallback(
		async (itemId: string, folderIconId: UserFolderIconId) => {
			const iconNode = resolveUserFolderIconNode(folderIconId);
			setItems((prev) => {
				const updated = prev.map((row) =>
					row.id === itemId
						? {
								...withFolderIconOnItem(row, folderIconId),
								icon: iconNode,
							}
						: row
				);
				saveToLocalStorage(undefined, updated);
				return updated;
			});

			if (isOnline) {
				try {
					await updateDesktopItem(itemId, {
						meta: { folder_icon: folderIconId },
					});
					broadcastDesktopMutation('items');
				} catch (e) {
					log.warn('Desktop', 'Failed to update folder icon on server', e);
				}
			}
		},
		[broadcastDesktopMutation, isOnline, saveToLocalStorage]
	);

	const createMarkdownFile = useCallback(
		async (options?: {
			parentId?: string;
		}): Promise<{
			contentId: string;
			item: DesktopItem;
		} | null> => {
			const filename = resolveNextMarkdownFilename(items);
			const parentId = options?.parentId;
			const parentKey = parentId ?? '';
			const gridStepKey =
				config?.grid_step === 'small' ||
				config?.grid_step === 'medium' ||
				config?.grid_step === 'large'
					? config.grid_step
					: 'medium';
			const iconSizeKey =
				config?.icon_size === 'small' ||
				config?.icon_size === 'medium' ||
				config?.icon_size === 'large'
					? config.icon_size
					: 'medium';
			const gridSize = DESKTOP_GRID_STEPS[gridStepKey];
			const wa = readDesktopWorkArea();
			const iconMetrics =
				DESKTOP_ICON_SIZES[iconSizeKey] ?? DESKTOP_ICON_SIZES.medium;
			const layoutMax = {
				maxX: Math.max(DESKTOP_GRID.OFFSET, wa.width - iconMetrics.width),
				maxY: Math.max(DESKTOP_GRID.OFFSET, wa.height - iconMetrics.height),
			};
			const seed = findNearestFreePosition(
				items,
				'__new_md__',
				DESKTOP_GRID.OFFSET + gridSize,
				DESKTOP_GRID.OFFSET + gridSize,
				gridSize,
				DESKTOP_GRID.OFFSET,
				layoutMax
			);
			const position = snapToGrid(
				seed.x,
				seed.y,
				gridSize,
				DESKTOP_GRID.OFFSET,
				layoutMax
			);

			try {
				const file = createEmptyMarkdownBlob(filename);
				const uploaded = await contentApi.uploadContent(file, {
					name: filename,
					folder_item_id: parentId ?? null,
				});
				const contentId = uploaded.id?.trim();
				if (!contentId) {
					notify.error(t('storage.createMarkdownFailed'));
					return null;
				}
				const displayName = uploaded.name?.trim() || filename;
				const fileItem = buildDesktopMarkdownFileItem({
					contentId,
					name: displayName,
					position,
					parentId,
				});

				setItems((prev) => {
					if (
						prev.some(
							(row) =>
								row.type === 'file' &&
								row.id === contentId &&
								(row.parentId ?? '') === parentKey
						)
					) {
						return prev;
					}
					const updated = [...prev, fileItem];
					saveToLocalStorage(undefined, updated);
					return updated;
				});

				if (isOnline) {
					try {
						await upsertDesktopItem(contentId, toApiItem(fileItem));
						broadcastDesktopMutation('items');
					} catch (e) {
						log.warn(
							'Desktop',
							'Failed to create markdown shortcut on server',
							e
						);
					}
				}

				return { contentId, item: fileItem };
			} catch (e) {
				log.warn('Desktop', 'Failed to create markdown file', e);
				notify.error(t('storage.createMarkdownFailed'));
				return null;
			}
		},
		[
			config?.grid_step,
			config?.icon_size,
			broadcastDesktopMutation,
			isOnline,
			items,
			saveToLocalStorage,
			t,
		]
	);

	// Delete item (system folders are not deleted)
	const deleteItem = useCallback(
		async (itemId: string) => {
			const item = items.find((i) => i.id === itemId);
			if (item?.isSystem) return;

			if (isOnline) {
				try {
					await api.delete(API_ENDPOINTS.ITEM(itemId), {
						baseURL: DESKTOP_API_BASE,
					});
				} catch (e: unknown) {
					const ax = e as {
						response?: { status?: number; data?: { detail?: unknown } };
					};
					if (ax.response?.status === 409) {
						const d = ax.response.data?.detail;
						const msg =
							typeof d === 'object' &&
							d !== null &&
							'message' in d &&
							typeof (d as { message: unknown }).message === 'string'
								? (d as { message: string }).message
								: t('storage.deleteProjectFolderConflict');
						notify.error(msg);
						return;
					}
					log.warn('Desktop', 'Failed to delete item on server', e);
					notify.error(t('storage.deleteItemFailed'));
					return;
				}
			}

			setItems((prev) => {
				const updated = prev.filter((row) => row.id !== itemId);
				saveToLocalStorage(undefined, updated);
				return updated;
			});
		},
		[items, isOnline, saveToLocalStorage, t]
	);

	// Toggle pin
	const togglePinItem = useCallback(
		async (itemId: string) => {
			setItems((prev) => {
				const updated = prev.map((item) =>
					item.id === itemId ? { ...item, isPinned: !item.isPinned } : item
				);
				saveToLocalStorage(undefined, updated);
				return updated;
			});

			const item = items.find((i) => i.id === itemId);
			if (isOnline && item) {
				try {
					await api.patch(
						API_ENDPOINTS.ITEM(itemId),
						{ is_pinned: !item.isPinned },
						{ baseURL: DESKTOP_API_BASE }
					);
				} catch (e) {
					log.warn('Desktop', 'Failed to toggle pin on server', e);
				}
			}
		},
		[items, isOnline, saveToLocalStorage]
	);

	// Replace full items list (used by sort so storage and reducer stay in sync)
	// Manual refresh
	const refresh = useCallback(async () => {
		setLoadFailure(null);
		if (isOnline) {
			await loadFromAPI();
		} else {
			loadFromLocalStorage();
		}
	}, [isOnline, loadFromAPI, loadFromLocalStorage]);

	// Content Manager (and peers) mutate `/desktop/items` outside this hook — reload icons/EvaFile.
	// Optimistic drop of removed ids blocks stale bulk PUT from resurrecting deleted folders.
	useEffect(() => {
		const onItemsRefresh = (event: Event): void => {
			const detail = (event as CustomEvent<DesktopItemsRefreshDetail>).detail;
			const removed = (detail?.removedItemIds ?? [])
				.map((id) => String(id || '').trim())
				.filter(Boolean);
			if (removed.length > 0) {
				const removedSet = new Set(removed);
				for (const id of removedSet) {
					pendingUpdates.current.delete(id);
				}
				if (queuedFullSyncItemsRef.current) {
					queuedFullSyncItemsRef.current =
						queuedFullSyncItemsRef.current.filter(
							(row) => !removedSet.has(row.id)
						);
				}
				setItems((prev) => {
					const updated = prev.filter((row) => !removedSet.has(row.id));
					if (updated.length === prev.length) return prev;
					saveToLocalStorage(undefined, updated);
					return updated;
				});
			}
			void refresh();
		};
		window.addEventListener(DESKTOP_ITEMS_REFRESH_EVENT, onItemsRefresh);
		return () => {
			window.removeEventListener(DESKTOP_ITEMS_REFRESH_EVENT, onItemsRefresh);
		};
	}, [refresh, saveToLocalStorage]);

	// Manual sync; pass items to send when state may not have updated yet (e.g. after replaceItems)
	const syncToServer = useCallback(
		async (overrideItems?: DesktopItem[]) => {
			if (!isOnline || !hasLoadedServerSnapshotRef.current) return;

			const listToSend = overrideItems ?? items;
			if (fullSyncInFlightRef.current) {
				queuedFullSyncItemsRef.current = listToSend;
				return;
			}

			fullSyncInFlightRef.current = true;
			setIsSyncing(true);
			setError(null);
			try {
				const itemPayloads = listToSend.map((item) => toApiItem(item));
				await api.put(
					API_ENDPOINTS.ITEMS,
					{ items: itemPayloads },
					{ baseURL: DESKTOP_API_BASE }
				);
				broadcastDesktopMutation('items');
			} catch (e) {
				const status =
					(e as { statusCode?: number }).statusCode ??
					(e as { response?: { status?: number } })?.response?.status;
				if (status === 503) {
					log.warn(
						'Desktop',
						'Config saved locally; server temporarily unavailable (503)'
					);
					setError(DESKTOP_STORAGE_SYNC_ERROR.SERVER_UNAVAILABLE_LOCAL);
				} else {
					log.error(
						'Desktop',
						'Failed to sync to server',
						e instanceof Error ? e : undefined
					);
					setError(DESKTOP_STORAGE_SYNC_ERROR.SERVER_SYNC_FAILED);
				}
			} finally {
				fullSyncInFlightRef.current = false;
				setIsSyncing(false);
				const queuedItems = queuedFullSyncItemsRef.current;
				queuedFullSyncItemsRef.current = null;
				if (queuedItems && queuedItems !== listToSend) {
					void syncToServer(queuedItems);
				}
			}
		},
		[broadcastDesktopMutation, items, isOnline]
	);

	// Replace full items list (used by sort/group-drag/paste/delete/pin/rename/move). Persists and full-syncs.
	const replaceItems = useCallback(
		(next: DesktopItem[]) => {
			const prev = itemsRef.current;
			const scopeChanges = collectDesktopFileParentScopeChanges(prev, next);

			setItems(next);
			saveToLocalStorage(undefined, next);
			broadcastDesktopMutation('items');
			syncToServer(next);

			if (isOnline && scopeChanges.length > 0) {
				void syncDesktopFileContentFolderScopes(scopeChanges).then(
					({ ok, fail }) => {
						if (fail > 0) {
							log.warn(
								'Desktop',
								`Content folder/project scope sync failed for ${fail}/${scopeChanges.length} files (ok=${ok})`
							);
						}
					}
				);
			}
		},
		[broadcastDesktopMutation, isOnline, saveToLocalStorage, syncToServer]
	);

	return {
		config,
		updateConfig,
		applyDesktopConfigSnapshotLocal,
		isConfigSaving,
		configSaveError,
		applyPersistedConfigPatch,
		items,
		updateItemPosition,
		createFolder,
		updateFolderIcon,
		createMarkdownFile,
		deleteItem,
		togglePinItem,
		replaceItems,
		isLoading,
		isItemsHydrating,
		isSyncing,
		error,
		isOnline,
		tabConflictDetected,
		clearTabConflict,
		refresh,
		syncToServer,
		loadFailure,
		isLoadingStalled,
		clearLoadFailure,
	};
}

export {
	isWallpaperTooLargeForApi,
	MAX_WALLPAPER_LENGTH,
} from '../utils/desktopConfigPatch';
