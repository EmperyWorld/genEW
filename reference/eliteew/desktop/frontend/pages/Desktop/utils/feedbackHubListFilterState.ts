/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Default state and activity helpers for Feedback Hub list filters.
 *
 * Related:
 * - src/pages/Desktop/components/FeedbackHubApp.tsx
 */

import type {
	FeedbackKindFilter,
	FeedbackStatusFilter,
} from './feedbackHubTicketFilters';

export type FeedbackListFilterState = {
	kindFilter: FeedbackKindFilter;
	statusFilter: FeedbackStatusFilter;
	listQueryText: string;
	newestFirst: boolean;
};

export const DEFAULT_FEEDBACK_LIST_FILTER_STATE: FeedbackListFilterState = {
	kindFilter: 'all',
	statusFilter: 'all',
	listQueryText: '',
	newestFirst: true,
};

export function isFeedbackListFiltersActive(
	state: FeedbackListFilterState
): boolean {
	return (
		state.listQueryText.trim().length > 0 ||
		state.kindFilter !== DEFAULT_FEEDBACK_LIST_FILTER_STATE.kindFilter ||
		state.statusFilter !== DEFAULT_FEEDBACK_LIST_FILTER_STATE.statusFilter ||
		state.newestFirst !== DEFAULT_FEEDBACK_LIST_FILTER_STATE.newestFirst
	);
}
