/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Canonical FSM for desktop `shell_state` mutations: single etag holder, per-source debounce,
 * merged PATCH body, and bounded 412 recovery (one reload + one retry).
 *
 * Invariants:
 * - Only this module owns shell-state etag reads/writes for coalesced PATCH flushes.
 * - `conflict` and in-flight `recovering`/`flushing` block new network PATCH until resolve or flush completes.
 * - At most one 412 recovery round-trip per flush (reload GET → re-merge pending → single retry PATCH).
 * - Pending merge functions are never dropped on transient network errors.
 * - `pagehide` keepalive flush attempts only on leader tab; followers never send shell_state PATCH.
 *
 * Related:
 * - `desktopShellStateWriteCoordinator.ts`, `services/desktopApi.ts`
 * - `documentation/product/desktop/DESKTOP-STATE-PERSISTENCE.md`
 */

import * as desktopApi from '../services/desktopApi';
import { getDesktopConditionalCacheEtag } from '../services/desktopConditionalGet';
import { getBrowserTabLeaderRole } from '@/utils/browserTabLeaderState';

export type DesktopShellStateSnapshot = desktopApi.DesktopShellState;

export type ShellStateMutationSource =
	| 'windows'
	| 'expansion'
	| 'persist'
	| 'mru'
	| 'nowPlaying'
	| 'chrome'
	| 'other';

export type PipelinePhase =
	| 'idle'
	| 'debouncing'
	| 'flushing'
	| 'conflict'
	| 'recovering';

type MergeFn = (current: DesktopShellStateSnapshot) => Record<string, unknown>;

export type ShellStatePipelineFlushFailureHook = (context: {
	sources: ShellStateMutationSource[];
	patch: Record<string, unknown>;
	error: unknown;
}) => void;

const DEFAULT_DEBOUNCE_MS = 400;

const SOURCE_ORDER: ShellStateMutationSource[] = [
	'persist',
	'windows',
	'expansion',
	'mru',
	'nowPlaying',
	'chrome',
	'other',
];

let phase: PipelinePhase = 'idle';
let lastConflict: desktopApi.DesktopShellStateConflictError | null = null;
let inflightFlush: Promise<DesktopShellStateSnapshot> | null = null;
let flushFailureHook: ShellStatePipelineFlushFailureHook | null = null;

const pendingMerges = new Map<ShellStateMutationSource, MergeFn>();
const sourceDebounceTimers = new Map<
	ShellStateMutationSource,
	ReturnType<typeof setTimeout>
>();
let globalFlushTimer: ReturnType<typeof setTimeout> | null = null;
const pipelineListeners = new Set<
	(snapshot: ReturnType<typeof getShellStatePipelineSnapshot>) => void
>();

const flushWaiters: Array<{
	resolve: (state: DesktopShellStateSnapshot) => void;
	reject: (error: unknown) => void;
}> = [];

let failedFlushCount = 0;
let conflictFlushCount = 0;
let lastConflictAtMs: number | null = null;
let keepaliveFlushCount = 0;
let lastFlushLatencyMs: number | null = null;
let flushStartedAtMs: number | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

function deepMergePatch(
	target: Record<string, unknown>,
	source: Record<string, unknown>
): Record<string, unknown> {
	const result = { ...target };
	for (const [key, value] of Object.entries(source)) {
		if (value === undefined) continue;
		const existing = result[key];
		if (isPlainObject(existing) && isPlainObject(value)) {
			result[key] = deepMergePatch(existing, value);
		} else {
			result[key] = value;
		}
	}
	return result;
}

function readPipelineEtag(): string | null {
	return getDesktopConditionalCacheEtag('shell-state');
}

function notifyPipelineListeners(): void {
	const snapshot = getShellStatePipelineSnapshot();
	for (const listener of pipelineListeners) {
		listener(snapshot);
	}
}

function setPhase(next: PipelinePhase): void {
	if (phase === next) return;
	phase = next;
	notifyPipelineListeners();
}

/** Phases where outbound PATCH must not start (merges queue only). */
function isOutboundPatchBlockedPhase(current: PipelinePhase): boolean {
	return (
		current === 'conflict' || current === 'recovering' || current === 'flushing'
	);
}

function settleWaiters(result: DesktopShellStateSnapshot): void {
	if (flushStartedAtMs != null) {
		lastFlushLatencyMs = Math.max(0, Date.now() - flushStartedAtMs);
		flushStartedAtMs = null;
	}
	while (flushWaiters.length > 0) {
		const waiter = flushWaiters.shift();
		waiter?.resolve(result);
	}
}

function rejectWaiters(error: unknown): void {
	failedFlushCount += 1;
	if (error instanceof desktopApi.DesktopShellStateConflictError) {
		conflictFlushCount += 1;
		lastConflictAtMs = Date.now();
	}
	if (flushStartedAtMs != null) {
		lastFlushLatencyMs = Math.max(0, Date.now() - flushStartedAtMs);
		flushStartedAtMs = null;
	}
	while (flushWaiters.length > 0) {
		const waiter = flushWaiters.shift();
		waiter?.reject(error);
	}
}

function orderedPendingSources(): ShellStateMutationSource[] {
	return SOURCE_ORDER.filter((source) => pendingMerges.has(source));
}

function buildPatchBody(
	current: DesktopShellStateSnapshot
): Record<string, unknown> {
	let body: Record<string, unknown> = {};
	for (const source of orderedPendingSources()) {
		const mergeFn = pendingMerges.get(source);
		if (!mergeFn) continue;
		const partial = mergeFn(current);
		body = deepMergePatch(body, partial);
	}
	return body;
}

async function ensureShellStateHydrated(): Promise<DesktopShellStateSnapshot> {
	const cached = desktopApi.peekDesktopShellStateCache();
	if (cached) {
		return cached;
	}
	return desktopApi.fetchDesktopShellStateDeduplicated();
}

async function applyPatchWithBounded412Recovery(
	patch: desktopApi.DesktopShellStatePatch
): Promise<DesktopShellStateSnapshot> {
	await ensureShellStateHydrated();

	try {
		return await desktopApi.patchDesktopShellStateMerged(patch);
	} catch (error) {
		if (!desktopApi.isDesktopShellStateConflictError(error)) {
			throw error;
		}
		desktopApi.applyDesktopShellStateConflictEtag(error);
	}

	setPhase('recovering');
	await reloadShellStateFromServer();
	const current = await ensureShellStateHydrated();
	const retryPatch = buildPatchBody(current);

	if (Object.keys(retryPatch).length === 0) {
		setPhase('idle');
		return current;
	}

	try {
		return await desktopApi.patchDesktopShellStateMerged(
			retryPatch as desktopApi.DesktopShellStatePatch
		);
	} catch (error) {
		if (desktopApi.isDesktopShellStateConflictError(error)) {
			desktopApi.applyDesktopShellStateConflictEtag(error);
		}
		throw error;
	}
}

function snapshotPendingMerges(): Map<ShellStateMutationSource, MergeFn> {
	return new Map(pendingMerges);
}

function restorePendingMerges(
	snapshot: Map<ShellStateMutationSource, MergeFn>
): void {
	pendingMerges.clear();
	for (const [source, mergeFn] of snapshot) {
		pendingMerges.set(source, mergeFn);
	}
	notifyPipelineListeners();
}

function clearDebounceTimers(): void {
	for (const timer of sourceDebounceTimers.values()) {
		clearTimeout(timer);
	}
	sourceDebounceTimers.clear();
	if (globalFlushTimer) {
		clearTimeout(globalFlushTimer);
		globalFlushTimer = null;
	}
}

async function runFlush(): Promise<DesktopShellStateSnapshot> {
	if (phase === 'conflict') {
		throw lastConflict ?? new desktopApi.DesktopShellStateConflictError();
	}

	if (inflightFlush) {
		return inflightFlush;
	}

	clearDebounceTimers();

	if (pendingMerges.size === 0) {
		setPhase('idle');
		const cached = desktopApi.peekDesktopShellStateCache();
		if (cached) return cached;
		return ensureShellStateHydrated();
	}

	const pendingSnapshot = snapshotPendingMerges();
	const sources = orderedPendingSources();
	setPhase('flushing');
	flushStartedAtMs = Date.now();

	inflightFlush = (async () => {
		const current = await ensureShellStateHydrated();
		const patch = buildPatchBody(current);

		if (Object.keys(patch).length === 0) {
			setPhase('idle');
			return current;
		}

		try {
			const next = await applyPatchWithBounded412Recovery(
				patch as desktopApi.DesktopShellStatePatch
			);
			for (const source of sources) {
				pendingMerges.delete(source);
			}
			lastConflict = null;
			setPhase('idle');
			notifyPipelineListeners();
			if (pendingMerges.size > 0) {
				scheduleGlobalFlush(DEFAULT_DEBOUNCE_MS);
			}
			return next;
		} catch (error) {
			restorePendingMerges(pendingSnapshot);
			if (desktopApi.isDesktopShellStateConflictError(error)) {
				lastConflict = error;
				setPhase('conflict');
			} else {
				flushFailureHook?.({ sources, patch, error });
				setPhase('debouncing');
			}
			throw error;
		}
	})().finally(() => {
		inflightFlush = null;
	});

	return inflightFlush;
}

function scheduleGlobalFlush(debounceMs: number): void {
	if (phase === 'conflict' || phase === 'recovering' || phase === 'flushing') {
		return;
	}

	if (pendingMerges.size === 0) {
		setPhase('idle');
		void ensureShellStateHydrated()
			.then((state) => settleWaiters(state))
			.catch((error) => rejectWaiters(error));
		return;
	}

	setPhase('debouncing');

	const execute = () => {
		globalFlushTimer = null;
		void runFlush()
			.then((state) => settleWaiters(state))
			.catch((error) => rejectWaiters(error));
	};

	if (debounceMs <= 0) {
		execute();
		return;
	}

	if (globalFlushTimer) {
		clearTimeout(globalFlushTimer);
	}
	globalFlushTimer = setTimeout(execute, debounceMs);
}

export function getShellStatePipelineSnapshot(): {
	phase: PipelinePhase;
	etag: string | null;
	pendingSources: ShellStateMutationSource[];
	lastConflict: desktopApi.DesktopShellStateConflictError | null;
} {
	return {
		phase,
		etag: readPipelineEtag(),
		pendingSources: orderedPendingSources(),
		lastConflict,
	};
}

export function subscribeShellStatePipeline(
	listener: (snapshot: ReturnType<typeof getShellStatePipelineSnapshot>) => void
): () => void {
	pipelineListeners.add(listener);
	listener(getShellStatePipelineSnapshot());
	return () => {
		pipelineListeners.delete(listener);
	};
}

export function setShellStatePipelineFlushFailureHook(
	hook: ShellStatePipelineFlushFailureHook | null
): void {
	flushFailureHook = hook;
}

export function scheduleShellStateMutation(options: {
	source: ShellStateMutationSource;
	merge: MergeFn;
	debounceMs?: number;
	immediate?: boolean;
}): void {
	pendingMerges.set(options.source, options.merge);
	notifyPipelineListeners();

	if (isOutboundPatchBlockedPhase(phase)) {
		return;
	}

	const debounceMs = options.immediate
		? 0
		: (options.debounceMs ?? DEFAULT_DEBOUNCE_MS);

	const existingTimer = sourceDebounceTimers.get(options.source);
	if (existingTimer) {
		clearTimeout(existingTimer);
	}

	setPhase('debouncing');

	if (debounceMs <= 0) {
		scheduleGlobalFlush(0);
		return;
	}

	const timer = setTimeout(() => {
		sourceDebounceTimers.delete(options.source);
		scheduleGlobalFlush(0);
	}, debounceMs);
	sourceDebounceTimers.set(options.source, timer);
}

/** Register a waiter for the next pipeline flush (coordinator / legacy Promise API). */
export function waitForShellStatePipelineFlush(): Promise<DesktopShellStateSnapshot> {
	return new Promise((resolve, reject) => {
		flushWaiters.push({ resolve, reject });
		if (pendingMerges.size === 0 && phase === 'idle' && !inflightFlush) {
			void ensureShellStateHydrated().then(resolve).catch(reject);
		}
	});
}

export async function flushShellStatePipelineNow(
	_source?: ShellStateMutationSource
): Promise<void> {
	clearDebounceTimers();

	if (phase === 'conflict') {
		throw lastConflict ?? new desktopApi.DesktopShellStateConflictError();
	}

	if (phase === 'recovering' || phase === 'flushing') {
		if (inflightFlush) {
			await inflightFlush;
		}
		return;
	}

	if (inflightFlush) {
		await inflightFlush;
		return;
	}

	if (pendingMerges.size === 0) {
		return;
	}

	await runFlush();
}

export async function reloadShellStateFromServer(): Promise<DesktopShellStateSnapshot> {
	return desktopApi.reloadDesktopShellStateForce();
}

export type ResolveShellStateConflictOptions = {
	/** Skip GET when caller already reloaded (manual recover / auto-recover). */
	skipReload?: boolean;
};

export async function resolveShellStateConflict(
	options?: ResolveShellStateConflictOptions
): Promise<void> {
	if (phase !== 'conflict') {
		return;
	}
	lastConflict = null;
	setPhase('recovering');
	try {
		if (!options?.skipReload) {
			await reloadShellStateFromServer();
		}
		setPhase(pendingMerges.size > 0 ? 'debouncing' : 'idle');
		await flushShellStatePipelineNow();
	} catch (error) {
		if (error instanceof desktopApi.DesktopShellStateConflictError) {
			lastConflict = error;
			setPhase('conflict');
		} else if (getShellStatePipelineSnapshot().phase === 'recovering') {
			setPhase('conflict');
		}
		throw error;
	}
}

export function flushShellStatePipelineOnPageHide(): void {
	clearDebounceTimers();

	if (getBrowserTabLeaderRole() !== 'leader') {
		return;
	}

	if (pendingMerges.size === 0) return;

	const current =
		desktopApi.peekDesktopShellStateCache() ??
		({} as DesktopShellStateSnapshot);
	const patch = buildPatchBody(current);
	if (Object.keys(patch).length === 0) return;

	pendingMerges.clear();
	notifyPipelineListeners();

	keepaliveFlushCount += 1;
	desktopApi.patchDesktopShellStateKeepalive(
		patch as desktopApi.DesktopShellStatePatch
	);
	setPhase('idle');
}

export function peekShellStatePipelinePendingPatchKeys(): string[] {
	const current =
		desktopApi.peekDesktopShellStateCache() ??
		({} as DesktopShellStateSnapshot);
	return Object.keys(buildPatchBody(current)).sort();
}

export function resetShellStatePipeline(): void {
	clearDebounceTimers();
	pendingMerges.clear();
	phase = 'idle';
	lastConflict = null;
	inflightFlush = null;
	flushStartedAtMs = null;
	lastFlushLatencyMs = null;
	failedFlushCount = 0;
	conflictFlushCount = 0;
	lastConflictAtMs = null;
	keepaliveFlushCount = 0;
	flushWaiters.length = 0;
	notifyPipelineListeners();
}

export function getShellStatePipelineTelemetry(): {
	pendingSources: ShellStateMutationSource[];
	inflight: boolean;
	lastFlushLatencyMs: number | null;
	failedFlushCount: number;
	conflictFlushCount: number;
	lastConflictAtMs: number | null;
	keepaliveFlushCount: number;
} {
	return {
		pendingSources: orderedPendingSources(),
		inflight: inflightFlush != null,
		lastFlushLatencyMs,
		failedFlushCount,
		conflictFlushCount,
		lastConflictAtMs,
		keepaliveFlushCount,
	};
}

export {
	scheduleShellStateMutation as scheduleCoalescedDesktopShellStateWrite,
};
