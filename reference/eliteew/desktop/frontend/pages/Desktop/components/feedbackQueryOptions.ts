/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared TanStack Query v5 options for Feedback Hub summary and paged ticket history.
 *
 * Related:
 * - FeedbackHubApp.tsx, productDesktopApi.ts
 */

import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
	fetchFeedbackSummary,
	listMyFeedbackTickets,
} from '../services/productDesktopApi';
import {
	feedbackListPageTotal,
	isFeedbackListPage,
} from '../utils/feedbackPaged';

export type FeedbackKindFilter = 'all' | 'wish' | 'bug';

export const FEEDBACK_QUERY_ROOT = ['product-desktop', 'feedback'] as const;
export const FEEDBACK_PAGE_SIZE = 50;
export const FEEDBACK_SUMMARY_STALE_MS = 30_000;
export const FEEDBACK_LIST_STALE_MS = 20_000;
export const FEEDBACK_QUERY_GC_MS = 5 * 60 * 1000;

export function feedbackSummaryQueryOptions() {
	return queryOptions({
		queryKey: [...FEEDBACK_QUERY_ROOT, 'summary'] as const,
		queryFn: fetchFeedbackSummary,
		staleTime: FEEDBACK_SUMMARY_STALE_MS,
		gcTime: FEEDBACK_QUERY_GC_MS,
		refetchOnWindowFocus: false,
	});
}

export function feedbackSummaryQueryKey() {
	return feedbackSummaryQueryOptions().queryKey;
}

export function feedbackTicketsPagedQueryKey(kindFilter: FeedbackKindFilter) {
	return [...FEEDBACK_QUERY_ROOT, 'mine', 'paged', 'v3', kindFilter] as const;
}

export function feedbackTicketsPagedInfiniteQueryOptions(
	kindFilter: FeedbackKindFilter
) {
	return infiniteQueryOptions({
		queryKey: feedbackTicketsPagedQueryKey(kindFilter),
		queryFn: ({ pageParam }) =>
			listMyFeedbackTickets({
				limit: FEEDBACK_PAGE_SIZE,
				offset: pageParam,
				...(kindFilter !== 'all' ? { kind: kindFilter } : {}),
			}),
		staleTime: FEEDBACK_LIST_STALE_MS,
		gcTime: FEEDBACK_QUERY_GC_MS,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		initialPageParam: 0,
		getNextPageParam: (lastPage, _pages, lastPageParam) => {
			if (!isFeedbackListPage(lastPage)) return undefined;
			const { items } = lastPage;
			if (items.length === 0) return undefined;
			const total = feedbackListPageTotal(lastPage);
			const next = lastPageParam + items.length;
			return next < total ? next : undefined;
		},
	});
}
