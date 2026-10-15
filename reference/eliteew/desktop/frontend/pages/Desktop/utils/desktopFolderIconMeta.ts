/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Map desktop item meta.folder_icon between API payloads and DesktopItem.folderIconId.
 *
 * Invariants:
 * - folder_icon ids must pass isUserFolderIconId before persisting from the client.
 *
 * Related:
 * - services/desktopApi.ts (toApiItem / fromApiItem)
 * - constants/folderIcons.ts
 */

import {
	DEFAULT_USER_FOLDER_ICON_ID,
	isUserFolderIconId,
	type UserFolderIconId,
} from '../constants/folderIcons';
import type { DesktopItem } from '../types/desktop.types';

export const DESKTOP_FOLDER_ICON_META_KEY = 'folder_icon';

export function readFolderIconIdFromMeta(
	meta: Record<string, unknown> | undefined | null
): UserFolderIconId | undefined {
	const raw = meta?.[DESKTOP_FOLDER_ICON_META_KEY];
	if (typeof raw !== 'string' || !isUserFolderIconId(raw)) return undefined;
	return raw;
}

export function buildDesktopItemMetaForApi(
	item: DesktopItem
): Record<string, unknown> | null {
	const base = { ...(item.meta ?? {}) };
	if (
		item.type === 'folder' &&
		item.folderIconId &&
		isUserFolderIconId(item.folderIconId)
	) {
		base[DESKTOP_FOLDER_ICON_META_KEY] = item.folderIconId;
	} else {
		delete base[DESKTOP_FOLDER_ICON_META_KEY];
	}
	return Object.keys(base).length > 0 ? base : null;
}

export function withFolderIconOnItem(
	item: DesktopItem,
	folderIconId: UserFolderIconId
): DesktopItem {
	return {
		...item,
		folderIconId,
		meta: {
			...(item.meta ?? {}),
			[DESKTOP_FOLDER_ICON_META_KEY]: folderIconId,
		},
	};
}

export function defaultCreateFolderIconId(): UserFolderIconId {
	return DEFAULT_USER_FOLDER_ICON_ID;
}
