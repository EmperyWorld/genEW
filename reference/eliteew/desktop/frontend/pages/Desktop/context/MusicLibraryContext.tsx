/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Music library domain state for desktop player: content-backed tracks, playlists and
 * cross-surface synchronization with global playback domain.
 *
 * Invariants:
 * - Playlist persistence stays server-authoritative (`shell_state.music_playlists`) with
 *   one-way migration from legacy localStorage.
 * - Audio catalog is not fetched on desktop mount; `ensureCatalogLoaded` runs on first Music Player open.
 * - Queue/now-playing may drop stale ids against the partial local track set; playlist prune+persist
 *   runs only after a full catalog load (`catalogLoaded`) and only when the catalog track set changes —
 *   never as a reaction to favorite toggles (that wiped freshly liked ids).
 * - `toggleFavorite` always normalizes playlists so a pre-hydrate empty state still creates «Любимые».
 * - Newly generated tracks are upserted before global play events so the catalog guard does not
 *   immediately clear now-playing for ids not yet returned by the initial mount fetch.
 *
 * Related:
 * - src/pages/MusicPlayer/MusicPlayerPage.tsx
 * - src/pages/Desktop/context/MusicPlaybackDomainContext.tsx
 * - src/pages/Desktop/context/NowPlayingContext.tsx
 */

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
} from 'react';
import { contentApi } from '../../../services/contentApi';
import type { ContentListResult } from '../../../services/contentApi';
import { SYSTEM_FOLDER_ITEM } from '../../ContentManager/sortToSystemFolders';
import {
	applyFavoriteToggle,
	computePlaylistPruneForFullCatalog,
} from '../../MusicPlayer/musicPlayerCatalogPrune';
import {
	FAVORITES_PLAYLIST_ID,
	normalizePlaylistsWithFavorites,
	PLAYLIST_STORAGE_KEY,
	type SavedPlaylist,
} from '../../MusicPlayer/musicPlayerTypes';
import {
	isTrivialServerPlaylists,
	localPlaylistsLookNonTrivial,
	savedPlaylistsShellHash,
	savedPlaylistsToShellPatch,
	shellMusicPlaylistsToSaved,
} from '../../MusicPlayer/musicPlayerPlaylistsSync';
import { CONTENT_MANAGER_LIBRARY_REFRESH_EVENT } from '@/services/unifiedContentEvents';
import { fetchDesktopShellStateDeduplicated } from '../services/desktopApi';
import {
	coerceDesktopMusicPlayTrackDetail,
	DESKTOP_MUSIC_PLAY_TRACK_EVENT,
} from '../utils/desktopDeepLink';
import {
	flushShellStatePipelineNow,
	scheduleShellStateMutation,
	waitForShellStatePipelineFlush,
} from '../utils/desktopShellStateMutationPipeline';
import {
	useMusicPlaybackDomain,
	type MusicDomainTrack,
} from './MusicPlaybackDomainContext';
import { useNowPlayingTransport } from './NowPlayingContext';

function applyPlaylistsIfShellChanged(
	setLists: Dispatch<SetStateAction<SavedPlaylist[]>>,
	next: SavedPlaylist[]
) {
	const normalized = normalizePlaylistsWithFavorites(next);
	setLists((prev) =>
		savedPlaylistsShellHash(prev) === savedPlaylistsShellHash(normalized)
			? prev
			: normalized
	);
}

type MusicLibraryContextValue = {
	tracks: MusicDomainTrack[];
	tracksLoading: boolean;
	catalogLoaded: boolean;
	playlists: SavedPlaylist[];
	favoriteIdsSet: Set<string>;
	favoritesPlaylistTrackCount: number;
	persistPlaylists: (next: SavedPlaylist[]) => void;
	toggleFavorite: (trackId: string) => void;
	removeTrackFromPlaylists: (trackId: string) => void;
	/** Load audio catalog on first Music Player open (not on desktop mount). */
	ensureCatalogLoaded: () => Promise<void>;
	/** Перечитать все audio-треки из контент-менеджера (например после новой генерации). */
	refreshTracks: () => Promise<void>;
	/** Добавить или обновить один трек в локальном списке без полного refetch. */
	upsertTrack: (track: MusicDomainTrack) => void;
};

const MusicLibraryContext = createContext<MusicLibraryContextValue | null>(
	null
);

/** API max page size for compact audio catalog hydration (replaces 24× sequential PAGE_SIZE=50). */
const AUDIO_CATALOG_PAGE_SIZE = 200;
const AUDIO_CATALOG_FETCH_CONCURRENCY = 4;

function mapContentItemsToTracks(
	items: ContentListResult['items']
): MusicDomainTrack[] {
	const loaded: MusicDomainTrack[] = [];
	for (const item of items ?? []) {
		loaded.push({
			id: item.id,
			name: item.name,
			thumbnail_url: item.thumbnail_url ?? null,
			version: item.file_hash ?? item.updated_at,
		});
	}
	return loaded;
}

async function fetchAudioCatalogPage(
	offset: number
): Promise<ContentListResult> {
	return contentApi.listContent({
		content_type: 'audio',
		limit: AUDIO_CATALOG_PAGE_SIZE,
		offset,
		sort_field: 'name',
		sort_order: 'asc',
		list_profile: 'compact',
		exclude_folder_item_id: SYSTEM_FOLDER_ITEM.projects,
	});
}

async function mapConcurrent<T, R>(
	items: readonly T[],
	concurrency: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	if (items.length === 0) return [];
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	const workerCount = Math.min(concurrency, items.length);
	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (nextIndex < items.length) {
				const index = nextIndex;
				nextIndex += 1;
				results[index] = await fn(items[index]);
			}
		})
	);
	return results;
}

export function MusicLibraryProvider({ children }: { children: ReactNode }) {
	const { syncLibraryPlaybackTracks, queue, removeFromQueue } =
		useMusicPlaybackDomain();
	const nowPlaying = useNowPlayingTransport();
	const nowPlayingTrackId = nowPlaying.track?.id ?? null;
	const setNowPlayingTrack = nowPlaying.setTrack;
	const [tracks, setTracks] = useState<MusicDomainTrack[]>([]);
	const [tracksLoading, setTracksLoading] = useState(false);
	const [catalogLoaded, setCatalogLoaded] = useState(false);
	const [tracksSyncReady, setTracksSyncReady] = useState(false);
	const [playlists, setPlaylists] = useState<SavedPlaylist[]>(() =>
		normalizePlaylistsWithFavorites([])
	);
	const playlistsRef = useRef(playlists);
	playlistsRef.current = playlists;

	const loadAudioTracks = useCallback(async (): Promise<MusicDomainTrack[]> => {
		const first = await fetchAudioCatalogPage(0);
		const firstItems = first.items ?? [];
		let total =
			typeof first.total === 'number' && Number.isFinite(first.total)
				? first.total
				: firstItems.length;
		const loaded = mapContentItemsToTracks(firstItems);
		if (firstItems.length === 0 || loaded.length >= total) {
			return Array.from(new Map(loaded.map((t) => [t.id, t])).values());
		}
		const remainingOffsets: number[] = [];
		for (
			let offset = firstItems.length;
			offset < total;
			offset += AUDIO_CATALOG_PAGE_SIZE
		) {
			remainingOffsets.push(offset);
		}
		const pages = await mapConcurrent(
			remainingOffsets,
			AUDIO_CATALOG_FETCH_CONCURRENCY,
			fetchAudioCatalogPage
		);
		for (const page of pages) {
			loaded.push(...mapContentItemsToTracks(page.items));
			if (typeof page.total === 'number' && Number.isFinite(page.total)) {
				total = page.total;
			}
		}
		return Array.from(new Map(loaded.map((t) => [t.id, t])).values());
	}, []);

	const ensureCatalogLoaded = useCallback(async () => {
		if (catalogLoaded || tracksLoading) return;
		setTracksLoading(true);
		try {
			const deduped = await loadAudioTracks();
			setTracks(deduped);
			setTracksSyncReady(true);
			setCatalogLoaded(true);
		} catch {
			setTracksSyncReady(false);
		} finally {
			setTracksLoading(false);
		}
	}, [catalogLoaded, loadAudioTracks, tracksLoading]);

	const refreshTracks = useCallback(async () => {
		try {
			const deduped = await loadAudioTracks();
			setTracks(deduped);
			setTracksSyncReady(true);
			setCatalogLoaded(true);
		} catch {
			/* оставляем предыдущий список */
		}
	}, [loadAudioTracks]);

	const upsertTrack = useCallback((track: MusicDomainTrack) => {
		setTracks((prev) => {
			const m = new Map(prev.map((t) => [t.id, t]));
			m.set(track.id, track);
			return Array.from(m.values());
		});
		setTracksSyncReady(true);
	}, []);

	useEffect(() => {
		syncLibraryPlaybackTracks(tracks);
	}, [tracks, syncLibraryPlaybackTracks]);

	/** Refetch catalog when companion/content manager mutates library (Music Player list already listens). */
	useEffect(() => {
		const onLibraryRefresh = () => {
			void refreshTracks();
		};
		window.addEventListener(
			CONTENT_MANAGER_LIBRARY_REFRESH_EVENT,
			onLibraryRefresh
		);
		return () => {
			window.removeEventListener(
				CONTENT_MANAGER_LIBRARY_REFRESH_EVENT,
				onLibraryRefresh
			);
		};
	}, [refreshTracks]);

	/**
	 * Capture-phase upsert before global play handler: stale `tracks` would otherwise trigger
	 * the guard effect below and immediately clear now-playing for newly generated audio.
	 */
	useEffect(() => {
		const onPlayTrackUpsert = (event: Event) => {
			const detail = coerceDesktopMusicPlayTrackDetail(
				(event as CustomEvent<unknown>).detail
			);
			if (!detail) return;
			upsertTrack({
				id: detail.id,
				name: detail.name,
				thumbnail_url: detail.thumbnail_url ?? null,
				version: detail.version ?? null,
			});
		};
		window.addEventListener(DESKTOP_MUSIC_PLAY_TRACK_EVENT, onPlayTrackUpsert, {
			capture: true,
		});
		return () => {
			window.removeEventListener(
				DESKTOP_MUSIC_PLAY_TRACK_EVENT,
				onPlayTrackUpsert,
				{ capture: true }
			);
		};
	}, [upsertTrack]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			let fromLocal: SavedPlaylist[] | null = null;
			try {
				const raw = localStorage.getItem(PLAYLIST_STORAGE_KEY);
				if (raw) {
					const parsed = JSON.parse(raw) as SavedPlaylist[];
					if (Array.isArray(parsed)) {
						fromLocal = normalizePlaylistsWithFavorites(parsed);
					}
				}
			} catch {
				// ignore
			}
			try {
				const shell = await fetchDesktopShellStateDeduplicated();
				if (cancelled) return;
				const mapped = shellMusicPlaylistsToSaved(shell.music_playlists);
				if (mapped === null) {
					if (fromLocal && localPlaylistsLookNonTrivial(fromLocal)) {
						const next = normalizePlaylistsWithFavorites(fromLocal);
						applyPlaylistsIfShellChanged(setPlaylists, next);
						try {
							localStorage.removeItem(PLAYLIST_STORAGE_KEY);
						} catch {
							// ignore
						}
						scheduleShellStateMutation({
							source: 'other',
							merge: () =>
								savedPlaylistsToShellPatch(next) as Record<string, unknown>,
							immediate: true,
						});
						void flushShellStatePipelineNow('other').catch(() => {});
					} else {
						applyPlaylistsIfShellChanged(
							setPlaylists,
							normalizePlaylistsWithFavorites([])
						);
					}
					return;
				}
				if (
					isTrivialServerPlaylists(mapped) &&
					fromLocal != null &&
					localPlaylistsLookNonTrivial(fromLocal)
				) {
					const next = normalizePlaylistsWithFavorites(fromLocal);
					applyPlaylistsIfShellChanged(setPlaylists, next);
					try {
						localStorage.removeItem(PLAYLIST_STORAGE_KEY);
					} catch {
						// ignore
					}
					scheduleShellStateMutation({
						source: 'other',
						merge: () =>
							savedPlaylistsToShellPatch(next) as Record<string, unknown>,
						immediate: true,
					});
					void flushShellStatePipelineNow('other').catch(() => {});
					return;
				}
				applyPlaylistsIfShellChanged(setPlaylists, mapped);
				try {
					localStorage.removeItem(PLAYLIST_STORAGE_KEY);
				} catch {
					// ignore
				}
			} catch {
				if (cancelled) return;
				if (fromLocal?.length) {
					applyPlaylistsIfShellChanged(
						setPlaylists,
						normalizePlaylistsWithFavorites(fromLocal)
					);
				} else {
					applyPlaylistsIfShellChanged(
						setPlaylists,
						normalizePlaylistsWithFavorites([])
					);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const playlistPersistSnapshotRef = useRef<SavedPlaylist[] | null>(null);

	const persistPlaylists = useCallback((next: SavedPlaylist[]) => {
		const normalized = normalizePlaylistsWithFavorites(next);
		applyPlaylistsIfShellChanged(setPlaylists, normalized);
		playlistPersistSnapshotRef.current = normalized;
		scheduleShellStateMutation({
			source: 'other',
			merge: () =>
				savedPlaylistsToShellPatch(normalized) as Record<string, unknown>,
		});
		void waitForShellStatePipelineFlush().catch(() => {});
	}, []);

	useEffect(() => {
		return () => {
			const snap = playlistPersistSnapshotRef.current;
			if (snap) {
				scheduleShellStateMutation({
					source: 'other',
					merge: () =>
						savedPlaylistsToShellPatch(snap) as Record<string, unknown>,
					immediate: true,
				});
				void flushShellStatePipelineNow('other').catch(() => {});
			}
		};
	}, []);

	const toggleFavorite = useCallback(
		(trackId: string) => {
			persistPlaylists(applyFavoriteToggle(playlists, trackId));
		},
		[persistPlaylists, playlists]
	);

	const removeTrackFromPlaylists = useCallback(
		(trackId: string) => {
			const normalizedId = trackId.trim();
			if (!normalizedId) return;
			persistPlaylists(
				normalizePlaylistsWithFavorites(playlists).map((p) => ({
					...p,
					trackIds: p.trackIds.filter((id) => id !== normalizedId),
				}))
			);
		},
		[persistPlaylists, playlists]
	);

	useEffect(() => {
		if (!tracksSyncReady) return;
		const availableTrackIds = new Set(tracks.map((track) => track.id));
		if (nowPlayingTrackId && !availableTrackIds.has(nowPlayingTrackId)) {
			setNowPlayingTrack(null);
		}
		const queueMissingIds = queue
			.filter((item) => !availableTrackIds.has(item.id))
			.map((item) => item.id);
		for (const missingId of queueMissingIds) {
			removeFromQueue(missingId);
		}
	}, [
		nowPlayingTrackId,
		queue,
		removeFromQueue,
		setNowPlayingTrack,
		tracks,
		tracksSyncReady,
	]);

	// Prune stale playlist ids only when the full catalog snapshot changes — not on every
	// favorite toggle (that race removed freshly liked ids absent from a partial/local set).
	useEffect(() => {
		if (!catalogLoaded || !tracksSyncReady) return;
		const availableTrackIds = new Set(tracks.map((track) => track.id));
		const pruned = computePlaylistPruneForFullCatalog({
			catalogLoaded: true,
			playlists: playlistsRef.current,
			availableTrackIds,
		});
		if (pruned) {
			persistPlaylists(pruned);
		}
	}, [catalogLoaded, persistPlaylists, tracks, tracksSyncReady]);

	const favoriteIdsSet = useMemo(() => {
		const pl = playlists.find((p) => p.id === FAVORITES_PLAYLIST_ID);
		return new Set(pl?.trackIds ?? []);
	}, [playlists]);

	const favoritesPlaylistTrackCount = useMemo(
		() =>
			playlists.find((p) => p.id === FAVORITES_PLAYLIST_ID)?.trackIds.length ??
			0,
		[playlists]
	);

	const value = useMemo<MusicLibraryContextValue>(
		() => ({
			tracks,
			tracksLoading,
			catalogLoaded,
			playlists,
			favoriteIdsSet,
			favoritesPlaylistTrackCount,
			persistPlaylists,
			toggleFavorite,
			removeTrackFromPlaylists,
			ensureCatalogLoaded,
			refreshTracks,
			upsertTrack,
		}),
		[
			tracks,
			tracksLoading,
			catalogLoaded,
			playlists,
			favoriteIdsSet,
			favoritesPlaylistTrackCount,
			persistPlaylists,
			toggleFavorite,
			removeTrackFromPlaylists,
			ensureCatalogLoaded,
			refreshTracks,
			upsertTrack,
		]
	);

	return (
		<MusicLibraryContext.Provider value={value}>
			{children}
		</MusicLibraryContext.Provider>
	);
}

export function useMusicLibraryContext(): MusicLibraryContextValue {
	const value = useContext(MusicLibraryContext);
	if (!value) {
		throw new Error(
			'useMusicLibraryContext must be used within MusicLibraryProvider'
		);
	}
	return value;
}
