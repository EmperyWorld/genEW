/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Client-side filter and sort helpers for Feedback Hub ticket list.
 *
 * Invariants:
 * - Search matches ticket id, body, team reply (`admin_notes`) and optional label haystack case-insensitively.
 * - Sort is stable via original array order when timestamps tie.
 *
 * Related:
 * - src/pages/Desktop/components/FeedbackHubApp.tsx
 */

import type { FeedbackTicket } from '../services/productDesktopApi';
import { FEEDBACK_STATUSES } from './feedbackLabels';

export type FeedbackKindFilter = 'all' | 'wish' | 'bug';
export type FeedbackStatusFilter = 'all' | (typeof FEEDBACK_STATUSES)[number];

export function ticketMatchesFeedbackSearchQuery(
	ticket: FeedbackTicket,
	query: string,
	searchHaystack?: readonly string[]
): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	if (ticket.id.toLowerCase().includes(q)) return true;
	if (ticket.body.toLowerCase().includes(q)) return true;
	if ((ticket.admin_notes ?? '').toLowerCase().includes(q)) return true;
	if (searchHaystack?.some((part) => part.toLowerCase().includes(q))) {
		return true;
	}
	return false;
}

export function filterAndSortFeedbackTickets(
	tickets: FeedbackTicket[],
	opts: {
		kindFilter: FeedbackKindFilter;
		statusFilter: FeedbackStatusFilter;
		query: string;
		newestFirst: boolean;
		searchHaystackForTicket?: (ticket: FeedbackTicket) => readonly string[];
	}
): FeedbackTicket[] {
	const q = opts.query.trim().toLowerCase();
	const withIndex = tickets.map((ticket, index) => ({ ticket, index }));
	const filtered = withIndex.filter(({ ticket }) => {
		if (opts.kindFilter !== 'all' && ticket.kind !== opts.kindFilter) {
			return false;
		}
		if (opts.statusFilter !== 'all' && ticket.status !== opts.statusFilter) {
			return false;
		}
		return ticketMatchesFeedbackSearchQuery(
			ticket,
			q,
			opts.searchHaystackForTicket?.(ticket)
		);
	});
	filtered.sort((a, b) => {
		const da = new Date(a.ticket.created_at).getTime();
		const db = new Date(b.ticket.created_at).getTime();
		if (da !== db) {
			return opts.newestFirst ? db - da : da - db;
		}
		return a.index - b.index;
	});
	return filtered.map(({ ticket }) => ticket);
}
