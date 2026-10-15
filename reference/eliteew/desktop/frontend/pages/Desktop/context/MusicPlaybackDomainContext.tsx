/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Domain-level music queue, shuffle/repeat, and `playTrack` bridge to `NowPlayingContext` transport (global `<audio>`).
 *
 * Invariants:
 * - Listens for `desktop-music-play-track` so the companion and deep-links can start playback without opening MusicPlayer.
 *
 * Related:
 * - NowPlayingContext.tsx · MusicPlayerPage.tsx · desktopDeepLink.ts
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
import type { AudioSourceSurface } from '@/services/audio/playerAudioContracts';
import {
	fetchDesktopShellStateDeduplicated,
	type DesktopMusicPlaybackShellState,
} from '../services/desktopApi';
import {
	coerceDesktopMusicPlayTrackDetail,
	DESKTOP_MUSIC_ENQUEUE_TRACK_EVENT,
	DESKTOP_MUSIC_PLAY_TRACK_EVENT,
} from '../utils/desktopDeepLink';
import {
	scheduleShellStateMutation,
	waitForShellStatePipelineFlush,
} from '../utils/desktopShellStateMutationPipeline';
import { useNowPlayingTransport } from './NowPlayingContext';

export type MusicRepeatMode = 'none' | 'all' | 'one';

export interface MusicDomainTrack {
	id: string;
	name: string;
	thumbnail_url?: string | null;
	version?: string | null;
	mime_type?: string | null;
	source_surface?: AudioSourceSurface;
}

const MAX_PERSISTED_QUEUE_ITEMS = 256;
const MUSIC_PLAYBACK_PERSIST_DEBOUNCE_MS = 900;

function sanitizeQueueTrack(raw: unknown): MusicDomainTrack | null {
	if (!raw || typeof raw !== 'object') {
		if (typeof raw === 'string' && raw.trim()) {
			return {
				id: raw.trim(),
				name: raw.trim(),
				thumbnail_url: null,
				version: null,
				source_surface: 'music-player',
			};
		}
		return null;
	}
	const rec = raw as Record<string, unknown>;
	const id =
		typeof rec.id === 'string' && rec.id.trim()
			? rec.id.trim()
			: typeof rec.track_id === 'string' && rec.track_id.trim()
				? rec.track_id.trim()
				: typeof rec.content_id === 'string' && rec.content_id.trim()
					? rec.content_id.trim()
					: typeof rec.unified_content_id === 'string' &&
							rec.unified_content_id.trim()
						? rec.unified_content_id.trim()
						: '';
	if (!id) return null;
	const name =
		typeof rec.name === 'string' && rec.name.trim()
			? rec.name.trim()
			: typeof rec.track_name === 'string' && rec.track_name.trim()
				? rec.track_name.trim()
				: id;
	const thumbnailUrl =
		typeof rec.thumbnail_url === 'string'
			? rec.thumbnail_url.trim()
			: typeof rec.thumbnailUrl === 'string'
				? rec.thumbnailUrl.trim()
				: null;
	const version =
		typeof rec.version === 'string' && rec.version.trim()
			? rec.version.trim()
			: null;
	return {
		id,
		name,
		thumbnail_url: thumbnailUrl,
		version,
		source_surface: 'music-player',
	};
}

function normalizePersistedMusicPlayback(raw: unknown): Required<
	Pick<DesktopMusicPlaybackShellState, 'shuffle' | 'repeat' | 'queue'>
> & {
	playback_rate: number;
} {
	const rec =
		raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const shuffleRaw = rec.shuffle;
	const repeatRaw = rec.repeat;
	const playbackRateRaw =
		rec.playback_rate ?? rec.playbackRate ?? rec.rate ?? rec.speed;
	const queueRaw =
		rec.queue ?? rec.queue_items ?? rec.queue_track_ids ?? rec.queueTrackIds;
	const queue: MusicDomainTrack[] = [];
	if (Array.isArray(queueRaw)) {
		for (const row of queueRaw) {
			const track = sanitizeQueueTrack(row);
			if (!track) continue;
			if (queue.some((item) => item.id === track.id)) continue;
			queue.push(track);
			if (queue.length >= MAX_PERSISTED_QUEUE_ITEMS) break;
		}
	}
	let repeat: MusicRepeatMode = 'none';
	if (repeatRaw === 'all' || repeatRaw === 'one' || repeatRaw === 'none') {
		repeat = repeatRaw;
	}
	const playbackRateNum = Number(playbackRateRaw);
	return {
		shuffle: Boolean(shuffleRaw),
		repeat,
		queue,
		playback_rate:
			Number.isFinite(playbackRateNum) && playbackRateNum > 0
				? Math.max(0.5, Math.min(2, playbackRateNum))
				: 1,
	};
}

interface MusicPlaybackDomainValue {
	shuffle: boolean;
	setShuffle: Dispatch<SetStateAction<boolean>>;
	repeat: MusicRepeatMode;
	setRepeat: Dispatch<SetStateAction<MusicRepeatMode>>;
	queue: MusicDomainTrack[];
	/** Полный каталог аудио с библиотеки рабочего стола — источник для превью/виджета, когда музыкальный апп закрыт. */
	syncLibraryPlaybackTracks: (tracks: MusicDomainTrack[]) => void;
	/**
	 * Снимок того, что сейчас видит пользователь в Music Player (фильтр, плейлист и т.д.).
	 * `null` при размонтировании аппа — предыдущий/следующий трек считаются по данным библиотеки.
	 */
	setPlayerPlaybackBrowseOverride: (tracks: MusicDomainTrack[] | null) => void;
	playTrack: (track: MusicDomainTrack) => void;
	goPrev: () => void;
	goNext: () => void;
	hasPrev: boolean;
	hasNext: boolean;
	enqueue: (track: MusicDomainTrack) => void;
	enqueueNext: (track: MusicDomainTrack) => void;
	reorderQueue: (fromIndex: number, toIndex: number) => void;
	moveQueueItemToTop: (trackId: string) => void;
	removeFromQueue: (trackId: string) => void;
	clearQueue: () => void;
}

const MusicPlaybackDomainContext =
	createContext<MusicPlaybackDomainValue | null>(null);

function shuffleKeepingCurrent(
	ids: string[],
	currentId: string | null | undefined
): string[] {
	const base = [...ids];
	if (base.length <= 1) return base;
	for (let i = base.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[base[i], base[j]] = [base[j], base[i]];
	}
	if (!currentId) return base;
	const idx = base.indexOf(currentId);
	if (idx <= 0) return base;
	const [cur] = base.splice(idx, 1);
	base.unshift(cur);
	return base;
}

/** Canonical JSON for deduping propagate-to-playback updates (avoid React max update depth / #185). */
function musicDomainTracksFingerprint(tracks: MusicDomainTrack[]): string {
	return JSON.stringify(
		[...tracks]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((t) => ({
				id: t.id,
				name: t.name,
				version: t.version ?? null,
				thumbnail_url: t.thumbnail_url ?? null,
			}))
	);
}

export function MusicPlaybackDomainProvider({
	children,
}: {
	children: ReactNode;
}) {
	const transport = useNowPlayingTransport();
	const [shuffle, setShuffle] = useState(false);
	const [repeat, setRepeat] = useState<MusicRepeatMode>('none');
	const [queue, setQueue] = useState<MusicDomainTrack[]>([]);
	const [activeTracks, setActiveTracksState] = useState<MusicDomainTrack[]>([]);
	const [catalog, setCatalog] = useState<Record<string, MusicDomainTrack>>({});
	const currentTrackId = transport.track?.id ?? null;

	const stableActiveTrackIdsRef = useRef<string[]>([]);
	const activeTrackIds = useMemo(() => {
		const next = activeTracks.map((t) => t.id);
		const prev = stableActiveTrackIdsRef.current;
		if (prev.length === next.length && prev.every((id, i) => id === next[i])) {
			return prev;
		}
		stableActiveTrackIdsRef.current = next;
		return next;
	}, [activeTracks]);

	const [playOrder, setPlayOrder] = useState<string[]>([]);

	const libraryTracksRef = useRef<MusicDomainTrack[]>([]);
	const playerBrowseOverrideRef = useRef<MusicDomainTrack[] | null>(null);
	const activeTracksFingerprintRef = useRef<string>('__init__');
	const libraryCommittedFingerprintRef = useRef<string | null>(null);
	const shellHydratedRef = useRef(false);
	const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastPersistFingerprintRef = useRef<string>('');

	const catalogShallowEquivalent = useCallback(
		(
			prev: Record<string, MusicDomainTrack>,
			next: Record<string, MusicDomainTrack>
		): boolean => {
			const pKeys = Object.keys(prev);
			const nKeys = Object.keys(next);
			if (pKeys.length !== nKeys.length) return false;
			for (const id of nKeys) {
				if (prev[id] !== next[id]) return false;
			}
			return true;
		},
		[]
	);

	const commitPlaybackTrackList = useCallback(() => {
		const library = libraryTracksRef.current;
		const overridden = playerBrowseOverrideRef.current;
		const effective = overridden ?? library;
		const libraryFp = musicDomainTracksFingerprint(library);
		const effectiveFp = musicDomainTracksFingerprint(effective);
		const libraryUnchangedSinceCommit =
			libraryFp === libraryCommittedFingerprintRef.current;
		const effectiveUnchanged =
			effectiveFp === activeTracksFingerprintRef.current;
		if (libraryUnchangedSinceCommit && effectiveUnchanged) {
			return;
		}

		libraryCommittedFingerprintRef.current = libraryFp;

		if (!effectiveUnchanged) {
			activeTracksFingerprintRef.current = effectiveFp;
			setActiveTracksState(effective);
		}

		setCatalog((prev) => {
			const next = { ...prev };
			for (const t of library) {
				next[t.id] = t;
			}
			for (const t of effective) {
				next[t.id] = t;
			}
			return catalogShallowEquivalent(prev, next) ? prev : next;
		});
	}, [catalogShallowEquivalent]);

	const syncLibraryPlaybackTracks = useCallback(
		(tracks: MusicDomainTrack[]) => {
			libraryTracksRef.current = tracks;
			commitPlaybackTrackList();
		},
		[commitPlaybackTrackList]
	);

	const setPlayerPlaybackBrowseOverride = useCallback(
		(tracks: MusicDomainTrack[] | null) => {
			playerBrowseOverrideRef.current = tracks;
			commitPlaybackTrackList();
		},
		[commitPlaybackTrackList]
	);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const shell = await fetchDesktopShellStateDeduplicated();
				if (cancelled) return;
				const persisted = normalizePersistedMusicPlayback(
					(shell as { music_playback?: unknown }).music_playback
				);
				setShuffle(persisted.shuffle);
				setRepeat(persisted.repeat);
				setQueue(persisted.queue);
				transport.setPlaybackRate(persisted.playback_rate);
			} catch {
				// keep in-memory defaults when shell_state is unavailable
			} finally {
				if (!cancelled) {
					shellHydratedRef.current = true;
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [transport]);

	useEffect(() => {
		setPlayOrder((prev) => {
			if (activeTrackIds.length === 0) {
				return prev.length === 0 ? prev : [];
			}
			const computed = shuffle
				? shuffleKeepingCurrent(activeTrackIds, currentTrackId)
				: activeTrackIds;
			if (
				prev.length === computed.length &&
				prev.every((id, i) => id === computed[i])
			) {
				return prev;
			}
			return computed;
		});
	}, [activeTrackIds, shuffle, currentTrackId]);

	const orderIndex = useMemo(() => {
		if (!currentTrackId || playOrder.length === 0) return -1;
		return playOrder.indexOf(currentTrackId);
	}, [currentTrackId, playOrder]);

	const hasPrev = orderIndex > 0;
	const hasNext = orderIndex >= 0 && orderIndex < playOrder.length - 1;

	const playTrack = useCallback(
		(track: MusicDomainTrack) => {
			const normalized: MusicDomainTrack = {
				...track,
				mime_type: track.mime_type ?? 'audio/mpeg',
			};
			setCatalog((prev) => {
				const merged: MusicDomainTrack = {
					...prev[normalized.id],
					...normalized,
				};
				const next = { ...prev, [normalized.id]: merged };
				return catalogShallowEquivalent(prev, next) ? prev : next;
			});
			void transport.playTrack(normalized);
		},
		[catalogShallowEquivalent, transport]
	);

	const goPrev = useCallback(() => {
		if (!hasPrev || orderIndex <= 0) return;
		const id = playOrder[orderIndex - 1];
		const track = catalog[id];
		if (!track) return;
		void transport.playTrack(track);
	}, [hasPrev, orderIndex, playOrder, catalog, transport]);

	const goNext = useCallback(() => {
		if (!hasNext || orderIndex < 0) return;
		const id = playOrder[orderIndex + 1];
		const track = catalog[id];
		if (!track) return;
		void transport.playTrack(track);
	}, [hasNext, orderIndex, playOrder, catalog, transport]);

	const enqueue = useCallback((track: MusicDomainTrack) => {
		setQueue((prev) => {
			if (prev.some((x) => x.id === track.id)) return prev;
			return [...prev, track].slice(0, MAX_PERSISTED_QUEUE_ITEMS);
		});
	}, []);

	const enqueueNext = useCallback((track: MusicDomainTrack) => {
		setQueue((prev) =>
			[track, ...prev.filter((x) => x.id !== track.id)].slice(
				0,
				MAX_PERSISTED_QUEUE_ITEMS
			)
		);
	}, []);

	const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
		setQueue((prev) => {
			if (
				fromIndex < 0 ||
				toIndex < 0 ||
				fromIndex >= prev.length ||
				toIndex >= prev.length ||
				fromIndex === toIndex
			) {
				return prev;
			}
			const next = [...prev];
			const [moved] = next.splice(fromIndex, 1);
			if (!moved) return prev;
			next.splice(toIndex, 0, moved);
			return next;
		});
	}, []);

	const moveQueueItemToTop = useCallback((trackId: string) => {
		setQueue((prev) => {
			const index = prev.findIndex((track) => track.id === trackId);
			if (index <= 0) return prev;
			const next = [...prev];
			const [moved] = next.splice(index, 1);
			if (!moved) return prev;
			next.unshift(moved);
			return next;
		});
	}, []);

	const removeFromQueue = useCallback((trackId: string) => {
		setQueue((prev) => prev.filter((x) => x.id !== trackId));
	}, []);

	const clearQueue = useCallback(() => {
		setQueue([]);
	}, []);

	useEffect(() => {
		if (!shellHydratedRef.current) return;
		if (persistTimerRef.current) {
			clearTimeout(persistTimerRef.current);
		}
		persistTimerRef.current = setTimeout(() => {
			persistTimerRef.current = null;
			const payload: DesktopMusicPlaybackShellState = {
				playback_rate: transport.playbackRate,
				shuffle,
				repeat,
				queue: queue.map((track) => ({
					id: track.id,
					name: track.name,
					thumbnail_url: track.thumbnail_url ?? null,
					version: track.version ?? null,
				})),
			};
			const fingerprint = JSON.stringify(payload);
			if (lastPersistFingerprintRef.current === fingerprint) {
				return;
			}
			lastPersistFingerprintRef.current = fingerprint;
			scheduleShellStateMutation({
				source: 'other',
				merge: () => ({ music_playback: payload }),
			});
			void waitForShellStatePipelineFlush().catch(() => {});
		}, MUSIC_PLAYBACK_PERSIST_DEBOUNCE_MS);
		return () => {
			if (persistTimerRef.current) {
				clearTimeout(persistTimerRef.current);
				persistTimerRef.current = null;
			}
		};
	}, [queue, repeat, shuffle, transport.playbackRate]);

	useEffect(() => {
		const handleEnded = () => {
			setQueue((prev) => {
				if (prev.length > 0) {
					const [next, ...rest] = prev;
					void transport.playTrack(next);
					return rest;
				}
				if (repeat === 'one' && transport.track) {
					void transport.playTrack(transport.track);
					return prev;
				}
				if (hasNext) {
					const id = playOrder[orderIndex + 1];
					const track = id ? catalog[id] : null;
					if (track) {
						void transport.playTrack(track);
					}
					return prev;
				}
				if (repeat === 'all' && playOrder.length > 0) {
					const first = catalog[playOrder[0]];
					if (first) {
						void transport.playTrack(first);
					}
				}
				return prev;
			});
		};

		transport.registerOnTrackEnded(handleEnded);
		transport.registerNext(goNext);
		transport.registerPrev(goPrev);
		return () => {
			transport.registerOnTrackEnded(null);
			transport.registerNext(null);
			transport.registerPrev(null);
		};
	}, [
		transport,
		repeat,
		hasNext,
		orderIndex,
		playOrder,
		catalog,
		goNext,
		goPrev,
	]);

	useEffect(() => {
		const onPlayTrack = (e: Event) => {
			const d = coerceDesktopMusicPlayTrackDetail(
				(e as CustomEvent<unknown>).detail
			);
			if (!d) return;
			playTrack({
				id: d.id,
				name: d.name,
				thumbnail_url: d.thumbnail_url ?? null,
				version: d.version ?? null,
				mime_type: d.mime_type ?? 'audio/mpeg',
				source_surface: d.source_surface ?? 'unknown',
			});
		};
		const onEnqueueTrack = (e: Event) => {
			const d = coerceDesktopMusicPlayTrackDetail(
				(e as CustomEvent<unknown>).detail
			);
			if (!d) return;
			enqueue({
				id: d.id,
				name: d.name,
				thumbnail_url: d.thumbnail_url ?? null,
				version: d.version ?? null,
				mime_type: d.mime_type ?? 'audio/mpeg',
				source_surface: d.source_surface ?? 'unknown',
			});
		};
		window.addEventListener(DESKTOP_MUSIC_PLAY_TRACK_EVENT, onPlayTrack);
		window.addEventListener(DESKTOP_MUSIC_ENQUEUE_TRACK_EVENT, onEnqueueTrack);
		return () => {
			window.removeEventListener(DESKTOP_MUSIC_PLAY_TRACK_EVENT, onPlayTrack);
			window.removeEventListener(
				DESKTOP_MUSIC_ENQUEUE_TRACK_EVENT,
				onEnqueueTrack
			);
		};
	}, [enqueue, playTrack]);

	const value = useMemo<MusicPlaybackDomainValue>(
		() => ({
			shuffle,
			setShuffle,
			repeat,
			setRepeat,
			queue,
			syncLibraryPlaybackTracks,
			setPlayerPlaybackBrowseOverride,
			playTrack,
			goPrev,
			goNext,
			hasPrev,
			hasNext,
			enqueue,
			enqueueNext,
			reorderQueue,
			moveQueueItemToTop,
			removeFromQueue,
			clearQueue,
		}),
		[
			shuffle,
			repeat,
			queue,
			syncLibraryPlaybackTracks,
			setPlayerPlaybackBrowseOverride,
			playTrack,
			goPrev,
			goNext,
			hasPrev,
			hasNext,
			enqueue,
			enqueueNext,
			reorderQueue,
			moveQueueItemToTop,
			removeFromQueue,
			clearQueue,
		]
	);

	return (
		<MusicPlaybackDomainContext.Provider value={value}>
			{children}
		</MusicPlaybackDomainContext.Provider>
	);
}

export function useMusicPlaybackDomain(): MusicPlaybackDomainValue {
	const value = useContext(MusicPlaybackDomainContext);
	if (!value) {
		throw new Error(
			'useMusicPlaybackDomain must be used within MusicPlaybackDomainProvider'
		);
	}
	return value;
}
