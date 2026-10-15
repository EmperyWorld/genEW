/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Lightweight telemetry helpers for desktop music playback load/error/state transitions.
 *
 * Invariants:
 * - Metrics are best-effort only; failures never affect playback behavior.
 * - Event payloads avoid PII and use stable enum-like string stages.
 *
 * Related:
 * - src/pages/Desktop/context/NowPlayingContext.tsx
 */

type PlaybackSource = 'network' | 'idb-cache';
type PlaybackStage =
	| 'play-request'
	| 'blob-cache-hit'
	| 'network-fetch'
	| 'canplay'
	| 'play-rejection'
	| 'ended';

function emitPlaybackMetric(detail: Record<string, unknown>): void {
	try {
		window.dispatchEvent(
			new CustomEvent('desktop-music-playback-metric', {
				detail: {
					...detail,
					timestamp: Date.now(),
				},
			})
		);
	} catch {
		/* ignore */
	}
}

export function markTrackLoadStart(trackId: string): string {
	const mark = `music-load-start:${trackId}:${Date.now()}`;
	try {
		performance.mark(mark);
	} catch {
		/* ignore */
	}
	return mark;
}

export function markTrackLoadReady(
	trackId: string,
	startMark: string,
	source: PlaybackSource
): void {
	const endMark = `music-load-end:${trackId}:${Date.now()}`;
	try {
		performance.mark(endMark);
		performance.measure(`music-load:${trackId}`, startMark, endMark);
	} catch {
		/* ignore */
	}
	emitPlaybackMetric({
		type: 'track-ready',
		trackId,
		source,
	});
}

export function emitPlaybackErrorMetric(
	trackId: string,
	message: string,
	category?: string | null
): void {
	emitPlaybackMetric({
		type: 'track-error',
		trackId,
		message,
		category: category ?? null,
	});
}

export function emitShellPersistMetric(): void {
	emitPlaybackMetric({
		type: 'shell-persist',
	});
}

export function emitPlaybackStageMetric(
	trackId: string,
	stage: PlaybackStage,
	extra?: Record<string, unknown>
): void {
	emitPlaybackMetric({
		type: 'playback-stage',
		trackId,
		stage,
		...(extra ?? {}),
	});
}
