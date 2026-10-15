/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Wave A1 orchestration cluster for DesktopWorkspaceContent: companion/assistant rail
 * plus shell_state canvas sync error merge and stale-conflict recovery.
 *
 * Invariants:
 * - Layout preset actions stay in useDesktopWorkspaceLayoutPresetActions (called before expansion).
 * - Companion snapshot always includeAllVirtualDesktops: true (via companion rail hook).
 *
 * Related:
 * - useDesktopWorkspaceCompanionAndAssistantRail.ts
 * - useDesktopWorkspaceLayoutPresetActions.ts
 * - DesktopWorkspaceContent.tsx
 */

import * as React from 'react';
import {
	clearDesktopShellStateCache,
	isDesktopShellStateConflictMessage,
} from '../services/desktopApi';
import { recoverDesktopShellStateFromPipelineConflict } from './useDesktopShellStatePipelineSync';
import {
	useDesktopWorkspaceCompanionAndAssistantRail,
	type UseDesktopWorkspaceCompanionAndAssistantRailParams,
} from './useDesktopWorkspaceCompanionAndAssistantRail';

export type UseDesktopWorkspaceShellCanvasSyncChipParams = {
	combinedDesktopPersistenceError: string | null | undefined;
	expansionError: string | null | undefined;
	staleShellStateConflict: boolean;
	refreshStorage: () => Promise<void>;
	expansionRefresh: () => Promise<void>;
	clearPersistPatchConflict: () => void;
};

/**
 * Shell sync chip merge + stale shell_state recover (must run before layout bridge).
 */
export function useDesktopWorkspaceShellCanvasSyncChip(
	params: UseDesktopWorkspaceShellCanvasSyncChipParams
): {
	canvasSyncPersistenceError: string | null | undefined;
	recoverStaleShellState: () => Promise<void>;
} {
	const canvasSyncPersistenceError = React.useMemo(() => {
		const shellErr = params.expansionError?.trim();
		if (
			params.staleShellStateConflict ||
			isDesktopShellStateConflictMessage(shellErr)
		) {
			return params.combinedDesktopPersistenceError;
		}
		if (!shellErr) return params.combinedDesktopPersistenceError;
		if (!params.combinedDesktopPersistenceError) return shellErr;
		return `${params.combinedDesktopPersistenceError} · ${shellErr}`;
	}, [
		params.combinedDesktopPersistenceError,
		params.expansionError,
		params.staleShellStateConflict,
	]);

	const recoverStaleShellState = React.useCallback(async () => {
		clearDesktopShellStateCache();
		await recoverDesktopShellStateFromPipelineConflict(async () => {
			await Promise.all([params.refreshStorage(), params.expansionRefresh()]);
			params.clearPersistPatchConflict();
		});
	}, [
		params.clearPersistPatchConflict,
		params.expansionRefresh,
		params.refreshStorage,
	]);

	return { canvasSyncPersistenceError, recoverStaleShellState };
}

/**
 * Companion rail entry used after expansion launch actions resolve openAssistantContextAction.
 */
export function useDesktopWorkspaceContentOrchestration(
	companionRail: UseDesktopWorkspaceCompanionAndAssistantRailParams
): ReturnType<typeof useDesktopWorkspaceCompanionAndAssistantRail> {
	return useDesktopWorkspaceCompanionAndAssistantRail(companionRail);
}
