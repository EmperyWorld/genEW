/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Submit eligibility helpers for Feedback Hub form.
 *
 * Invariants:
 * - Block reasons are mutually exclusive and evaluated in fixed priority order.
 *
 * Related:
 * - src/pages/Desktop/components/FeedbackHubApp.tsx
 */

export type FeedbackSubmitBlockReason =
	| 'pending'
	| 'quota_wish'
	| 'quota_bug'
	| 'over_limit'
	| 'empty'
	| null;

export function getFeedbackSubmitBlockReason(input: {
	bodyTrimmed: string;
	overLimit: boolean;
	kindQuotaBlocked: boolean;
	kind: 'wish' | 'bug';
	pending: boolean;
}): FeedbackSubmitBlockReason {
	if (input.pending) return 'pending';
	if (input.kindQuotaBlocked) {
		return input.kind === 'wish' ? 'quota_wish' : 'quota_bug';
	}
	if (input.overLimit) return 'over_limit';
	if (!input.bodyTrimmed) return 'empty';
	return null;
}

export function canSubmitFeedback(reason: FeedbackSubmitBlockReason): boolean {
	return reason === null;
}

export function isFeedbackQuotaNearLimit(
	activeCount: number,
	limit: number
): boolean {
	return limit > 0 && activeCount === limit - 1;
}

export function formatFeedbackRewardCredits(value: number): string {
	const rounded = Math.round(value * 100) / 100;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function hasVisibleFeedbackReward(
	rewardCredits: number | null | undefined
): rewardCredits is number {
	return typeof rewardCredits === 'number' && rewardCredits > 0;
}
