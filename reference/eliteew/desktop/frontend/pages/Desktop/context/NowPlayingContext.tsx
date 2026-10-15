/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Global desktop now-playing provider with a single `<audio>` transport for Music Player,
 * widgets and deep-linked playback handoff.
 *
 * Invariants:
 * - One active playback request at a time; newer requests cancel previous stream/blob load.
 * - Shell-state stores durable metadata only: track identity + volume (`nowPlayingPositionSession` holds tab position).
 * - Mic ducking changes runtime audio gain only and must not overwrite user volume preference.
 * - Long prep without canplay/error sets `isLoadingStalled` for user hint only; load is not auto-aborted.
 *
 * Related:
 * - src/pages/Desktop/context/MusicPlaybackDomainContext.tsx
 * - src/pages/MusicPlayer/nowPlayingTrackAudioSource.ts
 * - src/pages/Desktop/utils/musicAudioBlobCache.ts
 * - src/pages/Desktop/utils/nowPlayingAudioUnlock.ts
 * - src/services/auth/secureMediaTicketRemint.ts
 */

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthenticatedAudioBlob } from '@/hooks/audio/useAuthenticatedAudioBlob';
import { useObjectUrlLifecycle } from '@/hooks/audio/useObjectUrlLifecycle';
import { resolveNowPlayingTrackAudioSource } from '@/pages/MusicPlayer/nowPlayingTrackAudioSource';
import {
	buildSecureMediaTicketRemintContext,
	isContentTicketStreamUrl,
	secureRemintContentInlineStreamUrl,
} from '@/services/auth/secureMediaTicketRemint';
import { notify } from '../../../notifications';
import { type AudioSourceSurface } from '../../../services/audio/playerAudioContracts';
import {
	type PlaybackErrorCategory,
	mapPlaybackErrorInfo,
} from '../../../services/audio/playbackErrors';
import { subscribeToMicActive } from '../../../voice-core/micActive';
import {
	getCachedAudioBlob,
	putCachedAudioBlob,
} from '../utils/musicAudioBlobCache';
import {
	emitPlaybackErrorMetric,
	emitPlaybackStageMetric,
	emitShellPersistMetric,
	markTrackLoadReady,
	markTrackLoadStart,
} from '../utils/musicPlaybackTelemetry';
import { captureNowPlayingUserActivation } from '../utils/nowPlayingAudioUnlock';
import {
	clearNowPlayingPositionSession,
	readNowPlayingPositionSession,
	writeNowPlayingPositionSession,
} from '../utils/nowPlayingPositionSession';
import {
	fetchDesktopShellStateDeduplicated,
	type DesktopNowPlayingShellState,
} from '../services/desktopApi';
import {
	withDiagnosticsPatch,
	withTrackError,
	withTrackLoadStart,
	withTrackReset,
} from './nowPlayingStateTransitions';
import {
	flushShellStatePipelineNow,
	scheduleShellStateMutation,
	waitForShellStatePipelineFlush,
} from '../utils/desktopShellStateMutationPipeline';
import { useMediaSessionMusic } from '../utils/mediaSessionMusic';

const LEGACY_LOCAL_STORAGE_KEY = 'eliteew-nowplaying';
const DUCK_VOLUME = 0.2;
const DUCK_TRANSITION_MS = 300;
/** Debounce for durable shell-state writes (track + volume only). */
const NOW_PLAYING_SHELL_DEBOUNCE_MS = 2000;
/** Tab-scoped position checkpoint during playback (not shell-state). */
const POSITION_SESSION_DEBOUNCE_MS = 3000;
/** User-visible stall hint when playback prep exceeds this without canplay/error. */
export const NOW_PLAYING_LOAD_STALL_MS = 15_000;

export interface NowPlayingTrack {
	id: string;
	name: string;
	thumbnail_url?: string | null;
	version?: string | null;
	mime_type?: string | null;
	source_surface?: AudioSourceSurface;
}

export interface NowPlayingDiagnostics {
	trackId: string | null;
	sourceSurface: AudioSourceSurface | null;
	cacheSource: 'network' | 'idb-cache' | 'inline-stream' | null;
	loadingStage:
		| 'idle'
		| 'play-requested'
		| 'loading-blob'
		| 'blob-ready'
		| 'stream-ready'
		| 'canplay'
		| 'playing'
		| 'error';
	errorCategory: PlaybackErrorCategory | null;
}

interface NowPlayingState {
	track: NowPlayingTrack | null;
	playing: boolean;
	currentTime: number;
	duration: number;
	bufferedRanges: Array<{ start: number; end: number }>;
	volume: number;
	playbackRate: number;
	/** True while loading blob and starting playback */
	isLoading: boolean;
	/** True when loading exceeded {@link NOW_PLAYING_LOAD_STALL_MS} without progress. */
	isLoadingStalled: boolean;
	/** Last playback error message (if any). Not persisted. */
	error: string | null;
	/** Track for which the last error occurred (if any). */
	errorTrackId: string | null;
	/** Read-only diagnostics for development overlays and telemetry inspection. */
	diagnostics: NowPlayingDiagnostics;
}

export interface NowPlayingContextValue extends NowPlayingState {
	setTrack: (track: NowPlayingTrack | null) => void;
	play: () => void;
	pause: () => void;
	togglePlayPause: () => void;
	seek: (time: number) => void;
	setVolume: (value: number) => void;
	setPlaybackRate: (value: number) => void;
	/** Called when current track ends (e.g. to play next). Register from MusicPlayer. */
	registerOnTrackEnded: (callback: (() => void) | null) => void;
	/** Register handlers for transport controls (next/prev) from MusicPlayer. */
	registerNext: (callback: (() => void) | null) => void;
	registerPrev: (callback: (() => void) | null) => void;
	/** Invoke registered next/prev handlers (used by desktop widget). */
	next: () => void;
	prev: () => void;
	/** Set track and start playing (fetches blob and sets audio source). */
	playTrack: (track: NowPlayingTrack) => Promise<void>;
	/** Reload current track like a fresh play (clears error first). No-op if no track. */
	retryCurrentTrack: () => Promise<void>;
	/** Clear last playback error */
	clearError: () => void;
}

/** Всё из {@link NowPlayingContextValue}, кроме `currentTime`, плюс императивное чтение позиции без подписки на тики. */
export type NowPlayingTransportValue = Omit<
	NowPlayingContextValue,
	'currentTime'
> & {
	getCurrentTime: () => number;
};

const defaultState: NowPlayingState = {
	track: null,
	playing: false,
	currentTime: 0,
	duration: 0,
	bufferedRanges: [],
	volume: 1,
	playbackRate: 1,
	isLoading: false,
	isLoadingStalled: false,
	error: null,
	errorTrackId: null,
	diagnostics: {
		trackId: null,
		sourceSurface: null,
		cacheSource: null,
		loadingStage: 'idle',
		errorCategory: null,
	},
};

const defaultTransportValue: NowPlayingTransportValue = {
	track: defaultState.track,
	playing: defaultState.playing,
	duration: defaultState.duration,
	bufferedRanges: defaultState.bufferedRanges,
	volume: defaultState.volume,
	playbackRate: defaultState.playbackRate,
	isLoading: defaultState.isLoading,
	isLoadingStalled: defaultState.isLoadingStalled,
	error: defaultState.error,
	errorTrackId: defaultState.errorTrackId,
	diagnostics: defaultState.diagnostics,
	getCurrentTime: () => 0,
	setTrack: () => {},
	play: () => {},
	pause: () => {},
	togglePlayPause: () => {},
	seek: () => {},
	setVolume: () => {},
	setPlaybackRate: () => {},
	registerOnTrackEnded: () => {},
	registerNext: () => {},
	registerPrev: () => {},
	next: () => {},
	prev: () => {},
	playTrack: async () => {},
	retryCurrentTrack: async () => {},
	clearError: () => {},
};

const NowPlayingTransportContext = createContext<NowPlayingTransportValue>(
	defaultTransportValue
);
const NowPlayingTimeContext = createContext<number>(0);

/** Полное значение (включая `currentTime` на каждом тике). Для списков/шапки предпочтительнее {@link useNowPlayingTransport}. */
export function useNowPlaying(): NowPlayingContextValue {
	const transport = useContext(NowPlayingTransportContext);
	const currentTime = useContext(NowPlayingTimeContext);
	return useMemo(() => {
		const { getCurrentTime: _get, ...rest } = transport;
		return { ...rest, currentTime };
	}, [transport, currentTime]);
}

export function useNowPlayingTransport(): NowPlayingTransportValue {
	return useContext(NowPlayingTransportContext);
}

export function useNowPlayingTime(): number {
	return useContext(NowPlayingTimeContext);
}

interface NowPlayingProviderProps {
	children: ReactNode;
}

interface PersistedState {
	track: NowPlayingTrack | null;
	currentTime: number;
	volume: number;
}

function loadLegacyLocalStorage(): PersistedState | null {
	try {
		const raw =
			typeof localStorage !== 'undefined'
				? localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY)
				: null;
		if (!raw) return null;
		const data = JSON.parse(raw) as PersistedState;
		if (
			!data ||
			typeof data.currentTime !== 'number' ||
			typeof data.volume !== 'number'
		)
			return null;
		return {
			track: data.track?.id && data.track.name ? data.track : null,
			currentTime: Math.max(0, data.currentTime),
			volume: Math.max(0, Math.min(1, data.volume)),
		};
	} catch {
		return null;
	}
}

function parseShellNowPlaying(
	raw: DesktopNowPlayingShellState
):
	| (Omit<PersistedState, 'currentTime'> & { legacyCurrentTime?: number })
	| null {
	const volRaw = raw.volume;
	const volume =
		typeof volRaw === 'number' && !Number.isNaN(volRaw)
			? volRaw
			: Number(volRaw);
	if (Number.isNaN(volume)) return null;
	const tr = raw.track;
	const legacyCtRaw = raw.current_time;
	const legacyCurrentTime =
		typeof legacyCtRaw === 'number' && !Number.isNaN(legacyCtRaw)
			? legacyCtRaw
			: Number(legacyCtRaw);
	const normalizedLegacyTime =
		Number.isNaN(legacyCurrentTime) || legacyCurrentTime <= 0
			? undefined
			: Math.max(0, legacyCurrentTime);
	if (tr === null) {
		return {
			track: null,
			volume: Math.max(0, Math.min(1, volume)),
			legacyCurrentTime: normalizedLegacyTime,
		};
	}
	if (
		tr &&
		typeof tr === 'object' &&
		typeof tr.id === 'string' &&
		typeof tr.name === 'string' &&
		tr.id &&
		tr.name
	) {
		return {
			track: {
				id: tr.id,
				name: tr.name,
				thumbnail_url: tr.thumbnail_url ?? null,
				version:
					typeof tr.version === 'string' && tr.version.trim().length > 0
						? tr.version
						: null,
			},
			volume: Math.max(0, Math.min(1, volume)),
			legacyCurrentTime: normalizedLegacyTime,
		};
	}
	return null;
}

function resolveHydratedCurrentTime(
	track: NowPlayingTrack | null,
	legacyCurrentTime?: number
): number {
	if (!track) return 0;
	const fromSession = readNowPlayingPositionSession(track.id);
	if (fromSession != null && fromSession > 0) {
		return fromSession;
	}
	if (legacyCurrentTime != null && legacyCurrentTime > 0) {
		writeNowPlayingPositionSession(track.id, legacyCurrentTime);
		return legacyCurrentTime;
	}
	return 0;
}

function buildNowPlayingShellPatch(
	track: NowPlayingTrack | null,
	volume: number
): {
	now_playing: {
		track: {
			id: string;
			name: string;
			thumbnail_url: string | null;
			version: string | null;
		} | null;
		volume: number;
	};
} {
	return {
		now_playing: {
			track: track
				? {
						id: track.id,
						name: track.name,
						thumbnail_url: track.thumbnail_url ?? null,
						version: track.version ?? null,
					}
				: null,
			volume,
		},
	};
}

function readBufferedRangesFromAudio(
	audio: HTMLAudioElement
): Array<{ start: number; end: number }> {
	const ranges: Array<{ start: number; end: number }> = [];
	const { buffered } = audio;
	if (!buffered || buffered.length === 0) return ranges;
	for (let index = 0; index < buffered.length; index += 1) {
		try {
			const start = buffered.start(index);
			const end = buffered.end(index);
			if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
				continue;
			}
			ranges.push({ start, end });
		} catch {
			// ignore malformed TimeRanges rows
		}
	}
	return ranges;
}

function sameBufferedRanges(
	left: Array<{ start: number; end: number }>,
	right: Array<{ start: number; end: number }>
): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) {
		if (
			Math.abs(left[index].start - right[index].start) > 0.01 ||
			Math.abs(left[index].end - right[index].end) > 0.01
		) {
			return false;
		}
	}
	return true;
}

export function NowPlayingProvider({ children }: NowPlayingProviderProps) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const loadedTrackIdRef = useRef<string | null>(null);
	const playbackRequestIdRef = useRef(0);
	const lastNowPlayingToastRef = useRef<{ trackId: string; at: number } | null>(
		null
	);
	const onTrackEndedRef = useRef<(() => void) | null>(null);
	const nextRef = useRef<(() => void) | null>(null);
	const prevRef = useRef<(() => void) | null>(null);
	const initialSeekRef = useRef<number | null>(null);
	const positionSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null
	);
	const shellHydratedRef = useRef(false);
	const lastShellPersistFingerprintRef = useRef<string | null>(null);
	const micActiveRef = useRef(false);
	const stateRef = useRef<NowPlayingState>(defaultState);
	const {
		setBlob: setPlaybackBlobObjectUrl,
		revoke: revokePlaybackBlobObjectUrl,
	} = useObjectUrlLifecycle();
	const { fetchAudioBlob, abortInFlightFetch } = useAuthenticatedAudioBlob();

	const scheduleShellPersist = useCallback(
		(track: NowPlayingTrack | null, volume: number) => {
			if (!shellHydratedRef.current) return;
			const patch = buildNowPlayingShellPatch(track, volume);
			const fingerprint = JSON.stringify(patch);
			if (lastShellPersistFingerprintRef.current === fingerprint) {
				return;
			}
			lastShellPersistFingerprintRef.current = fingerprint;
			scheduleShellStateMutation({
				source: 'nowPlaying',
				merge: () => patch as Record<string, unknown>,
				debounceMs: NOW_PLAYING_SHELL_DEBOUNCE_MS,
			});
			void waitForShellStatePipelineFlush().catch(() => {});
			emitShellPersistMetric();
		},
		[]
	);

	const checkpointPositionSession = useCallback(
		(trackId: string | null | undefined, currentTime: number) => {
			if (!trackId || currentTime <= 0) return;
			writeNowPlayingPositionSession(trackId, currentTime);
		},
		[]
	);

	const schedulePositionSessionCheckpoint = useCallback(
		(trackId: string | null | undefined, currentTime: number) => {
			if (!trackId || currentTime <= 0) return;
			if (positionSessionTimerRef.current) return;
			positionSessionTimerRef.current = setTimeout(() => {
				positionSessionTimerRef.current = null;
				const activeTrackId = stateRef.current.track?.id;
				if (!activeTrackId || activeTrackId !== trackId) return;
				writeNowPlayingPositionSession(trackId, stateRef.current.currentTime);
			}, POSITION_SESSION_DEBOUNCE_MS);
		},
		[]
	);

	const [state, setState] = useState<NowPlayingState>(() => {
		const persisted = loadLegacyLocalStorage();
		if (!persisted?.track) return defaultState;
		const currentTime = resolveHydratedCurrentTime(
			persisted.track,
			persisted.currentTime
		);
		return {
			track: persisted.track,
			playing: false,
			currentTime,
			duration: 0,
			volume: persisted.volume,
			playbackRate: 1,
			isLoading: false,
			isLoadingStalled: false,
			error: null,
			errorTrackId: null,
			diagnostics: {
				trackId: persisted.track.id,
				sourceSurface: persisted.track.source_surface ?? 'unknown',
				cacheSource: null,
				loadingStage: 'idle',
				errorCategory: null,
			},
		} as NowPlayingState;
	});

	const [micDucking, setMicDucking] = useState(false);
	const { t } = useTranslation('desktopUi');

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const s = await fetchDesktopShellStateDeduplicated();
				if (cancelled) return;
				const np = s.now_playing;
				if (np != null && typeof np === 'object') {
					const parsed = parseShellNowPlaying(
						np as unknown as DesktopNowPlayingShellState
					);
					if (parsed) {
						const hydratedTime = resolveHydratedCurrentTime(
							parsed.track,
							parsed.legacyCurrentTime
						);
						setState((prev) => ({
							...prev,
							track: parsed.track,
							currentTime: hydratedTime,
							volume: parsed.volume,
							playing: false,
							duration: 0,
							isLoading: false,
							isLoadingStalled: false,
							error: null,
							errorTrackId: null,
							diagnostics: {
								trackId: parsed.track?.id ?? null,
								sourceSurface: parsed.track?.source_surface ?? 'unknown',
								cacheSource: null,
								loadingStage: 'idle',
								errorCategory: null,
							},
						}));
					}
				} else {
					const leg = loadLegacyLocalStorage();
					if (leg?.track) {
						if (leg.currentTime > 0) {
							writeNowPlayingPositionSession(leg.track.id, leg.currentTime);
						}
						scheduleShellStateMutation({
							source: 'nowPlaying',
							merge: () =>
								buildNowPlayingShellPatch(leg.track, leg.volume) as Record<
									string,
									unknown
								>,
							immediate: true,
						});
						await flushShellStatePipelineNow('nowPlaying').catch(() => {});
					}
				}
				try {
					localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
				} catch {
					/* ignore */
				}
			} catch {
				/* offline: keep initializer from legacy storage */
			} finally {
				if (!cancelled) {
					shellHydratedRef.current = true;
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		(
			window as typeof window & {
				__ELITEEW_NOW_PLAYING_DIAGNOSTICS__?: Readonly<NowPlayingDiagnostics>;
			}
		).__ELITEEW_NOW_PLAYING_DIAGNOSTICS__ = Object.freeze({
			...state.diagnostics,
		});
		return () => {
			delete (
				window as typeof window & {
					__ELITEEW_NOW_PLAYING_DIAGNOSTICS__?: Readonly<NowPlayingDiagnostics>;
				}
			).__ELITEEW_NOW_PLAYING_DIAGNOSTICS__;
		};
	}, [state.diagnostics]);

	useEffect(() => {
		return subscribeToMicActive((active) => {
			micActiveRef.current = active;
			setMicDucking(active);
		});
	}, []);

	const lastVolumeTargetRef = useRef<number | null>(null);
	useEffect(() => {
		const targetVolume = state.volume * (micDucking ? DUCK_VOLUME : 1);
		const audio = audioRef.current;
		if (!audio) return;

		const fromVolume =
			lastVolumeTargetRef.current ??
			state.volume * (micDucking ? DUCK_VOLUME : 1);
		lastVolumeTargetRef.current = targetVolume;
		const startTime = performance.now();

		const tick = (): void => {
			const elapsed = performance.now() - startTime;
			const t = Math.min(1, elapsed / DUCK_TRANSITION_MS);
			const smooth = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
			audio.volume = fromVolume + (targetVolume - fromVolume) * smooth;
			if (t < 1) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}, [state.volume, micDucking]);

	useEffect(() => {
		if (audioRef.current) {
			audioRef.current.playbackRate = state.playbackRate || 1;
		}
	}, [state.playbackRate]);

	const revokeCurrentObjectUrl = useCallback(() => {
		revokePlaybackBlobObjectUrl();
		loadedTrackIdRef.current = null;
	}, [revokePlaybackBlobObjectUrl]);

	const setTrack = useCallback(
		(track: NowPlayingTrack | null) => {
			checkpointPositionSession(
				stateRef.current.track?.id,
				stateRef.current.currentTime
			);
			playbackRequestIdRef.current += 1;
			abortInFlightFetch();
			revokeCurrentObjectUrl();
			if (!track) {
				clearNowPlayingPositionSession();
			}
			if (audioRef.current) {
				audioRef.current.pause();
				audioRef.current.removeAttribute('src');
				audioRef.current.load();
			}
			setState((s) => withTrackReset(s, track));
		},
		[abortInFlightFetch, checkpointPositionSession, revokeCurrentObjectUrl]
	);

	const pause = useCallback(() => {
		if (audioRef.current) {
			audioRef.current.pause();
		}
		checkpointPositionSession(
			stateRef.current.track?.id,
			stateRef.current.currentTime
		);
		setState((s) => ({ ...s, playing: false }));
	}, [checkpointPositionSession]);

	const loadTrackAudioSource = useCallback(
		async (track: NowPlayingTrack) => {
			return resolveNowPlayingTrackAudioSource(track, {
				getCachedBlob: getCachedAudioBlob,
				putCachedBlob: putCachedAudioBlob,
				fetchAudioBlob,
				onCacheHit: (trackId) =>
					emitPlaybackStageMetric(trackId, 'blob-cache-hit'),
				onStreamResolved: (trackId) =>
					emitPlaybackStageMetric(trackId, 'network-fetch'),
				onBlobFetch: (trackId) =>
					emitPlaybackStageMetric(trackId, 'network-fetch'),
				onStreamFallback: (trackId) =>
					emitPlaybackStageMetric(trackId, 'network-fetch'),
			});
		},
		[fetchAudioBlob]
	);

	const attachLoadedAudioSource = useCallback(
		(
			audio: HTMLAudioElement,
			loaded:
				| {
						mode: 'blob';
						blob: Blob;
						cacheSource: 'idb-cache' | 'network';
				  }
				| {
						mode: 'stream';
						streamUrl: string;
						cacheSource: 'inline-stream';
				  },
			track: NowPlayingTrack,
			requestId: number,
			startMark: string
		): void => {
			const source = loaded.cacheSource;
			let streamRemintAttempted = false;

			const applyTerminalPlaybackError = (
				category: PlaybackErrorCategory,
				message: string
			): void => {
				setState((s) =>
					withTrackError(s, {
						trackId: track.id,
						message,
						category,
						cacheSource: source,
					})
				);
				emitPlaybackErrorMetric(track.id, message, category);
			};

			const onCanPlay = async () => {
				audio.removeEventListener('error', onError);
				if (requestId !== playbackRequestIdRef.current) {
					return;
				}
				emitPlaybackStageMetric(track.id, 'canplay');
				setState((s) =>
					withDiagnosticsPatch(s, {
						cacheSource: source,
						loadingStage: 'canplay',
						errorCategory: null,
					})
				);
				try {
					await audio.play();
					setState((s) => ({
						...withDiagnosticsPatch(s, {
							cacheSource: source,
							loadingStage: 'playing',
							errorCategory: null,
						}),
						playing: true,
						isLoading: false,
						isLoadingStalled: false,
					}));
					const now = Date.now();
					const lastToast = lastNowPlayingToastRef.current;
					const shouldShowNowPlayingToast =
						!lastToast ||
						lastToast.trackId !== track.id ||
						now - lastToast.at > 15_000;
					if (shouldShowNowPlayingToast) {
						lastNowPlayingToastRef.current = { trackId: track.id, at: now };
						const telemetrySource =
							source === 'idb-cache' ? 'idb-cache' : 'network';
						notify.nowPlaying(
							{
								trackId: track.id,
								trackName: track.name,
								durationSeconds:
									Number.isFinite(audio.duration) && audio.duration > 0
										? audio.duration
										: stateRef.current.duration,
								currentTimeSeconds:
									Number.isFinite(audio.currentTime) && audio.currentTime >= 0
										? audio.currentTime
										: stateRef.current.currentTime,
								volume: stateRef.current.volume,
								playbackRate: stateRef.current.playbackRate,
								source: telemetrySource,
							},
							{ addToCenter: false }
						);
					}
				} catch (playError: unknown) {
					const info = mapPlaybackErrorInfo(playError, t, 'nowPlaying');
					emitPlaybackStageMetric(track.id, 'play-rejection', {
						category: info.category,
					});
					emitPlaybackErrorMetric(track.id, info.message, info.category);
					setState((s) =>
						withTrackError(s, {
							trackId: track.id,
							message: info.message,
							category: info.category,
							cacheSource: source,
						})
					);
					if (info.category !== 'aborted') {
						const title = t('nowPlaying.playbackErrorTitle');
						notify.error(title, info.message, { duration: 5000 });
					}
				}
				const telemetrySource =
					source === 'idb-cache' ? 'idb-cache' : 'network';
				markTrackLoadReady(track.id, startMark, telemetrySource);
			};
			const onError = () => {
				void handlePlaybackElementError();
			};

			const handlePlaybackElementError = async (): Promise<void> => {
				audio.removeEventListener('canplay', onCanPlay);
				if (requestId !== playbackRequestIdRef.current) {
					return;
				}

				if (
					loaded.mode === 'stream' &&
					!streamRemintAttempted &&
					isContentTicketStreamUrl(loaded.streamUrl)
				) {
					const remintCtx = buildSecureMediaTicketRemintContext(
						loaded.streamUrl,
						track.id
					);
					if (remintCtx) {
						streamRemintAttempted = true;
						const remint = await secureRemintContentInlineStreamUrl(remintCtx);
						if (requestId !== playbackRequestIdRef.current) {
							return;
						}
						if (remint.ok) {
							audio.src = remint.streamUrl;
							audio.addEventListener('canplay', onCanPlay, { once: true });
							audio.addEventListener('error', onError, { once: true });
							audio.load();
							return;
						}
						if (
							remint.reason === 'access_denied' ||
							remint.reason === 'auth_lost' ||
							remint.reason === 'identity_mismatch'
						) {
							const info = mapPlaybackErrorInfo(
								Object.assign(new Error('MEDIA_ACCESS_DENIED'), {
									response: { status: remint.statusCode ?? 403 },
								}),
								t,
								'nowPlaying'
							);
							applyTerminalPlaybackError(info.category, info.message);
							const title = t('nowPlaying.playbackErrorTitle');
							notify.error(title, info.message, { duration: 5000 });
							return;
						}
					}
				}

				const decodeInfo = mapPlaybackErrorInfo(
					new Error('AUDIO_DECODE_ERROR'),
					t,
					'nowPlaying'
				);
				applyTerminalPlaybackError(decodeInfo.category, decodeInfo.message);
			};

			if (loaded.mode === 'stream') {
				audio.src = loaded.streamUrl;
				loadedTrackIdRef.current = track.id;
				setState((s) =>
					withDiagnosticsPatch(s, {
						cacheSource: source,
						loadingStage: 'stream-ready',
						errorCategory: null,
					})
				);
			} else {
				const url = setPlaybackBlobObjectUrl(loaded.blob);
				if (!url) {
					setState((s) => ({
						...withDiagnosticsPatch(s, {
							cacheSource: source,
							loadingStage: 'error',
							errorCategory: 'unknown',
						}),
						isLoading: false,
						isLoadingStalled: false,
					}));
					return;
				}
				loadedTrackIdRef.current = track.id;
				audio.src = url;
				setState((s) =>
					withDiagnosticsPatch(s, {
						cacheSource: source,
						loadingStage: 'blob-ready',
						errorCategory: null,
					})
				);
			}
			audio.addEventListener('canplay', onCanPlay, { once: true });
			audio.addEventListener('error', onError, { once: true });
			audio.load();
		},
		[setPlaybackBlobObjectUrl, t]
	);

	const playTrackCb = useCallback(
		async (track: NowPlayingTrack) => {
			const requestId = ++playbackRequestIdRef.current;
			abortInFlightFetch();
			emitPlaybackStageMetric(track.id, 'play-request');
			const startMark = markTrackLoadStart(track.id);
			if (audioRef.current) {
				captureNowPlayingUserActivation(audioRef.current);
			}
			revokeCurrentObjectUrl();
			const seekOnLoad =
				stateRef.current.track?.id === track.id
					? stateRef.current.currentTime
					: null;
			if (seekOnLoad != null && seekOnLoad > 0) {
				initialSeekRef.current = seekOnLoad;
			}
			if (audioRef.current) {
				audioRef.current.pause();
				audioRef.current.removeAttribute('src');
				audioRef.current.load();
			}
			setState((s) => withTrackLoadStart(s, track, seekOnLoad ?? 0));

			try {
				const loaded = await loadTrackAudioSource(track);
				if (requestId !== playbackRequestIdRef.current) {
					return;
				}
				if (!audioRef.current) {
					setState((s) => ({
						...withDiagnosticsPatch(s, {
							cacheSource: loaded.cacheSource,
							loadingStage: 'error',
							errorCategory: 'unknown',
						}),
						isLoading: false,
						isLoadingStalled: false,
					}));
					return;
				}
				attachLoadedAudioSource(
					audioRef.current,
					loaded,
					track,
					requestId,
					startMark
				);
			} catch (err: unknown) {
				if (requestId !== playbackRequestIdRef.current) {
					return;
				}
				loadedTrackIdRef.current = null;
				const info = mapPlaybackErrorInfo(err, t, 'nowPlaying');
				if (info.category === 'aborted') {
					return;
				}
				setState((s) =>
					withTrackError(s, {
						trackId: track.id,
						message: info.message,
						category: info.category,
					})
				);
				emitPlaybackStageMetric(track.id, 'play-rejection', {
					category: info.category,
				});
				emitPlaybackErrorMetric(track.id, info.message, info.category);
				scheduleShellPersist(null, stateRef.current.volume);
				const title = t('nowPlaying.playbackErrorTitle');
				notify.error(title, info.message, { duration: 5000 });
			}
		},
		[
			abortInFlightFetch,
			attachLoadedAudioSource,
			loadTrackAudioSource,
			revokeCurrentObjectUrl,
			scheduleShellPersist,
			t,
		]
	);

	const play = useCallback(() => {
		if (!state.track || !audioRef.current) return;
		if (loadedTrackIdRef.current !== state.track.id) {
			void playTrackCb(state.track);
			return;
		}
		captureNowPlayingUserActivation(audioRef.current);
		audioRef.current.play().catch((error: unknown) => {
			const info = mapPlaybackErrorInfo(error, t, 'nowPlaying');
			emitPlaybackStageMetric(state.track?.id ?? 'unknown', 'play-rejection', {
				category: info.category,
			});
			setState((s) =>
				withTrackError(s, {
					trackId: s.track?.id ?? null,
					message: info.message,
					category: info.category,
				})
			);
		});
		setState((s) => ({
			...s,
			playing: true,
			diagnostics: {
				...s.diagnostics,
				loadingStage: 'playing',
				errorCategory: null,
			},
		}));
	}, [playTrackCb, state.track, t]);

	const playTrack = playTrackCb;

	const retryCurrentTrack = useCallback(async () => {
		const track = stateRef.current.track;
		if (!track) return;
		await playTrackCb(track);
	}, [playTrackCb]);

	const togglePlayPause = useCallback(() => {
		if (state.playing) {
			pause();
		} else {
			play();
		}
	}, [state.playing, pause, play]);

	const seek = useCallback(
		(time: number) => {
			if (audioRef.current) {
				audioRef.current.currentTime = time;
			}
			setState((s) => ({ ...s, currentTime: time }));
			checkpointPositionSession(stateRef.current.track?.id, time);
		},
		[checkpointPositionSession]
	);

	const setVolume = useCallback(
		(value: number) => {
			const v = Math.max(0, Math.min(1, value));
			setState((s) => ({ ...s, volume: v }));
			lastVolumeTargetRef.current = v * (micDucking ? DUCK_VOLUME : 1);
			if (audioRef.current) {
				audioRef.current.volume = lastVolumeTargetRef.current;
			}
		},
		[micDucking]
	);

	const setPlaybackRate = useCallback((value: number) => {
		const rate = Math.max(0.5, Math.min(2, value));
		setState((s) => ({ ...s, playbackRate: rate }));
		if (audioRef.current) {
			audioRef.current.playbackRate = rate;
		}
	}, []);

	const registerOnTrackEnded = useCallback((callback: (() => void) | null) => {
		onTrackEndedRef.current = callback;
	}, []);

	const registerNext = useCallback((callback: (() => void) | null) => {
		nextRef.current = callback;
	}, []);

	const registerPrev = useCallback((callback: (() => void) | null) => {
		prevRef.current = callback;
	}, []);

	const next = useCallback(() => {
		nextRef.current?.();
	}, []);

	const prev = useCallback(() => {
		prevRef.current?.();
	}, []);

	const clearError = useCallback(() => {
		setState((s) => ({
			...s,
			error: null,
			errorTrackId: null,
			isLoadingStalled: false,
			diagnostics: {
				...s.diagnostics,
				errorCategory: null,
				loadingStage: s.playing ? 'playing' : 'idle',
			},
		}));
	}, []);

	useEffect(() => {
		if (!state.isLoading) {
			return;
		}
		const trackId = state.track?.id ?? null;
		const timer = window.setTimeout(() => {
			setState((s) => {
				if (
					!s.isLoading ||
					s.track?.id !== trackId ||
					s.error ||
					s.isLoadingStalled
				) {
					return s;
				}
				return { ...s, isLoadingStalled: true };
			});
		}, NOW_PLAYING_LOAD_STALL_MS);
		return () => {
			window.clearTimeout(timer);
		};
	}, [state.isLoading, state.track?.id]);

	useMediaSessionMusic({
		track: state.track,
		playing: state.playing,
		isLoading: state.isLoading,
		currentTime: state.currentTime,
		duration: state.duration,
		playbackRate: state.playbackRate,
		play,
		pause,
		next,
		prev,
		seek,
	});

	useEffect(() => {
		if (!state.track) {
			scheduleShellPersist(null, state.volume);
			return;
		}
		scheduleShellPersist(state.track, state.volume);
	}, [state.track, state.volume, scheduleShellPersist]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		const onTimeUpdate = () => {
			const t = audio.currentTime;
			const bufferedRanges = readBufferedRangesFromAudio(audio);
			setState((s) => ({
				...s,
				currentTime: t,
				bufferedRanges: sameBufferedRanges(s.bufferedRanges, bufferedRanges)
					? s.bufferedRanges
					: bufferedRanges,
			}));
			schedulePositionSessionCheckpoint(stateRef.current.track?.id, t);
		};
		const onLoadedMetadata = () => {
			const bufferedRanges = readBufferedRangesFromAudio(audio);
			setState((s) => ({
				...s,
				duration: audio.duration,
				bufferedRanges: sameBufferedRanges(s.bufferedRanges, bufferedRanges)
					? s.bufferedRanges
					: bufferedRanges,
			}));
			if (initialSeekRef.current != null) {
				audio.currentTime = initialSeekRef.current;
				initialSeekRef.current = null;
			}
		};
		const onProgress = () => {
			const bufferedRanges = readBufferedRangesFromAudio(audio);
			setState((s) =>
				sameBufferedRanges(s.bufferedRanges, bufferedRanges)
					? s
					: { ...s, bufferedRanges }
			);
		};
		const onEnded = () => {
			emitPlaybackStageMetric(stateRef.current.track?.id ?? 'unknown', 'ended');
			clearNowPlayingPositionSession();
			setState((s) => ({
				...s,
				playing: false,
				currentTime: 0,
				diagnostics: {
					...s.diagnostics,
					loadingStage: 'idle',
				},
			}));
			onTrackEndedRef.current?.();
		};
		const onPlay = () =>
			setState((s) => ({
				...s,
				playing: true,
				diagnostics: {
					...s.diagnostics,
					loadingStage: 'playing',
				},
			}));
		const onPause = () =>
			setState((s) => ({
				...s,
				playing: false,
				diagnostics: {
					...s.diagnostics,
					loadingStage: s.error ? 'error' : 'idle',
				},
			}));

		audio.addEventListener('timeupdate', onTimeUpdate);
		audio.addEventListener('loadedmetadata', onLoadedMetadata);
		audio.addEventListener('progress', onProgress);
		audio.addEventListener('ended', onEnded);
		audio.addEventListener('play', onPlay);
		audio.addEventListener('pause', onPause);
		return () => {
			if (positionSessionTimerRef.current) {
				clearTimeout(positionSessionTimerRef.current);
				positionSessionTimerRef.current = null;
			}
			audio.removeEventListener('timeupdate', onTimeUpdate);
			audio.removeEventListener('loadedmetadata', onLoadedMetadata);
			audio.removeEventListener('progress', onProgress);
			audio.removeEventListener('ended', onEnded);
			audio.removeEventListener('play', onPlay);
			audio.removeEventListener('pause', onPause);
		};
	}, [schedulePositionSessionCheckpoint]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const onPageHide = () => {
			checkpointPositionSession(
				stateRef.current.track?.id,
				stateRef.current.currentTime
			);
		};
		window.addEventListener('pagehide', onPageHide);
		return () => {
			window.removeEventListener('pagehide', onPageHide);
		};
	}, [checkpointPositionSession]);

	useEffect(() => {
		return () => {
			abortInFlightFetch();
			revokeCurrentObjectUrl();
		};
	}, [abortInFlightFetch, revokeCurrentObjectUrl]);

	const getCurrentTime = useCallback(() => stateRef.current.currentTime, []);

	const transportValue = useMemo(
		(): NowPlayingTransportValue => ({
			track: state.track,
			playing: state.playing,
			duration: state.duration,
			bufferedRanges: state.bufferedRanges,
			volume: state.volume,
			playbackRate: state.playbackRate,
			isLoading: state.isLoading,
			isLoadingStalled: state.isLoadingStalled,
			error: state.error,
			errorTrackId: state.errorTrackId,
			diagnostics: state.diagnostics,
			getCurrentTime,
			setTrack,
			play,
			pause,
			togglePlayPause,
			seek,
			setVolume,
			setPlaybackRate,
			registerOnTrackEnded,
			registerNext,
			registerPrev,
			next,
			prev,
			playTrack,
			retryCurrentTrack,
			clearError,
		}),
		[
			state.track,
			state.playing,
			state.duration,
			state.bufferedRanges,
			state.volume,
			state.playbackRate,
			state.isLoading,
			state.isLoadingStalled,
			state.error,
			state.errorTrackId,
			state.diagnostics,
			getCurrentTime,
			setTrack,
			play,
			pause,
			togglePlayPause,
			seek,
			setVolume,
			setPlaybackRate,
			registerOnTrackEnded,
			registerNext,
			registerPrev,
			next,
			prev,
			playTrack,
			retryCurrentTrack,
			clearError,
		]
	);

	return (
		<NowPlayingTransportContext.Provider value={transportValue}>
			<NowPlayingTimeContext.Provider value={state.currentTime}>
				<audio ref={audioRef} preload="metadata">
					<track kind="captions" />
				</audio>
				{children}
			</NowPlayingTimeContext.Provider>
		</NowPlayingTransportContext.Provider>
	);
}
