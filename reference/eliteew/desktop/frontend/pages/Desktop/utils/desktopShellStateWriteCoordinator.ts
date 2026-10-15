/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Legacy facade over `desktopShellStateMutationPipeline` for gradual migration of shell-state writers.
 *
 * Invariants:
 * - All coalesced PATCH traffic delegates to the pipeline FSM (no local pause flags).
 * - Durable wrapper enqueues offline copies via `desktopPersistPatchQueue` on non-conflict failures.
 * - Conflict recovery uses `resolveShellStateConflict()` (pipeline phase machine), not hook pause toggles.
 *
 * Related:
 * - `desktopShellStateMutationPipeline.ts`, `services/desktopApi.ts`
 * - `documentation/product/desktop/DESKTOP-STATE-PERSISTENCE.md`
 */

import {
	isDesktopShellStateConflictError,
	type DesktopShellState,
} from '../services/desktopApi';
import type { CoalescedDesktopShellStatePatch } from '../types/desktopShellStatePatch.types';
import { enqueueDesktopPersistShellPatch } from './desktopPersistPatchQueue';
import {
	flushShellStatePipelineOnPageHide,
	getShellStatePipelineSnapshot,
	getShellStatePipelineTelemetry,
	peekShellStatePipelinePendingPatchKeys,
	resetShellStatePipeline,
	resolveShellStateConflict,
	scheduleShellStateMutation,
	setShellStatePipelineFlushFailureHook,
	subscribeShellStatePipeline,
	waitForShellStatePipelineFlush,
	type ShellStateMutationSource,
} from './desktopShellStateMutationPipeline';

let flushFailureHookRegistered = false;
let pipelineSubscriptionRegistered = false;

export type CoalescedShellStatePatchErrorListener = (
	error: string | null
) => void;

const patchErrorListeners = new Set<CoalescedShellStatePatchErrorListener>();

/** Legacy patch-object API accumulates top-level keys until flush (separate from per-source merge fns). */
let legacyPendingPatch: Partial<CoalescedDesktopShellStatePatch> = {};

function mergeLegacyPendingPatch(patch: CoalescedDesktopShellStatePatch): void {
	for (const [key, value] of Object.entries(patch) as Array<
		[keyof CoalescedDesktopShellStatePatch, unknown]
	>) {
		if (value === undefined) continue;
		legacyPendingPatch[key] = value as never;
	}
}

function consumeLegacyPendingPatch(): Record<string, unknown> {
	return { ...legacyPendingPatch } as Record<string, unknown>;
}

function notifyCoalescedShellStatePatchErrorListeners(
	error: string | null
): void {
	for (const listener of patchErrorListeners) {
		listener(error);
	}
}

function ensurePipelineSubscriptionRegistered(): void {
	if (pipelineSubscriptionRegistered) return;
	pipelineSubscriptionRegistered = true;
	subscribeShellStatePipeline((snapshot) => {
		if (snapshot.phase === 'conflict' && snapshot.lastConflict) {
			notifyCoalescedShellStatePatchErrorListeners(
				snapshot.lastConflict.message
			);
			return;
		}
		if (snapshot.phase === 'idle' && snapshot.pendingSources.length === 0) {
			legacyPendingPatch = {};
			notifyCoalescedShellStatePatchErrorListeners(null);
		}
	});
}

function ensurePipelineFlushFailureHookRegistered(): void {
	if (flushFailureHookRegistered) return;
	flushFailureHookRegistered = true;
	setShellStatePipelineFlushFailureHook(({ error }) => {
		notifyCoalescedShellStatePatchErrorListeners(
			error instanceof Error ? error.message : 'desktop shell-state failed'
		);
	});
}

/** Subscribe to coordinator PATCH failures (any writer) and successful flush clears. */
export function subscribeCoalescedShellStatePatchErrors(
	listener: CoalescedShellStatePatchErrorListener
): () => void {
	ensurePipelineSubscriptionRegistered();
	patchErrorListeners.add(listener);
	return () => {
		patchErrorListeners.delete(listener);
	};
}

/**
 * @deprecated Use pipeline `resolveShellStateConflict()` — conflict phase is owned by the FSM.
 */
export function setCoalescedDesktopShellStateWriteConflictPaused(
	paused: boolean
): void {
	if (!paused) {
		void resolveShellStateConflict();
	}
}

/** @deprecated Query pipeline phase via `getShellStatePipelineSnapshot().phase === 'conflict'`. */
export function isCoalescedDesktopShellStateWriteConflictPaused(): boolean {
	return getShellStatePipelineSnapshot().phase === 'conflict';
}

export type ScheduleCoalescedDesktopShellStatePatchOptions = {
	debounceMs?: number;
	immediate?: boolean;
	source?: ShellStateMutationSource;
};

export type ScheduleDurableCoalescedDesktopShellStatePatchOptions =
	ScheduleCoalescedDesktopShellStatePatchOptions & {
		/** Auth subject used by the offline persist queue. Null keeps the normal in-memory retry only. */
		persistSubjectKey?: string | null;
	};

function schedulePatchViaPipeline(
	patch: CoalescedDesktopShellStatePatch,
	options?: ScheduleCoalescedDesktopShellStatePatchOptions
): Promise<DesktopShellState> {
	ensurePipelineSubscriptionRegistered();
	ensurePipelineFlushFailureHookRegistered();
	mergeLegacyPendingPatch(patch);
	scheduleShellStateMutation({
		source: options?.source ?? 'other',
		merge: () => consumeLegacyPendingPatch(),
		debounceMs: options?.debounceMs,
		immediate: options?.immediate,
	});
	return waitForShellStatePipelineFlush();
}

/**
 * Queue a partial shell_state patch; merged with other pending writers and flushed debounced.
 */
export function scheduleCoalescedDesktopShellStatePatch(
	patch: CoalescedDesktopShellStatePatch,
	options?: ScheduleCoalescedDesktopShellStatePatchOptions
): Promise<DesktopShellState> {
	return schedulePatchViaPipeline(patch, options);
}

/**
 * Queue a partial shell_state patch and persist a copy to the offline queue when the network flush fails.
 * The coalesced writer still keeps its in-memory retry path for the current tab.
 */
export async function scheduleDurableCoalescedDesktopShellStatePatch(
	patch: CoalescedDesktopShellStatePatch,
	options?: ScheduleDurableCoalescedDesktopShellStatePatchOptions
): Promise<DesktopShellState> {
	try {
		return await schedulePatchViaPipeline(patch, {
			...options,
			source: options?.source ?? 'persist',
		});
	} catch (error) {
		if (isDesktopShellStateConflictError(error)) {
			throw error;
		}
		const subject = options?.persistSubjectKey?.trim();
		if (subject) {
			enqueueDesktopPersistShellPatch(subject, patch);
		}
		throw error;
	}
}

/** Flush any pending coalesced patch immediately (e.g. before refresh). */
export async function flushCoalescedDesktopShellStatePatchNow(): Promise<DesktopShellState> {
	return scheduleCoalescedDesktopShellStatePatch({}, { immediate: true });
}

/**
 * Best-effort drain of debounced pending patch on tab unload.
 * Clears debounce timer and sends keepalive PATCH; does not settle flush waiters.
 */
export function flushCoalescedDesktopShellStatePatchOnPageHide(): void {
	flushShellStatePipelineOnPageHide();
}

/** Reset coordinator state (logout, tests). */
export function resetCoalescedDesktopShellStateWriter(): void {
	legacyPendingPatch = {};
	resetShellStatePipeline();
	notifyCoalescedShellStatePatchErrorListeners(null);
}

export function peekCoalescedDesktopShellStatePendingKeys(): string[] {
	return peekShellStatePipelinePendingPatchKeys();
}

export function getCoalescedDesktopShellStateTelemetry(): {
	pendingKeys: string[];
	inflight: boolean;
	lastFlushLatencyMs: number | null;
	failedFlushCount: number;
	conflictFlushCount: number;
	lastConflictAtMs: number | null;
	keepaliveFlushCount: number;
} {
	const telemetry = getShellStatePipelineTelemetry();
	return {
		pendingKeys: peekShellStatePipelinePendingPatchKeys(),
		inflight: telemetry.inflight,
		lastFlushLatencyMs: telemetry.lastFlushLatencyMs,
		failedFlushCount: telemetry.failedFlushCount,
		conflictFlushCount: telemetry.conflictFlushCount,
		lastConflictAtMs: telemetry.lastConflictAtMs,
		keepaliveFlushCount: telemetry.keepaliveFlushCount,
	};
}

export {
	resolveShellStateConflict,
	scheduleShellStateMutation,
	subscribeShellStatePipeline,
	getShellStatePipelineSnapshot,
} from './desktopShellStateMutationPipeline';

export type {
	PipelinePhase,
	ShellStateMutationSource,
} from './desktopShellStateMutationPipeline';
