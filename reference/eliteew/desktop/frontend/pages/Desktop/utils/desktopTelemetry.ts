/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop telemetry transport for non-PII UI/runtime events consumed by analytics observers.
 * Dispatches typed custom events to keep desktop metrics and UX diagnostics centralized.
 *
 * Invariants:
 * - Emits nothing when `VITE_DESKTOP_TELEMETRY === 'false'`.
 * - Payloads avoid user/content identifiers and keep only technical context.
 * - Event channel name stays `desktop-telemetry` for existing listeners.
 *
 * Related:
 * - `pages/Desktop/components/CommandPalette.tsx`
 * - `pages/Desktop/components/RuntimeDisabledActionsHintCard.tsx`
 * - `pages/Desktop/utils/__tests__/desktopTelemetry.test.ts`
 */

import { DESKTOP_PERFORMANCE_TARGETS } from '../constants';

const TELEMETRY_EVENT = 'desktop-telemetry';

/** Only emit when TELEMETRY is enabled (VITE_DESKTOP_TELEMETRY !== 'false'). */
const isTelemetryEnabled = (): boolean =>
	typeof import.meta.env.VITE_DESKTOP_TELEMETRY === 'string'
		? import.meta.env.VITE_DESKTOP_TELEMETRY !== 'false'
		: true;

export type DesktopTelemetryEvent =
	| { name: 'window_open'; appComponent: string; latencyMs: number }
	| { name: 'command_palette_open' }
	| { name: 'quick_search_open' }
	| { name: 'virtual_desktop_switch'; fromIndex: number; toIndex: number }
	| { name: 'fps_sample'; fps: number }
	| { name: 'memory_sample_mb'; mb: number }
	| {
			name: 'doc_editor_load_start';
			targetType: 'docEditor' | 'unifiedContent';
			requestId?: string;
	  }
	| {
			name: 'doc_editor_load_finish';
			targetType: 'docEditor' | 'unifiedContent';
			status:
				| 'success'
				| 'not_found'
				| 'forbidden'
				| 'network'
				| 'unknown'
				| 'canceled';
			durationMs: number;
			requestId?: string;
	  }
	| {
			name: 'doc_editor_tab_switch';
			fromTargetType: 'docEditor' | 'unifiedContent';
			toTargetType: 'docEditor' | 'unifiedContent';
			requestId?: string;
	  }
	| {
			name: 'doc_editor_leave_guard';
			channel: 'beforeunload' | 'window_close' | 'direct_close';
			reason: 'dirty' | 'loading' | 'saving' | 'empty_state' | 'clean';
			blocked: boolean;
			requestId?: string;
	  }
	| {
			name: 'runtime_disabled_reasons_toggle';
			surface: 'kirs' | 'site_studio';
			expanded: boolean;
			rawCount: number;
			collapsedCount: number;
			hiddenCount: number;
	  }
	| {
			name: 'doc_editor_v2_action';
			action:
				| 'open'
				| 'create'
				| 'save'
				| 'draft'
				| 'import'
				| 'export'
				| 'ewa_suggest'
				| 'ewa_apply';
			status: 'start' | 'success' | 'error' | 'conflict';
	  };

function emit(payload: DesktopTelemetryEvent) {
	if (typeof window === 'undefined' || !isTelemetryEnabled()) return;
	window.dispatchEvent(new CustomEvent(TELEMETRY_EVENT, { detail: payload }));
}

/** Call when a window has finished opening (after first paint). */
export function telemetryWindowOpen(appComponent: string, startMark: number) {
	const latencyMs = Math.round(performance.now() - startMark);
	emit({ name: 'window_open', appComponent, latencyMs });
	if (latencyMs > DESKTOP_PERFORMANCE_TARGETS.WINDOW_OPEN_LATENCY_MS) {
		// Optional: report slow open to Sentry
		console.warn(
			`[Desktop] Slow window open: ${appComponent} took ${latencyMs}ms`
		);
	}
}

export function telemetryCommandPaletteOpen() {
	emit({ name: 'command_palette_open' });
}

export function telemetryQuickSearchOpen() {
	emit({ name: 'quick_search_open' });
}

export function telemetryVirtualDesktopSwitch(
	fromIndex: number,
	toIndex: number
) {
	emit({ name: 'virtual_desktop_switch', fromIndex, toIndex });
}

export function telemetryFpsSample(fps: number) {
	emit({ name: 'fps_sample', fps });
}

export function telemetryMemorySampleMb(mb: number) {
	emit({ name: 'memory_sample_mb', mb });
}

/**
 * Tracks DocEditor file loading without PII (no ids/usernames in payload).
 * Returns start mark to pass into `telemetryDocEditorLoadFinish`.
 */
export function telemetryDocEditorLoadStart(
	targetType: 'docEditor' | 'unifiedContent',
	requestId?: string
): number {
	const startMark = performance.now();
	emit({
		name: 'doc_editor_load_start',
		targetType,
		...(requestId ? { requestId } : {}),
	});
	return startMark;
}

export function telemetryDocEditorLoadFinish(
	targetType: 'docEditor' | 'unifiedContent',
	status:
		| 'success'
		| 'not_found'
		| 'forbidden'
		| 'network'
		| 'unknown'
		| 'canceled',
	startMark: number,
	requestId?: string
) {
	const durationMs = Math.max(0, Math.round(performance.now() - startMark));
	emit({
		name: 'doc_editor_load_finish',
		targetType,
		status,
		durationMs,
		...(requestId ? { requestId } : {}),
	});
}

export function telemetryDocEditorTabSwitch(params: {
	fromTargetType: 'docEditor' | 'unifiedContent';
	toTargetType: 'docEditor' | 'unifiedContent';
	requestId?: string;
}) {
	emit({
		name: 'doc_editor_tab_switch',
		fromTargetType: params.fromTargetType,
		toTargetType: params.toTargetType,
		...(params.requestId ? { requestId: params.requestId } : {}),
	});
}

export function telemetryDocEditorLeaveGuard(params: {
	channel: 'beforeunload' | 'window_close' | 'direct_close';
	reason: 'dirty' | 'loading' | 'saving' | 'empty_state' | 'clean';
	blocked: boolean;
	requestId?: string;
}) {
	emit({
		name: 'doc_editor_leave_guard',
		channel: params.channel,
		reason: params.reason,
		blocked: params.blocked,
		...(params.requestId ? { requestId: params.requestId } : {}),
	});
}

export function telemetryDocEditorV2Action(
	action: Extract<
		DesktopTelemetryEvent,
		{ name: 'doc_editor_v2_action' }
	>['action'],
	status: Extract<
		DesktopTelemetryEvent,
		{ name: 'doc_editor_v2_action' }
	>['status']
) {
	emit({ name: 'doc_editor_v2_action', action, status });
}

export function telemetryRuntimeDisabledReasonsToggle(params: {
	surface: 'kirs' | 'site_studio';
	expanded: boolean;
	rawCount: number;
	collapsedCount: number;
	hiddenCount: number;
}) {
	emit({
		name: 'runtime_disabled_reasons_toggle',
		surface: params.surface,
		expanded: params.expanded,
		rawCount: params.rawCount,
		collapsedCount: params.collapsedCount,
		hiddenCount: params.hiddenCount,
	});
}
