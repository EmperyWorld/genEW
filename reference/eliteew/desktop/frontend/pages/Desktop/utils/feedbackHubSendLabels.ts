/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * i18n key mapping for Feedback Hub send button aria-label by block reason.
 *
 * Related:
 * - src/pages/Desktop/components/FeedbackHubApp.tsx
 * - src/pages/Desktop/utils/feedbackHubSubmitGate.ts
 */

import type { FeedbackSubmitBlockReason } from './feedbackHubSubmitGate';

const FEEDBACK_SEND_ARIA_KEYS = {
	pending: 'sendingAria',
	quota_wish: 'sendDisabledQuotaWishAria',
	quota_bug: 'sendDisabledQuotaBugAria',
	over_limit: 'sendDisabledOverLimitAria',
	empty: 'sendDisabledEmptyAria',
	default: 'sendAria',
} as const;

export function feedbackSendAriaI18nKey(
	reason: FeedbackSubmitBlockReason
): (typeof FEEDBACK_SEND_ARIA_KEYS)[keyof typeof FEEDBACK_SEND_ARIA_KEYS] {
	if (reason === null) return FEEDBACK_SEND_ARIA_KEYS.default;
	return FEEDBACK_SEND_ARIA_KEYS[reason];
}
