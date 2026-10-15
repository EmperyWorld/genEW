/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Policy for numeric folder-count badges on desktop icons — suppress system library roots.
 *
 * Invariants:
 * - App unread badges are out of scope (separate `badgeCount` path).
 * - User-created folders keep merged nested + library counts.
 *
 * Related:
 * - utils/desktopFolderLibraryCounts.ts
 * - utils/desktopItemTree.ts
 * - hooks/useDesktopWorkspaceVisualProfileBridge.ts
 */

import { SYSTEM_FOLDER_ITEM } from '@/pages/ContentManager/sortToSystemFolders';
import type { DesktopItem } from '../types/desktop.types';
import { isDesktopSystemFolder } from './desktopItemTree';

/** Stable system folder ids that never show a numeric count on the desktop icon. */
export const DESKTOP_SYSTEM_FOLDER_IDS_WITHOUT_COUNT_BADGE: ReadonlySet<string> =
	new Set<string>([...Object.values(SYSTEM_FOLDER_ITEM), 'trash']);

export function shouldShowDesktopFolderCountBadge(
	item: Pick<DesktopItem, 'id' | 'type' | 'isSystem'>
): boolean {
	if (item.type !== 'folder') return false;
	if (DESKTOP_SYSTEM_FOLDER_IDS_WITHOUT_COUNT_BADGE.has(item.id)) {
		return false;
	}
	if (isDesktopSystemFolder(item as DesktopItem)) return false;
	return true;
}

/**
 * Drop system-folder entries from merged icon badge counts (nested + library).
 * Unknown folder ids that match the system id set are also suppressed.
 */
export function filterFolderIconBadgeCountsForDesktop(
	counts: Record<string, number>,
	folderItems: readonly Pick<DesktopItem, 'id' | 'type' | 'isSystem'>[]
): Record<string, number> {
	const suppress = new Set<string>(DESKTOP_SYSTEM_FOLDER_IDS_WITHOUT_COUNT_BADGE);
	for (const item of folderItems) {
		if (!shouldShowDesktopFolderCountBadge(item)) {
			suppress.add(item.id);
		}
	}
	const out: Record<string, number> = {};
	for (const [folderId, count] of Object.entries(counts)) {
		if (count <= 0) continue;
		if (suppress.has(folderId)) continue;
		out[folderId] = count;
	}
	return out;
}
