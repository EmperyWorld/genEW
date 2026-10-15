/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure client-side EWRP job UX rules: polling stop, form lock, history row actions.
 *
 * Invariants:
 * - Terminal statuses match backend `completed` / `failed`; stale retry uses `ewrpRetryEligibility`.
 * - Slide regen HTTP guard matches `POST .../regenerate-*` (terminal only).
 *
 * Related:
 * - `EWRPGeneratorMain.tsx`, `EwrpSlideEditorPanel.tsx`, `EwrpHistoryRow`, `ewrpRetryEligibility.ts`
 */

import { ewrpJobCanRetry } from './ewrpRetryEligibility';

/** Stop GET /status polling when the job reached a terminal state. */
export function ewrpShouldStopStatusPolling(
	status: string | null | undefined
): boolean {
	const s = (status || '').toLowerCase();
	return s === 'completed' || s === 'failed';
}

/** Create form is locked while an active (non-terminal) job is selected. */
export function ewrpFormLockedFromJob(
	jobId: string | null,
	status: string | null | undefined
): boolean {
	if (!jobId) return false;
	return !ewrpShouldStopStatusPolling(status);
}

export type EwrpHistoryRowCapabilities = {
	canRetry: boolean;
	canDuplicate: boolean;
};

export function ewrpHistoryRowCapabilities(
	status: string,
	updatedAt?: string | null,
	nowMs: number = Date.now()
): EwrpHistoryRowCapabilities {
	return {
		canRetry: ewrpJobCanRetry(status, updatedAt, nowMs),
		canDuplicate: status === 'completed' || status === 'failed',
	};
}

/** Slide editor / UGS regen HTTP allowed only when job is terminal (matches API). */
export function ewrpSlideRegenAllowed(
	status: string | null | undefined
): boolean {
	return ewrpShouldStopStatusPolling(status);
}

/** Editor stays open while post-save/regen pipeline runs (matches API status transitions). */
export function ewrpSlideRebuildInProgress(
	status: string | null | undefined
): boolean {
	const s = (status || '').toLowerCase();
	return (
		s === 'generating_content' ||
		s === 'generating_images' ||
		s === 'building_pdf'
	);
}

/** Disable per-slide UGS buttons while job is not ready or rebuild is running. */
export function ewrpSlideEditorJobBusy(
	status: string | null | undefined
): boolean {
	const s = (status || '').toLowerCase();
	return (
		s === 'queued' ||
		s === 'generating_content' ||
		s === 'generating_images' ||
		s === 'building_pdf'
	);
}
