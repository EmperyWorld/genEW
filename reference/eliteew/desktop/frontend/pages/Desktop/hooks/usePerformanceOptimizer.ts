/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop shell performance telemetry: frame cadence, memory sampling, окно-count и rollup метрик фоновых адаптеров
 * из ``DesktopBackgroundRuntimeContext`` для виджета настроек и floating widget.
 *
 * Invariants:
 * - Frame telemetry uses one foreground rAF sampler and pauses when the document is hidden.
 * - Интервалы — ``DESKTOP_POLLING``; при неизменных числах возвращаем прежние ссылки на ``metrics`` и массив ``recommendations``.
 * - Memory sample refreshes immediately when the tab becomes visible again.
 *
 * Related:
 * - src/pages/Desktop/runtime/DesktopBackgroundRuntimeContext.tsx
 * - utils/subscribeDocumentVisibleSync.ts
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { DESKTOP_POLLING, DESKTOP_PERFORMANCE_TARGETS } from '../constants';
import {
	subscribeDocumentVisibilityChange,
	subscribeDocumentVisibleSync,
} from '../utils/subscribeDocumentVisibleSync';

interface PerformanceMetrics {
	/** Rolling measured frame cadence while the desktop tab is visible. */
	fps: number;
	/** Rolling average frame interval in milliseconds. */
	renderTime: number;
	windowCount: number;
	memoryUsage: number;
	activeAdapters: number;
	suspendedAdapters: number;
	pausedEffects: number;
	backgroundInvalidationsPerMin: number;
	longTaskSupported: boolean;
	longTaskCount: number;
	lastLongTaskMs: number | null;
	lastAction: ShellPerformanceActionSample | null;
	actionSampleCount: number;
}

type PerformanceBudgetStatus = 'healthy' | 'warning' | 'critical';

export type ShellPerformanceActionName =
	| 'shell-chrome-render-burst'
	| 'window-drag-commit'
	| 'restore-burst'
	| 'primary-overlay-open'
	| 'primary-overlay-close';

export interface ShellPerformanceActionSample {
	name: ShellPerformanceActionName;
	durationMs: number;
	at: number;
}

interface PerformanceHookConfig {
	windowCount?: number;
	runtimeMetrics?: {
		activeAdapters: number;
		suspendedAdapters: number;
		pausedEffects: number;
		backgroundInvalidationsPerMin: number;
	};
}

const SHELL_WINDOW_CRITICAL = 50;
const FRAME_SAMPLE_SIZE = 60;
const FRAME_METRICS_MIN_DELTA = 0.5;
const FRAME_METRICS_PUBLISH_INTERVAL_MS = 1000;
const LONG_TASK_WARN_MS = 50;
const ACTION_SAMPLE_MAX = 12;

function roundMetric(value: number): number {
	return Math.round(value * 10) / 10;
}

export function usePerformanceOptimizer(config: PerformanceHookConfig = {}) {
	const { windowCount, runtimeMetrics } = config;
	const currentWindowCount = windowCount ?? 0;

	const [metrics, setMetrics] = useState<PerformanceMetrics>({
		fps: DESKTOP_PERFORMANCE_TARGETS.TARGET_FPS,
		renderTime: 0,
		windowCount: 0,
		memoryUsage: 0,
		activeAdapters: 0,
		suspendedAdapters: 0,
		pausedEffects: 0,
		backgroundInvalidationsPerMin: 0,
		longTaskSupported: false,
		longTaskCount: 0,
		lastLongTaskMs: null,
		lastAction: null,
		actionSampleCount: 0,
	});

	const [
		preferAggressiveBackgroundSuspend,
		setPreferAggressiveBackgroundSuspend,
	] = useState(true);

	useEffect(() => {
		setMetrics((prev) =>
			prev.windowCount === currentWindowCount
				? prev
				: {
						...prev,
						windowCount: currentWindowCount,
					}
		);
	}, [currentWindowCount]);

	useEffect(() => {
		if (!runtimeMetrics) return;
		setMetrics((prev) => {
			if (
				prev.activeAdapters === runtimeMetrics.activeAdapters &&
				prev.suspendedAdapters === runtimeMetrics.suspendedAdapters &&
				prev.pausedEffects === runtimeMetrics.pausedEffects &&
				prev.backgroundInvalidationsPerMin ===
					runtimeMetrics.backgroundInvalidationsPerMin
			) {
				return prev;
			}
			return {
				...prev,
				activeAdapters: runtimeMetrics.activeAdapters,
				suspendedAdapters: runtimeMetrics.suspendedAdapters,
				pausedEffects: runtimeMetrics.pausedEffects,
				backgroundInvalidationsPerMin:
					runtimeMetrics.backgroundInvalidationsPerMin,
			};
		});
	}, [runtimeMetrics]);

	const isAutoQuietWindowLoad = useMemo(
		() =>
			metrics.windowCount > DESKTOP_PERFORMANCE_TARGETS.WINDOW_AUTO_QUIET_COUNT,
		[metrics.windowCount]
	);

	const isHighPerformanceMode = useMemo(() => {
		return (
			metrics.windowCount > DESKTOP_PERFORMANCE_TARGETS.WINDOW_WARN_COUNT ||
			metrics.memoryUsage > DESKTOP_PERFORMANCE_TARGETS.MEMORY_WARN_MB
		);
	}, [metrics.windowCount, metrics.memoryUsage]);

	useEffect(() => {
		if (
			(isAutoQuietWindowLoad || isHighPerformanceMode) &&
			!preferAggressiveBackgroundSuspend
		) {
			setPreferAggressiveBackgroundSuspend(true);
		}
	}, [
		isAutoQuietWindowLoad,
		isHighPerformanceMode,
		preferAggressiveBackgroundSuspend,
	]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		let frameId: number | null = null;
		let lastFrameAt: number | null = null;
		let lastPublishedAt: number | null = null;
		let running = false;
		const samples: number[] = [];

		const stop = () => {
			running = false;
			lastFrameAt = null;
			lastPublishedAt = null;
			if (frameId !== null) {
				window.cancelAnimationFrame(frameId);
				frameId = null;
			}
		};

		const publish = () => {
			if (samples.length === 0) return;
			const avgFrameMs =
				samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
			const nextRenderTime = roundMetric(avgFrameMs);
			const nextFps = roundMetric(Math.min(240, 1000 / avgFrameMs));
			setMetrics((prev) =>
				Math.abs(prev.fps - nextFps) < FRAME_METRICS_MIN_DELTA &&
				Math.abs(prev.renderTime - nextRenderTime) < FRAME_METRICS_MIN_DELTA
					? prev
					: {
							...prev,
							fps: nextFps,
							renderTime: nextRenderTime,
						}
			);
		};

		const tick = (now: number) => {
			if (!running) return;
			if (lastFrameAt === null) {
				lastFrameAt = now;
				lastPublishedAt = now;
				frameId = window.requestAnimationFrame(tick);
				return;
			}
			const delta = now - lastFrameAt;
			if (Number.isFinite(delta) && delta > 0 && delta < 1000) {
				samples.push(delta);
				if (samples.length > FRAME_SAMPLE_SIZE) {
					samples.shift();
				}
				if (
					lastPublishedAt === null ||
					now - lastPublishedAt >= FRAME_METRICS_PUBLISH_INTERVAL_MS
				) {
					lastPublishedAt = now;
					publish();
				}
			}
			lastFrameAt = now;
			frameId = window.requestAnimationFrame(tick);
		};

		const start = () => {
			if (running || document.hidden) return;
			running = true;
			lastFrameAt = null;
			frameId = window.requestAnimationFrame(tick);
		};

		start();
		const unsubscribeVisible = subscribeDocumentVisibilityChange(() => {
			if (document.hidden) {
				stop();
				return;
			}
			start();
		});

		return () => {
			unsubscribeVisible();
			stop();
		};
	}, []);

	useEffect(() => {
		if (
			typeof window === 'undefined' ||
			typeof PerformanceObserver === 'undefined'
		) {
			return;
		}
		const ctor = PerformanceObserver as typeof PerformanceObserver & {
			supportedEntryTypes?: string[];
		};
		if (!ctor.supportedEntryTypes?.includes('longtask')) return;

		setMetrics((prev) =>
			prev.longTaskSupported ? prev : { ...prev, longTaskSupported: true }
		);

		const observer = new PerformanceObserver((list) => {
			const entries = list.getEntries();
			if (entries.length === 0) return;
			const longest = entries.reduce(
				(max, entry) => Math.max(max, entry.duration),
				0
			);
			setMetrics((prev) => ({
				...prev,
				longTaskCount: prev.longTaskCount + entries.length,
				lastLongTaskMs: roundMetric(longest),
			}));
		});

		try {
			observer.observe({ entryTypes: ['longtask'] });
		} catch {
			return;
		}

		return () => {
			observer.disconnect();
		};
	}, []);

	useEffect(() => {
		const checkMemoryUsage = () => {
			type PerformanceWithMemory = Performance & {
				memory?: { usedJSHeapSize: number };
			};
			const perf = performance as PerformanceWithMemory;
			if (perf.memory) {
				const memoryUsageMB = Math.round(perf.memory.usedJSHeapSize / 1048576);
				setMetrics((prev) =>
					prev.memoryUsage === memoryUsageMB
						? prev
						: { ...prev, memoryUsage: memoryUsageMB }
				);
			}
		};

		checkMemoryUsage();
		const interval = setInterval(
			checkMemoryUsage,
			DESKTOP_POLLING.MEMORY_CHECK_MS
		);
		const unsubVisible = subscribeDocumentVisibleSync(checkMemoryUsage);

		return () => {
			clearInterval(interval);
			unsubVisible();
		};
	}, []);

	const recommendations = useMemo(() => {
		const recs: string[] = [];

		if (metrics.memoryUsage > DESKTOP_PERFORMANCE_TARGETS.MEMORY_WARN_MB) {
			recs.push(
				'Высокое использование памяти: рекомендуется закрыть неиспользуемые окна'
			);
		}
		if (metrics.fps < DESKTOP_PERFORMANCE_TARGETS.FPS_WARN) {
			recs.push(
				`Измеренная частота кадров ${metrics.fps} FPS ниже бюджета: проверьте тяжёлые окна и эффекты оболочки`
			);
		}
		if (metrics.renderTime > DESKTOP_PERFORMANCE_TARGETS.RENDER_WARN_MS) {
			recs.push(
				`Средний интервал кадра ${metrics.renderTime} мс выше бюджета ${DESKTOP_PERFORMANCE_TARGETS.RENDER_WARN_MS} мс`
			);
		}

		if (isAutoQuietWindowLoad) {
			recs.push(
				`Открыто ${metrics.windowCount} окон: включён тихий режим виджета и фоновый suspend`
			);
		}
		if (metrics.windowCount > DESKTOP_PERFORMANCE_TARGETS.WINDOW_WARN_COUNT) {
			recs.push(
				`Открыто много окон (${metrics.windowCount}): держите только активный рабочий набор`
			);
		}
		if (metrics.suspendedAdapters > 0) {
			recs.push(
				`Фоновых приложений в suspend: ${metrics.suspendedAdapters} (адаптеры разгружают UI/runtime)`
			);
		}
		if (metrics.backgroundInvalidationsPerMin > 30) {
			recs.push(
				'Высокий фоновый поток событий: оптимизируйте кэш-инвалидации для скрытых окон'
			);
		}
		if (
			metrics.longTaskSupported &&
			(metrics.lastLongTaskMs ?? 0) > LONG_TASK_WARN_MS
		) {
			recs.push(
				`Последняя длинная задача заняла ${metrics.lastLongTaskMs} мс: проверьте недавнее действие оболочки`
			);
		}

		return recs;
	}, [
		isAutoQuietWindowLoad,
		metrics.memoryUsage,
		metrics.fps,
		metrics.renderTime,
		metrics.windowCount,
		metrics.suspendedAdapters,
		metrics.backgroundInvalidationsPerMin,
		metrics.longTaskSupported,
		metrics.lastLongTaskMs,
	]);

	const budgetStatus = useMemo(() => {
		const load: PerformanceBudgetStatus = isHighPerformanceMode
			? 'warning'
			: 'healthy';

		const memory: PerformanceBudgetStatus =
			metrics.memoryUsage > DESKTOP_PERFORMANCE_TARGETS.MEMORY_WARN_MB
				? 'warning'
				: 'healthy';

		const windows: PerformanceBudgetStatus =
			metrics.windowCount > SHELL_WINDOW_CRITICAL
				? 'critical'
				: metrics.windowCount > DESKTOP_PERFORMANCE_TARGETS.WINDOW_WARN_COUNT
					? 'warning'
					: 'healthy';

		const frames: PerformanceBudgetStatus =
			metrics.fps < DESKTOP_PERFORMANCE_TARGETS.FPS_CRITICAL ||
			metrics.renderTime > DESKTOP_PERFORMANCE_TARGETS.RENDER_WARN_MS * 1.5
				? 'critical'
				: metrics.fps < DESKTOP_PERFORMANCE_TARGETS.FPS_WARN ||
						metrics.renderTime > DESKTOP_PERFORMANCE_TARGETS.RENDER_WARN_MS
					? 'warning'
					: 'healthy';

		const longTasks: PerformanceBudgetStatus =
			metrics.longTaskSupported && (metrics.lastLongTaskMs ?? 0) > 100
				? 'critical'
				: metrics.longTaskSupported &&
						(metrics.lastLongTaskMs ?? 0) > LONG_TASK_WARN_MS
					? 'warning'
					: 'healthy';

		return { load, memory, windows, frames, longTasks };
	}, [
		metrics.windowCount,
		metrics.memoryUsage,
		metrics.fps,
		metrics.renderTime,
		metrics.longTaskSupported,
		metrics.lastLongTaskMs,
		isHighPerformanceMode,
	]);

	const recordShellAction = useCallback(
		(name: ShellPerformanceActionName, durationMs = 0) => {
			const sample: ShellPerformanceActionSample = {
				name,
				durationMs: roundMetric(Math.max(0, durationMs)),
				at: Math.round(Date.now()),
			};
			setMetrics((prev) => ({
				...prev,
				lastAction: sample,
				actionSampleCount: Math.min(
					ACTION_SAMPLE_MAX,
					prev.actionSampleCount + 1
				),
			}));
		},
		[]
	);

	return {
		metrics,
		isHighPerformanceMode,
		isAutoQuietWindowLoad,
		preferAggressiveBackgroundSuspend,
		setPreferAggressiveBackgroundSuspend,
		recommendations,
		budgetStatus,
		recordShellAction,
		targets: DESKTOP_PERFORMANCE_TARGETS,
	};
}
