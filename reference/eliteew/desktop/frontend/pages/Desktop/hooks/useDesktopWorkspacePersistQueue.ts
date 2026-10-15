/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop persist-queue bridge for config and shell_state retry patches via the
 * unified shell-state mutation pipeline.
 *
 * Invariants:
 * - Queue is scoped by auth subject; no flush is attempted while offline or anonymous.
 * - Shell patch flush routes through `scheduleShellStateMutation` (source persist).
 * - Auto-flush runs once per online subject session, not on every parent re-render.
 * - Persist conflict UI derives from pipeline snapshot, not local pause flags.
 *
 * Related:
 * - utils/desktopPersistPatchQueue.ts
 * - utils/desktopShellStateMutationPipeline.ts
 */

import * as React from 'react';
import { useSyncExternalStore } from 'react';
import { isDesktopShellStateConflictMessage } from '../services/desktopApi';
import type { CoalescedDesktopShellStatePatch } from '../types/desktopShellStatePatch.types';
import {
	flushDesktopPersistPatchQueue,
	getDesktopPersistPatchQueueCounts,
	subscribeDesktopPersistPatchQueue,
} from '../utils/desktopPersistPatchQueue';
import {
	flushShellStatePipelineNow,
	getShellStatePipelineSnapshot,
	resolveShellStateConflict,
	scheduleShellStateMutation,
	subscribeShellStatePipeline,
} from '../utils/desktopShellStateMutationPipeline';

function getPersistPipelineConflict(): boolean {
	const snapshot = getShellStatePipelineSnapshot();
	return (
		snapshot.phase === 'conflict' && snapshot.pendingSources.includes('persist')
	);
}

export function useDesktopWorkspacePersistQueue(params: {
	persistSubjectKey: string | null;
	isOnline: boolean;
	applyPersistedConfigPatch: (
		payload: Record<string, unknown>
	) => Promise<void>;
	refreshExpansionSettings: (() => Promise<void>) | null;
}) {
	const {
		persistSubjectKey,
		isOnline,
		applyPersistedConfigPatch,
		refreshExpansionSettings,
	} = params;
	const [persistPatchFlushFailed, setPersistPatchFlushFailed] = React.useState<
		string | null
	>(null);
	const [persistQueueFlushing, setPersistQueueFlushing] = React.useState(false);

	const applyPersistedConfigPatchRef = React.useRef(applyPersistedConfigPatch);
	applyPersistedConfigPatchRef.current = applyPersistedConfigPatch;
	const refreshExpansionSettingsRef = React.useRef(refreshExpansionSettings);
	refreshExpansionSettingsRef.current = refreshExpansionSettings;

	const persistPatchConflict = useSyncExternalStore(
		(onStoreChange) =>
			subscribeShellStatePipeline(() => {
				onStoreChange();
			}),
		getPersistPipelineConflict,
		() => false
	);

	const persistPatchStats = useSyncExternalStore(
		subscribeDesktopPersistPatchQueue,
		() => getDesktopPersistPatchQueueCounts(persistSubjectKey),
		() => getDesktopPersistPatchQueueCounts(null)
	);

	const flushPersistPatches = React.useCallback(async (): Promise<boolean> => {
		if (!persistSubjectKey || !isOnline) return false;
		setPersistQueueFlushing(true);
		try {
			const { ok, error } = await flushDesktopPersistPatchQueue({
				subject: persistSubjectKey,
				patchConfig: (payload) => applyPersistedConfigPatchRef.current(payload),
				patchShell: async (payload) => {
					scheduleShellStateMutation({
						source: 'persist',
						merge: () => payload as CoalescedDesktopShellStatePatch,
						immediate: true,
					});
					await flushShellStatePipelineNow('persist');
					await refreshExpansionSettingsRef.current?.();
				},
			});
			if (ok) {
				setPersistPatchFlushFailed(null);
			} else if (
				error &&
				!getPersistPipelineConflict() &&
				!isDesktopShellStateConflictMessage(error)
			) {
				setPersistPatchFlushFailed(error);
			}
			return ok;
		} finally {
			setPersistQueueFlushing(false);
		}
	}, [isOnline, persistSubjectKey]);

	const flushPersistPatchesRef = React.useRef(flushPersistPatches);
	flushPersistPatchesRef.current = flushPersistPatches;

	const autoFlushedSubjectRef = React.useRef<string | null>(null);

	const clearPersistPatchConflict = React.useCallback(() => {
		setPersistPatchFlushFailed(null);
		void resolveShellStateConflict()
			.catch(() => undefined)
			.finally(() => {
				void flushPersistPatchesRef.current();
			});
	}, []);

	React.useEffect(() => {
		if (!isOnline) {
			autoFlushedSubjectRef.current = null;
			return;
		}
		if (!persistSubjectKey || getPersistPipelineConflict()) return;
		if (autoFlushedSubjectRef.current === persistSubjectKey) return;
		autoFlushedSubjectRef.current = persistSubjectKey;
		void flushPersistPatchesRef.current();
	}, [isOnline, persistSubjectKey]);

	return {
		persistPatchStats,
		persistPatchFlushFailed,
		persistPatchConflict,
		persistQueueFlushing,
		flushPersistPatches,
		clearPersistPatchConflict,
	};
}
