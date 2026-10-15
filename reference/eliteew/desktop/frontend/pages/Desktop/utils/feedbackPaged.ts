/**
 * Guards for GET /product-desktop/.../feedback/tickets responses.
 * Supports current shape `{ items, total }` and legacy cached pages that were a plain array.
 */
import type {
	FeedbackTicket,
	FeedbackTicketAdmin,
} from '../services/productDesktopApi';

function listTotalOk(v: unknown): boolean {
	if (typeof v === 'number' && Number.isFinite(v)) return true;
	if (typeof v === 'string' && Number.isFinite(Number.parseInt(v, 10)))
		return true;
	return false;
}

/** Safe total for pagination (handles string / missing total). */
export function feedbackListPageTotal(p: {
	items: unknown[];
	total?: unknown;
}): number {
	if (typeof p.total === 'number' && Number.isFinite(p.total)) return p.total;
	if (typeof p.total === 'string') {
		const n = Number.parseInt(p.total, 10);
		if (Number.isFinite(n)) return n;
	}
	return Array.isArray(p.items) ? p.items.length : 0;
}

export function isFeedbackListPage(
	p: unknown
): p is { items: FeedbackTicket[]; total: number } {
	if (p === null || typeof p !== 'object') return false;
	const o = p as Record<string, unknown>;
	if (!Array.isArray(o.items)) return false;
	// Accept numeric string total; allow items-only if API omitted total (flatten still works)
	return listTotalOk(o.total) || o.items.length > 0;
}

export function isFeedbackAdminListPage(
	p: unknown
): p is { items: FeedbackTicketAdmin[]; total: number } {
	if (p === null || typeof p !== 'object') return false;
	const o = p as Record<string, unknown>;
	if (!Array.isArray(o.items)) return false;
	return listTotalOk(o.total) || o.items.length > 0;
}

export function flattenUserFeedbackPages(
	pages: unknown[] | undefined
): FeedbackTicket[] {
	if (!pages?.length) return [];
	return pages.flatMap((p) => {
		if (isFeedbackListPage(p)) return p.items;
		if (Array.isArray(p)) return p as FeedbackTicket[];
		return [];
	});
}

export function flattenAdminFeedbackPages(
	pages: unknown[] | undefined
): FeedbackTicketAdmin[] {
	if (!pages?.length) return [];
	return pages.flatMap((p) => {
		if (isFeedbackAdminListPage(p)) return p.items;
		if (Array.isArray(p)) return p as FeedbackTicketAdmin[];
		return [];
	});
}
