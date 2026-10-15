/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Subscribe to the canonical shell_state mutation pipeline for workspace sync UI:
 * conflict detection, phase-aware sync chip, and user-triggered conflict recovery.
 *
 * Invariants:
 * - `staleShellStateConflict` is true only when pipeline phase is `conflict` and `lastConflict` is set.
 * - Recovery reloads server shell_state then delegates resume/flush to `resolveShellStateConflict()`.
 *
 * Related:
 * - `utils/desktopShellStateMutationPipeline.ts`, `DesktopSyncStatus.tsx`
 * - `DesktopWorkspaceContent.tsx`, `useDesktopStaleShellStateAutoRecover.ts`
 */

import * as React from 'react';
import { useSyncExternalStore } from 'react';
import {
	getShellStatePipelineSnapshot,
	reloadShellStateFromServer,
	resolveShellStateConflict,
	subscribeShellStatePipeline,
} from '../utils/desktopShellStateMutationPipeline';

export type ShellStatePipelineSnapshot = ReturnType<
	typeof getShellStatePipelineSnapshot
>;

export type ShellStatePipelinePhase = ShellStatePipelineSnapshot['phase'];

let cachedPipelineSnapshot = getShellStatePipelineSnapshot();

function pipelineSnapshotsEqual(
	a: ShellStatePipelineSnapshot,
	b: ShellStatePipelineSnapshot
): boolean {
	return (
		a.phase === b.phase &&
		a.etag === b.etag &&
		a.lastConflict === b.lastConflict &&
		a.pendingSources.length === b.pendingSources.length &&
		a.pendingSources.every(
			(source, index) => source === b.pendingSources[index]
		)
	);
}

function getStableShellStatePipelineSnapshot(): ShellStatePipelineSnapshot {
	const next = getShellStatePipelineSnapshot();
	if (pipelineSnapshotsEqual(cachedPipelineSnapshot, next)) {
		return cachedPipelineSnapshot;
	}
	cachedPipelineSnapshot = next;
	return cachedPipelineSnapshot;
}

function subscribeStableShellStatePipeline(listener: () => void): () => void {
	return subscribeShellStatePipeline(() => {
		getStableShellStatePipelineSnapshot();
		listener();
	});
}

/** Test-only: reset cached pipeline snapshot after `resetShellStatePipeline()`. */
export function resetShellStatePipelineSyncCacheForTests(): void {
	cachedPipelineSnapshot = getShellStatePipelineSnapshot();
}

export function useDesktopShellStatePipelineSync(): {
	snapshot: ShellStatePipelineSnapshot;
	phase: ShellStatePipelinePhase;
	staleShellStateConflict: boolean;
	conflictSignature: string | null;
} {
	const snapshot = useSyncExternalStore(
		subscribeStableShellStatePipeline,
		getStableShellStatePipelineSnapshot,
		getStableShellStatePipelineSnapshot
	);

	const staleShellStateConflict =
		snapshot.phase === 'conflict' && snapshot.lastConflict != null;

	const conflictSignature = React.useMemo(() => {
		if (!staleShellStateConflict || !snapshot.lastConflict) return null;
		return (
			snapshot.lastConflict.currentEtag ??
			snapshot.lastConflict.message ??
			'conflict'
		);
	}, [snapshot.lastConflict, staleShellStateConflict]);

	return {
		snapshot,
		phase: snapshot.phase,
		staleShellStateConflict,
		conflictSignature,
	};
}

/** User «Обновить» / Retry: reload server shell_state then resume the pipeline. */
export async function recoverDesktopShellStateFromPipelineConflict(
	afterReload?: () => void | Promise<void>
): Promise<void> {
	await reloadShellStateFromServer();
	await afterReload?.();
	await resolveShellStateConflict({ skipReload: true });
}
