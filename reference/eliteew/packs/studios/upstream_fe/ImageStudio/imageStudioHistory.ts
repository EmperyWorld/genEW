/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Fetch Image Studio history from unified content (owner-only, source_service filter).
 *
 * Invariants:
 * - Lists only `source_service=image_studio` for the current user.
 *
 * Related:
 * - documentation/product/IMAGE-STUDIO.md
 * - services/contentApi
 */

import { api } from '@/services/api/client';
import { normalizeContentListResponse } from '@/services/contentApi';
import type { ImageStudioHistoryItem } from './workspaces/types';
import type { HistoryFilterTag } from './workspaces/constants';

export async function fetchImageStudioHistory(
	refreshKey = 0
): Promise<ImageStudioHistoryItem[]> {
	const params = new URLSearchParams({
		source_service: 'image_studio',
		sort_field: 'date',
		sort_order: 'desc',
		limit: '50',
		owner_only: 'true',
	});
	params.set('_', String(refreshKey));
	const payload = await api.get<unknown>(
		`/api/v1/content?${params.toString()}`,
		{
			baseURL: '',
		}
	);
	const { items } = normalizeContentListResponse(payload);
	return items.map((c) => ({
		id: c.id,
		name: c.name,
		created_at: c.created_at,
		content_type: c.content_type,
		tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
	}));
}

export function filterHistoryByTag(
	items: ImageStudioHistoryItem[],
	filter: HistoryFilterTag
): ImageStudioHistoryItem[] {
	if (filter === 'all') return items;
	return items.filter((item) => (item.tags ?? []).includes(filter));
}

export async function fetchContentBlob(id: string): Promise<Blob> {
	const blob = await api.get(`/api/v1/content/${id}/download`, {
		baseURL: '',
		responseType: 'blob',
	});
	return blob as unknown as Blob;
}
