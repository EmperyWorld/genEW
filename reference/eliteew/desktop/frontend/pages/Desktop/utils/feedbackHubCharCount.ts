/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Character count helpers for Feedback Hub submit body preview.
 *
 * Related:
 * - src/pages/Desktop/utils/feedbackHubConstants.ts
 */

export const FEEDBACK_BODY_NEAR_LIMIT_RATIO = 0.9;

export function isFeedbackBodyOverLimit(length: number, max: number): boolean {
	return length > max;
}

export function isFeedbackBodyNearLimit(length: number, max: number): boolean {
	return (
		length > max * FEEDBACK_BODY_NEAR_LIMIT_RATIO &&
		!isFeedbackBodyOverLimit(length, max)
	);
}
