/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Sync global desktop music playback with `navigator.mediaSession` (metadata, position, OS actions).
 *
 * Invariants:
 * - Position state uses refs for latest transport values; interval is best-effort only.
 * - Tab visibility return triggers an immediate position resync (background throttling).
 *
 * Related:
 * - src/pages/Desktop/context/NowPlayingContext.tsx
 * - utils/subscribeDocumentVisibleSync.ts
 */

import { useEffect, useRef } from 'react';
import { subscribeDocumentVisibleSync } from './subscribeDocumentVisibleSync';

const POSITION_SYNC_MS = 1000;
const SEEK_MEDIA_STEP = 5;

function mediaSessionSupported(): boolean {
	return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

function resolveArtworkUrl(
	thumbnailUrl: string | null | undefined
): string | undefined {
	if (!thumbnailUrl?.trim()) return undefined;
	try {
		return new URL(thumbnailUrl, window.location.origin).href;
	} catch {
		return undefined;
	}
}

export interface UseMediaSessionMusicParams {
	track: {
		id: string;
		name: string;
		thumbnail_url?: string | null;
	} | null;
	playing: boolean;
	isLoading: boolean;
	currentTime: number;
	duration: number;
	playbackRate: number;
	play: () => void;
	pause: () => void;
	next: () => void;
	prev: () => void;
	seek: (time: number) => void;
}

/**
 * Syncs global music playback with `navigator.mediaSession` (metadata, position, actions).
 */
export function useMediaSessionMusic({
	track,
	playing,
	isLoading,
	currentTime,
	duration,
	playbackRate,
	play,
	pause,
	next,
	prev,
	seek,
}: UseMediaSessionMusicParams): void {
	const actionsRef = useRef({
		play,
		pause,
		next,
		prev,
		seek,
		isLoading,
	});
	actionsRef.current = { play, pause, next, prev, seek, isLoading };

	const positionRef = useRef({
		currentTime,
		duration,
		playbackRate,
	});
	positionRef.current = { currentTime, duration, playbackRate };

	// Metadata when track identity / artwork changes
	useEffect(() => {
		if (!mediaSessionSupported()) return;
		const ms = navigator.mediaSession;

		if (!track) {
			ms.metadata = null;
			return;
		}

		const artworkUrl = resolveArtworkUrl(track.thumbnail_url);
		const artwork =
			artworkUrl != null
				? [
						{
							src: artworkUrl,
							sizes: '512x512',
							type: 'image/jpeg',
						},
					]
				: [];

		try {
			ms.metadata = new MediaMetadata({
				title: track.name,
				artist: 'EliteEW',
				...(artwork.length > 0 ? { artwork } : {}),
			});
		} catch {
			ms.metadata = new MediaMetadata({
				title: track.name,
				artist: 'EliteEW',
			});
		}
	}, [track]);

	// Playback state
	useEffect(() => {
		if (!mediaSessionSupported()) return;
		const ms = navigator.mediaSession;
		if (!track) {
			ms.playbackState = 'none';
			return;
		}
		if (isLoading) {
			ms.playbackState = 'none';
			return;
		}
		ms.playbackState = playing ? 'playing' : 'paused';
	}, [track, playing, isLoading]);

	// Position state (throttled interval + immediate when duration/track changes)
	useEffect(() => {
		if (!mediaSessionSupported()) return;
		const ms = navigator.mediaSession;

		const applyPosition = (): void => {
			const {
				currentTime: ct,
				duration: dur,
				playbackRate: rate,
			} = positionRef.current;
			if (!Number.isFinite(dur) || dur <= 0) {
				try {
					ms.setPositionState?.(undefined);
				} catch {
					/* ignore */
				}
				return;
			}
			const position = Math.min(Math.max(0, ct), dur);
			try {
				ms.setPositionState?.({
					duration: dur,
					playbackRate: Number.isFinite(rate) && rate > 0 ? rate : 1,
					position,
				});
			} catch {
				/* ignore */
			}
		};

		if (!track || !Number.isFinite(duration) || duration <= 0) {
			try {
				ms.setPositionState?.(undefined);
			} catch {
				/* ignore */
			}
			return;
		}

		applyPosition();
		const id = window.setInterval(applyPosition, POSITION_SYNC_MS);
		const unsubVisible = subscribeDocumentVisibleSync(applyPosition);

		return () => {
			window.clearInterval(id);
			unsubVisible();
			try {
				ms.setPositionState?.(undefined);
			} catch {
				/* ignore */
			}
		};
	}, [track, duration]);

	// Action handlers (stable registration; refs for latest callbacks)
	useEffect(() => {
		if (!mediaSessionSupported()) return;
		const ms = navigator.mediaSession;

		const safePlay = (): void => {
			const { isLoading: loading } = actionsRef.current;
			if (loading) return;
			actionsRef.current.play();
		};
		const safePause = (): void => {
			actionsRef.current.pause();
		};
		const safeNext = (): void => {
			actionsRef.current.next();
		};
		const safePrev = (): void => {
			actionsRef.current.prev();
		};
		const safeSeekBack = (): void => {
			const { currentTime: ct } = positionRef.current;
			const nextT = Math.max(0, ct - SEEK_MEDIA_STEP);
			actionsRef.current.seek(nextT);
		};
		const safeSeekForward = (): void => {
			const { duration: dur, currentTime: ct } = positionRef.current;
			const cap = Number.isFinite(dur) && dur > 0 ? dur : ct + SEEK_MEDIA_STEP;
			const nextT = Math.min(cap, ct + SEEK_MEDIA_STEP);
			actionsRef.current.seek(nextT);
		};

		try {
			ms.setActionHandler('play', safePlay);
			ms.setActionHandler('pause', safePause);
			ms.setActionHandler('previoustrack', safePrev);
			ms.setActionHandler('nexttrack', safeNext);
			ms.setActionHandler('seekbackward', safeSeekBack);
			ms.setActionHandler('seekforward', safeSeekForward);
		} catch {
			/* ignore */
		}

		return () => {
			for (const action of [
				'play',
				'pause',
				'previoustrack',
				'nexttrack',
				'seekbackward',
				'seekforward',
			] as const) {
				try {
					ms.setActionHandler(action, null);
				} catch {
					/* ignore */
				}
			}
			try {
				ms.metadata = null;
				ms.playbackState = 'none';
				ms.setPositionState?.(undefined);
			} catch {
				/* ignore */
			}
		};
	}, []);
}
