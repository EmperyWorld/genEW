/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Keeps unified content company/project/folder scope aligned when desktop file shortcuts
 * move between root, user folders, and project folders (`eliteew-proj-*`).
 *
 * Invariants:
 * - Only `type === 'file'` desktop items use unified content ids.
 * - Project folders inherit via API merge on `folder_item_id`; regular folders clear project/company.
 *
 * Related:
 * - pages/ContentManager/projectDesktopFolder.ts
 * - services/contentApi.ts
 * - hooks/useDesktopStorage.ts
 */

import { isProjectDesktopFolderItemId } from '@/pages/ContentManager/projectDesktopFolder';
import { contentApi } from '@/services/contentApi';
import type { DesktopItem } from '../types/desktop.types';

export type ContentFolderScopePatch = {
	folder_item_id: string | null;
	project_id?: null;
	company_id?: null;
};

export function buildContentFolderScopePatch(
	parentFolderId: string | undefined | null
): ContentFolderScopePatch {
	const parentKey = parentFolderId?.trim() || null;
	if (!parentKey) {
		return {
			folder_item_id: null,
			project_id: null,
			company_id: null,
		};
	}
	if (isProjectDesktopFolderItemId(parentKey)) {
		return { folder_item_id: parentKey };
	}
	return {
		folder_item_id: parentKey,
		project_id: null,
		company_id: null,
	};
}

export function collectDesktopFileParentScopeChanges(
	prev: DesktopItem[],
	next: DesktopItem[]
): Array<{ contentId: string; parentId: string | undefined }> {
	const prevById = new Map(prev.map((item) => [item.id, item]));
	const changes: Array<{ contentId: string; parentId: string | undefined }> =
		[];

	for (const item of next) {
		if (item.type !== 'file') continue;
		const before = prevById.get(item.id);
		if (!before) continue;

		const prevParent = before.parentId ?? undefined;
		const nextParent = item.parentId ?? undefined;
		if (prevParent === nextParent) continue;

		changes.push({ contentId: item.id, parentId: nextParent });
	}

	return changes;
}

export async function syncDesktopFileContentFolderScopes(
	changes: Array<{ contentId: string; parentId: string | undefined }>
): Promise<{ ok: number; fail: number }> {
	if (changes.length === 0) {
		return { ok: 0, fail: 0 };
	}

	let ok = 0;
	let fail = 0;
	for (const { contentId, parentId } of changes) {
		try {
			await contentApi.updateContent(
				contentId,
				buildContentFolderScopePatch(parentId)
			);
			ok += 1;
		} catch {
			fail += 1;
		}
	}
	return { ok, fail };
}
