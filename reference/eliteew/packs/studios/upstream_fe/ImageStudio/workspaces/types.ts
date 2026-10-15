/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared Image Studio result and history item types for workspaces and page orchestration.
 *
 * Invariants:
 * - Result `data` is raw base64 (no data: URL prefix).
 *
 * Related:
 * - documentation/product/IMAGE-STUDIO.md
 */

import type { HistoryFilterTag } from './constants';

export interface ImageStudioResult {
	data: string;
	filename: string;
}

export interface ImageStudioApiResponse {
	images: ImageStudioResult[];
	content_id?: string;
	name?: string;
	history_saved?: boolean;
	history_error?: string;
}

export interface ImageStudioHistoryItem {
	id: string;
	name?: string;
	created_at?: string;
	content_type?: string;
	tags?: string[];
}

export type ImageStudioTab =
	| 'text-to-image'
	| 'image-edit'
	| 'rotate-image'
	| 'history';

export type { HistoryFilterTag };
