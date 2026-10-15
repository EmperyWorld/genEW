/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Centralize runtime action availability logic for Site Studio launch controls.
 * Keeps button states and disabled reasons deterministic across render paths.
 *
 * Invariants:
 * - Pending runtime transitions block all control actions.
 * - `start` is disabled when runtime is already running.
 * - `stop` is disabled when runtime is not running.
 * - `redeploy` is disabled until runtime reaches running state.
 *
 * Related:
 * - `features/site-studio/desktop/components/SiteStudioRuntimePanel.tsx`
 * - `pages/Kirs/kirsRuntimeGuards.ts`
 */

export type SiteStudioRuntimeDisableReason =
	| 'busy'
	| 'pending'
	| 'already_running'
	| 'already_stopped'
	| 'needs_running'
	| null;

export interface SiteStudioRuntimeActionState {
	disabled: boolean;
	reason: SiteStudioRuntimeDisableReason;
}

export interface SiteStudioRuntimeGuardState {
	isPending: boolean;
	isRunning: boolean;
	isPublished: boolean;
	provision: SiteStudioRuntimeActionState;
	start: SiteStudioRuntimeActionState;
	stop: SiteStudioRuntimeActionState;
	redeploy: SiteStudioRuntimeActionState;
	publishToggle: SiteStudioRuntimeActionState;
}

export interface ComputeSiteStudioRuntimeGuardsInput {
	instanceStatus: string | null | undefined;
	healthStatus: string | null | undefined;
	publicationState: string | null | undefined;
	busyKeys: Set<string>;
}

const SITE_STUDIO_PENDING_STATUSES = new Set([
	'provisioning',
	'starting',
	'redeploying',
	'stopping',
]);

const SITE_STUDIO_RUNNING_STATUSES = new Set(['running']);

function normalizeStatus(value: string | null | undefined): string {
	return String(value ?? '')
		.trim()
		.toLowerCase();
}

export function isSiteStudioPendingStatus(
	status: string | null | undefined
): boolean {
	return SITE_STUDIO_PENDING_STATUSES.has(normalizeStatus(status));
}

function isSiteStudioRunningStatus(status: string | null | undefined): boolean {
	return SITE_STUDIO_RUNNING_STATUSES.has(normalizeStatus(status));
}

function resolveActionState({
	busy,
	pending,
	reasonWhenReadyBlocked,
}: {
	busy: boolean;
	pending: boolean;
	reasonWhenReadyBlocked: Exclude<
		SiteStudioRuntimeDisableReason,
		'busy' | 'pending' | null
	> | null;
}): SiteStudioRuntimeActionState {
	if (busy) {
		return { disabled: true, reason: 'busy' };
	}
	if (pending) {
		return { disabled: true, reason: 'pending' };
	}
	if (reasonWhenReadyBlocked) {
		return { disabled: true, reason: reasonWhenReadyBlocked };
	}
	return { disabled: false, reason: null };
}

export function computeSiteStudioRuntimeGuards(
	input: ComputeSiteStudioRuntimeGuardsInput
): SiteStudioRuntimeGuardState {
	const instanceStatus = normalizeStatus(input.instanceStatus);
	const healthStatus = normalizeStatus(input.healthStatus);
	const isPending =
		isSiteStudioPendingStatus(instanceStatus) ||
		isSiteStudioPendingStatus(healthStatus);
	const isRunning =
		isSiteStudioRunningStatus(instanceStatus) ||
		isSiteStudioRunningStatus(healthStatus);
	const isPublished = normalizeStatus(input.publicationState) === 'open';
	const publishKey = isPublished ? 'unpublish' : 'publish';

	return {
		isPending,
		isRunning,
		isPublished,
		provision: resolveActionState({
			busy: input.busyKeys.has('provision'),
			pending: isPending,
			reasonWhenReadyBlocked: null,
		}),
		start: resolveActionState({
			busy: input.busyKeys.has('start'),
			pending: isPending,
			reasonWhenReadyBlocked: isRunning ? 'already_running' : null,
		}),
		stop: resolveActionState({
			busy: input.busyKeys.has('stop'),
			pending: isPending,
			reasonWhenReadyBlocked: isRunning ? null : 'already_stopped',
		}),
		redeploy: resolveActionState({
			busy: input.busyKeys.has('redeploy'),
			pending: isPending,
			reasonWhenReadyBlocked: isRunning ? null : 'needs_running',
		}),
		publishToggle: resolveActionState({
			busy: input.busyKeys.has(publishKey),
			pending: isPending,
			reasonWhenReadyBlocked: null,
		}),
	};
}
