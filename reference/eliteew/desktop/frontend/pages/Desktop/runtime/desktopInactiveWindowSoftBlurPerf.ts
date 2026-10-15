/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Session-local rAF + long-task sampler for inactive-window soft blur A/B checks.
 *
 * Invariants:
 * - Read-only observer; does not mutate shell state or persist samples server-side.
 *
 * Related:
 * - `desktopInactiveWindowBlur.ts`, `e2e/desktopRuntimeSmoke.ts`
 * - documentation/product/desktop/DESKTOP-WINDOW-RUNTIME-PERFORMANCE.md
 * ---
 */

import {
	isDesktopInactiveWindowSoftBlurEnabled,
	setDesktopInactiveWindowSoftBlurEnabled,
} from './desktopInactiveWindowBlur';

const PERF_STORAGE_KEY = 'elite_desktop_inactive_window_soft_blur_perf';

export type DesktopInactiveWindowSoftBlurPerfSample = {
	sampleMs: number;
	frameCount: number;
	avgFrameMs: number;
	fps: number;
	p95FrameMs: number;
	longTaskCount: number;
	longTaskSupported: boolean;
	inactiveSoftBlurShellCount: number;
	inactiveWindowCount: number;
	softBlurEnabled: boolean;
};

/** User-shareable JSON (no FPS/p95 jargon in field names). */
export type DesktopInactiveWindowSoftBlurPerfSharePayload = {
	kind: 'desktop-inactive-soft-blur-smoothness-check';
	version: 1;
	capturedAt: string;
	checkDurationSeconds: number;
	softBlurEnabled: boolean;
	smoothness: {
		screenUpdatesPerSecond: number;
		longestPauseBetweenUpdatesMs: number;
		briefFreezesDetected: number;
		longTaskSamplingAvailable: boolean;
	};
	windows: {
		inactiveCount: number;
		withSoftLookCount: number;
	};
};

export function buildDesktopInactiveWindowSoftBlurPerfSharePayload(
	sample: DesktopInactiveWindowSoftBlurPerfSample,
	options: { capturedAt?: string } = {}
): DesktopInactiveWindowSoftBlurPerfSharePayload {
	return {
		kind: 'desktop-inactive-soft-blur-smoothness-check',
		version: 1,
		capturedAt: options.capturedAt ?? new Date().toISOString(),
		checkDurationSeconds: Math.round(sample.sampleMs / 100) / 10,
		softBlurEnabled: sample.softBlurEnabled,
		smoothness: {
			screenUpdatesPerSecond: sample.fps,
			longestPauseBetweenUpdatesMs: sample.p95FrameMs,
			briefFreezesDetected: sample.longTaskCount,
			longTaskSamplingAvailable: sample.longTaskSupported,
		},
		windows: {
			inactiveCount: sample.inactiveWindowCount,
			withSoftLookCount: sample.inactiveSoftBlurShellCount,
		},
	};
}

export function serializeDesktopInactiveWindowSoftBlurPerfSampleForShare(
	sample: DesktopInactiveWindowSoftBlurPerfSample,
	options: { capturedAt?: string } = {}
): string {
	return JSON.stringify(
		buildDesktopInactiveWindowSoftBlurPerfSharePayload(sample, options),
		null,
		2
	);
}

declare global {
	interface Window {
		__eliteDesktopInactiveSoftBlurPerf?: {
			collect: typeof collectDesktopInactiveWindowSoftBlurPerfSample;
			serializeForShare: typeof serializeDesktopInactiveWindowSoftBlurPerfSampleForShare;
			isPerfBridgeEnabled: typeof isDesktopInactiveWindowSoftBlurPerfBridgeEnabled;
			setSoftBlurEnabled: typeof setDesktopInactiveWindowSoftBlurEnabled;
			isSoftBlurEnabled: typeof isDesktopInactiveWindowSoftBlurEnabled;
		};
	}
}

function parseBooleanLike(value: string | null | undefined): boolean | null {
	if (value == null) return null;
	const normalized = value.trim().toLowerCase();
	if (
		normalized === '1' ||
		normalized === 'true' ||
		normalized === 'on' ||
		normalized === 'yes'
	) {
		return true;
	}
	if (
		normalized === '0' ||
		normalized === 'false' ||
		normalized === 'off' ||
		normalized === 'no'
	) {
		return false;
	}
	return null;
}

export function isDesktopInactiveWindowSoftBlurPerfBridgeEnabled(): boolean {
	if (typeof window !== 'undefined') {
		try {
			const fromStorage = parseBooleanLike(
				window.localStorage.getItem(PERF_STORAGE_KEY)
			);
			if (fromStorage != null) return fromStorage;
		} catch {
			/* ignore */
		}
	}
	const env = parseBooleanLike(
		(import.meta.env?.VITE_DESKTOP_INACTIVE_WINDOW_SOFT_BLUR_PERF as
			| string
			| undefined) ?? undefined
	);
	if (env != null) return env;
	return import.meta.env.DEV;
}

function countInactiveWindowShells(): {
	inactiveSoftBlurShellCount: number;
	inactiveWindowCount: number;
} {
	if (typeof document === 'undefined') {
		return { inactiveSoftBlurShellCount: 0, inactiveWindowCount: 0 };
	}
	return {
		inactiveSoftBlurShellCount: document.querySelectorAll(
			'.desktop-window-inactive-soft-blur'
		).length,
		inactiveWindowCount: document.querySelectorAll(
			'[data-desktop-window-active="false"]'
		).length,
	};
}

/**
 * Settings → Performance smoothness check (user-facing copy in desktopUi i18n):
 * 1. Open several windows; keep one in focus.
 * 2. Run “Check smoothness (8 seconds)” with the experiment off, then on.
 * 3. Compare the on-device results (updates/sec, longest wait, brief freezes).
 * 4. Leave the toggle off unless both checks feel smooth — default stays off.
 *
 * Operator notes (foreground tab, 8–12 windows, low-GPU window mode OFF):
 * compare p95 frame ms and long-task counts before any default-on rollout.
 */
export async function collectDesktopInactiveWindowSoftBlurPerfSample(
	options: { sampleMs?: number } = {}
): Promise<DesktopInactiveWindowSoftBlurPerfSample> {
	const sampleMs = Math.max(1000, Math.min(options.sampleMs ?? 8000, 30_000));
	const startedAt = performance.now();
	const longTasks: number[] = [];
	let longTaskSupported = false;
	let observer: PerformanceObserver | null = null;

	try {
		if (
			'PerformanceObserver' in globalThis &&
			PerformanceObserver.supportedEntryTypes?.includes('longtask')
		) {
			longTaskSupported = true;
			observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					longTasks.push(Math.round(entry.duration * 10) / 10);
				}
			});
			observer.observe({ entryTypes: ['longtask'] });
		}
	} catch {
		observer = null;
		longTaskSupported = false;
	}

	const frames: number[] = [];
	let lastFrameAt: number | null = null;

	await new Promise<void>((resolve) => {
		const tick = (now: number) => {
			if (lastFrameAt !== null) frames.push(now - lastFrameAt);
			lastFrameAt = now;
			if (performance.now() - startedAt >= sampleMs) {
				resolve();
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});

	observer?.disconnect();

	const avgFrame =
		frames.reduce((acc, value) => acc + value, 0) / Math.max(1, frames.length);
	const sortedFrames = [...frames].sort((a, b) => a - b);
	const p95Frame = sortedFrames[Math.floor(sortedFrames.length * 0.95)] ?? 0;
	const shellCounts = countInactiveWindowShells();

	return {
		sampleMs,
		frameCount: frames.length,
		avgFrameMs: Math.round(avgFrame * 10) / 10,
		fps: Math.round((1000 / Math.max(avgFrame, 1)) * 10) / 10,
		p95FrameMs: Math.round(p95Frame * 10) / 10,
		longTaskCount: longTasks.length,
		longTaskSupported,
		inactiveSoftBlurShellCount: shellCounts.inactiveSoftBlurShellCount,
		inactiveWindowCount: shellCounts.inactiveWindowCount,
		softBlurEnabled: isDesktopInactiveWindowSoftBlurEnabled(),
	};
}

export function installDesktopInactiveWindowSoftBlurPerfDevBridge(): void {
	if (typeof window === 'undefined') return;
	window.__eliteDesktopInactiveSoftBlurPerf = {
		collect: collectDesktopInactiveWindowSoftBlurPerfSample,
		serializeForShare: serializeDesktopInactiveWindowSoftBlurPerfSampleForShare,
		isPerfBridgeEnabled: isDesktopInactiveWindowSoftBlurPerfBridgeEnabled,
		setSoftBlurEnabled: setDesktopInactiveWindowSoftBlurEnabled,
		isSoftBlurEnabled: isDesktopInactiveWindowSoftBlurEnabled,
	};
}

if (
	typeof window !== 'undefined' &&
	isDesktopInactiveWindowSoftBlurPerfBridgeEnabled()
) {
	installDesktopInactiveWindowSoftBlurPerfDevBridge();
}
