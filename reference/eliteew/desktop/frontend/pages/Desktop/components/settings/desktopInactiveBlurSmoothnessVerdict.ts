/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Plain smoothness verdict for inactive-window soft-blur 8s measure.
 *
 * Invariants:
 * - Thresholds align with desktop performance budget targets (not studio profiling).
 *
 * Related:
 * - `DesktopSettingsPerformanceTab.tsx`, `desktopInactiveWindowSoftBlurPerf.ts`
 */

export type InactiveBlurSmoothnessVerdict = 'good' | 'medium' | 'low';

export function computeInactiveBlurSmoothnessVerdict(input: {
	fps: number;
	p95FrameMs: number;
	longTaskCount: number;
}): InactiveBlurSmoothnessVerdict {
	if (input.fps >= 55 && input.p95FrameMs <= 25 && input.longTaskCount <= 1) {
		return 'good';
	}
	if (input.fps >= 45 && input.p95FrameMs <= 40 && input.longTaskCount <= 3) {
		return 'medium';
	}
	return 'low';
}
