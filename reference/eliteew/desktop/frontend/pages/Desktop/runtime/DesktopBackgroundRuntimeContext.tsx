import * as React from 'react';
import type { DesktopWindowBackgroundLevel } from '../context/DesktopWindowActiveContext';

export interface DesktopBackgroundAdapterSnapshot {
	id: string;
	appComponent: string;
	backgroundLevel: DesktopWindowBackgroundLevel;
	shouldSuspendAppRuntime: boolean;
	shouldPauseEffects: boolean;
	pausedEffects: number;
}

export interface DesktopBackgroundRuntimeMetrics {
	adapterCount: number;
	activeAdapters: number;
	suspendedAdapters: number;
	pausedEffects: number;
	backgroundInvalidationsPerMin: number;
}

type RuntimeContextValue = {
	upsertAdapterSnapshot: (snapshot: DesktopBackgroundAdapterSnapshot) => void;
	removeAdapterSnapshot: (adapterId: string) => void;
	setAdapterPausedEffects: (adapterId: string, pausedEffects: number) => void;
	trackBackgroundInvalidation: () => void;
	metrics: DesktopBackgroundRuntimeMetrics;
};

const DEFAULT_METRICS: DesktopBackgroundRuntimeMetrics = {
	adapterCount: 0,
	activeAdapters: 0,
	suspendedAdapters: 0,
	pausedEffects: 0,
	backgroundInvalidationsPerMin: 0,
};

const noop = () => {};

const DesktopBackgroundRuntimeContext =
	React.createContext<RuntimeContextValue>({
		upsertAdapterSnapshot: noop,
		removeAdapterSnapshot: noop,
		setAdapterPausedEffects: noop,
		trackBackgroundInvalidation: noop,
		metrics: DEFAULT_METRICS,
	});

function collectMetrics(
	snapshots: Map<string, DesktopBackgroundAdapterSnapshot>,
	invalidationTimestamps: number[]
): DesktopBackgroundRuntimeMetrics {
	let activeAdapters = 0;
	let suspendedAdapters = 0;
	let pausedEffects = 0;

	for (const snapshot of snapshots.values()) {
		if (snapshot.backgroundLevel === 'foreground') {
			activeAdapters += 1;
		}
		if (snapshot.shouldSuspendAppRuntime) {
			suspendedAdapters += 1;
		}
		pausedEffects += Math.max(0, snapshot.pausedEffects);
	}

	return {
		adapterCount: snapshots.size,
		activeAdapters,
		suspendedAdapters,
		pausedEffects,
		backgroundInvalidationsPerMin: invalidationTimestamps.length,
	};
}

export function DesktopBackgroundRuntimeProvider({
	children,
}: {
	children: React.ReactNode;
}): React.JSX.Element {
	const snapshotsRef = React.useRef<
		Map<string, DesktopBackgroundAdapterSnapshot>
	>(new Map());
	const invalidationTimestampsRef = React.useRef<number[]>([]);
	const [metrics, setMetrics] =
		React.useState<DesktopBackgroundRuntimeMetrics>(DEFAULT_METRICS);

	const recomputeMetrics = React.useCallback(() => {
		const now = Date.now();
		const threshold = now - 60_000;
		invalidationTimestampsRef.current =
			invalidationTimestampsRef.current.filter((ts) => ts >= threshold);
		const next = collectMetrics(
			snapshotsRef.current,
			invalidationTimestampsRef.current
		);
		setMetrics((prev) => {
			if (
				prev.adapterCount === next.adapterCount &&
				prev.activeAdapters === next.activeAdapters &&
				prev.suspendedAdapters === next.suspendedAdapters &&
				prev.pausedEffects === next.pausedEffects &&
				prev.backgroundInvalidationsPerMin ===
					next.backgroundInvalidationsPerMin
			) {
				return prev;
			}
			return next;
		});
	}, []);

	const upsertAdapterSnapshot = React.useCallback(
		(snapshot: DesktopBackgroundAdapterSnapshot) => {
			snapshotsRef.current.set(snapshot.id, snapshot);
			recomputeMetrics();
		},
		[recomputeMetrics]
	);

	const removeAdapterSnapshot = React.useCallback(
		(adapterId: string) => {
			if (!snapshotsRef.current.has(adapterId)) return;
			snapshotsRef.current.delete(adapterId);
			recomputeMetrics();
		},
		[recomputeMetrics]
	);

	const setAdapterPausedEffects = React.useCallback(
		(adapterId: string, pausedEffects: number) => {
			const current = snapshotsRef.current.get(adapterId);
			if (!current) return;
			if (current.pausedEffects === pausedEffects) return;
			snapshotsRef.current.set(adapterId, {
				...current,
				pausedEffects: Math.max(0, pausedEffects),
			});
			recomputeMetrics();
		},
		[recomputeMetrics]
	);

	const trackBackgroundInvalidation = React.useCallback(() => {
		invalidationTimestampsRef.current.push(Date.now());
		recomputeMetrics();
	}, [recomputeMetrics]);

	const value = React.useMemo<RuntimeContextValue>(
		() => ({
			upsertAdapterSnapshot,
			removeAdapterSnapshot,
			setAdapterPausedEffects,
			trackBackgroundInvalidation,
			metrics,
		}),
		[
			upsertAdapterSnapshot,
			removeAdapterSnapshot,
			setAdapterPausedEffects,
			trackBackgroundInvalidation,
			metrics,
		]
	);

	return (
		<DesktopBackgroundRuntimeContext.Provider value={value}>
			{children}
		</DesktopBackgroundRuntimeContext.Provider>
	);
}

export function useDesktopBackgroundRuntimeMetrics(): DesktopBackgroundRuntimeMetrics {
	return React.useContext(DesktopBackgroundRuntimeContext).metrics;
}

export function useDesktopBackgroundRuntimeController() {
	const ctx = React.useContext(DesktopBackgroundRuntimeContext);
	return React.useMemo(
		() => ({
			upsertAdapterSnapshot: ctx.upsertAdapterSnapshot,
			removeAdapterSnapshot: ctx.removeAdapterSnapshot,
			setAdapterPausedEffects: ctx.setAdapterPausedEffects,
			trackBackgroundInvalidation: ctx.trackBackgroundInvalidation,
		}),
		[
			ctx.upsertAdapterSnapshot,
			ctx.removeAdapterSnapshot,
			ctx.setAdapterPausedEffects,
			ctx.trackBackgroundInvalidation,
		]
	);
}
