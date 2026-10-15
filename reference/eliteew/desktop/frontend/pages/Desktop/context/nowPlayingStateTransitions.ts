/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Isolated pure state transitions for NowPlayingContext playback lifecycle updates.
 *
 * Invariants:
 * - Transition helpers are side-effect free and preserve unrelated state fields.
 * - Error transitions always force `playing=false` and `isLoading=false`.
 *
 * Related:
 * - src/pages/Desktop/context/NowPlayingContext.tsx
 */

import type {
	NowPlayingDiagnostics,
	NowPlayingTrack,
} from './NowPlayingContext';

type TransitionState = {
	track: NowPlayingTrack | null;
	playing: boolean;
	currentTime: number;
	duration: number;
	bufferedRanges: Array<{ start: number; end: number }>;
	isLoading: boolean;
	isLoadingStalled: boolean;
	error: string | null;
	errorTrackId: string | null;
	diagnostics: NowPlayingDiagnostics;
};

type DiagnosticsPatch = Partial<
	Pick<
		NowPlayingDiagnostics,
		| 'trackId'
		| 'sourceSurface'
		| 'cacheSource'
		| 'loadingStage'
		| 'errorCategory'
	>
>;

export function withTrackReset<T extends TransitionState>(
	state: T,
	track: NowPlayingTrack | null
): T {
	return {
		...state,
		track,
		playing: false,
		currentTime: 0,
		duration: 0,
		bufferedRanges: [],
		error: null,
		errorTrackId: null,
		isLoading: false,
		isLoadingStalled: false,
		diagnostics: {
			...state.diagnostics,
			trackId: track?.id ?? null,
			sourceSurface: track?.source_surface ?? 'unknown',
			cacheSource: null,
			loadingStage: 'idle',
			errorCategory: null,
		},
	};
}

export function withTrackLoadStart<T extends TransitionState>(
	state: T,
	track: NowPlayingTrack,
	seekOnLoad: number
): T {
	return {
		...state,
		track,
		playing: false,
		currentTime: seekOnLoad,
		duration: 0,
		bufferedRanges: [],
		isLoading: true,
		isLoadingStalled: false,
		error: null,
		errorTrackId: null,
		diagnostics: {
			...state.diagnostics,
			trackId: track.id,
			sourceSurface: track.source_surface ?? 'unknown',
			cacheSource: null,
			loadingStage: 'loading-blob',
			errorCategory: null,
		},
	};
}

export function withDiagnosticsPatch<T extends TransitionState>(
	state: T,
	patch: DiagnosticsPatch
): T {
	return {
		...state,
		diagnostics: {
			...state.diagnostics,
			...patch,
		},
	};
}

export function withTrackError<T extends TransitionState>(
	state: T,
	args: {
		trackId: string | null;
		message: string;
		category: NowPlayingDiagnostics['errorCategory'];
		cacheSource?: NowPlayingDiagnostics['cacheSource'];
	}
): T {
	return {
		...state,
		playing: false,
		isLoading: false,
		isLoadingStalled: false,
		error: args.message,
		errorTrackId: args.trackId,
		diagnostics: {
			...state.diagnostics,
			cacheSource:
				args.cacheSource !== undefined
					? args.cacheSource
					: state.diagnostics.cacheSource,
			loadingStage: 'error',
			errorCategory: args.category,
		},
	};
}
