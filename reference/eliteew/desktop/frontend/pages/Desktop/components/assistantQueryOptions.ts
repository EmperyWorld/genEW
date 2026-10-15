/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared TanStack Query v5 options for Assistant FAQ and chat message history.
 *
 * Related:
 * - AssistantApp.tsx, productDesktopApi.ts
 */

import { queryOptions } from '@tanstack/react-query';
import {
	fetchAssistantFaq,
	listAssistantMessages,
} from '../services/productDesktopApi';

export const ASSISTANT_QUERY_ROOT = ['product-desktop', 'assistant'] as const;
export const ASSISTANT_MESSAGES_DEFAULT_LIMIT = 100;

export function assistantFaqQueryOptions() {
	return queryOptions({
		queryKey: [...ASSISTANT_QUERY_ROOT, 'faq'] as const,
		queryFn: fetchAssistantFaq,
	});
}

export function assistantFaqQueryKey() {
	return assistantFaqQueryOptions().queryKey;
}

export function assistantMessagesQueryOptions(
	limit = ASSISTANT_MESSAGES_DEFAULT_LIMIT
) {
	return queryOptions({
		queryKey: [...ASSISTANT_QUERY_ROOT, 'messages'] as const,
		queryFn: () => listAssistantMessages(limit),
	});
}

export function assistantMessagesQueryKey() {
	return assistantMessagesQueryOptions().queryKey;
}
