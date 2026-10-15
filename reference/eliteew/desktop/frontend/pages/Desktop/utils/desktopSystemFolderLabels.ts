/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Display-layer labels for system desktop folders — locale via i18n, API ``name`` stays canonical.
 * Shared by desktop icons, folder-window rails/titles, Content Manager explorer/filters.
 *
 * Invariants:
 * - Does not mutate or PATCH ``item.name`` when locale changes.
 * - Unknown / user folders fall back to stored ``item.name``.
 * - Seed-name match mirrors API ``SYSTEM_FOLDER_NAMES`` (bootstrap) for path segments without ids.
 *
 * Related:
 * - desktopUi.systemFolders.*
 * - utils/desktopItemTree.ts
 * - utils/desktopWindowDisplayTitle.ts
 * - components/DesktopIcon.tsx
 * - pages/ContentManager (explorer tree / bulk move / group titles)
 * - EliteEW/api/routers/desktop_bootstrap.py SYSTEM_FOLDER_NAMES
 */

import type { TFunction } from 'i18next';
import { SYSTEM_FOLDER_ITEM } from '@/pages/ContentManager/sortToSystemFolders';
import type { DesktopItem } from '../types/desktop.types';

export type DesktopSystemFolderLabelId =
	| (typeof SYSTEM_FOLDER_ITEM)[keyof typeof SYSTEM_FOLDER_ITEM]
	| 'trash';

/** FE DesktopItem or API DesktopItemResponse-shaped folder fields. */
export type DesktopFolderLabelSource = {
	id?: string | null;
	item_id?: string | null;
	name: string;
	type?: string | null;
	item_type?: string | null;
	systemKey?: string | null;
	system_key?: string | null;
	isSystem?: boolean | null;
	is_system?: boolean | null;
};

const SYSTEM_FOLDER_LABEL_IDS = new Set<string>([
	...Object.values(SYSTEM_FOLDER_ITEM),
	'trash',
]);

const I18N_KEY_BY_ID: Record<DesktopSystemFolderLabelId, string> = {
	documents: 'systemFolders.documents',
	images: 'systemFolders.images',
	projects: 'systemFolders.projects',
	music: 'systemFolders.music',
	downloads: 'systemFolders.downloads',
	content: 'systemFolders.content',
	ewa_file: 'systemFolders.ewa_file',
	trash: 'systemFolders.trash',
};

/**
 * Lowercased aliases for API bootstrap seeds + FE DEFAULT_FOLDERS names.
 * Used when path/title has the seed string but no system id on that segment.
 */
const SYSTEM_FOLDER_SEED_NAME_TO_ID: Record<
	string,
	DesktopSystemFolderLabelId
> = {
	documents: 'documents',
	документы: 'documents',
	images: 'images',
	изображения: 'images',
	projects: 'projects',
	проекты: 'projects',
	downloads: 'downloads',
	загрузки: 'downloads',
	content: 'content',
	'content library': 'content',
	'библиотека контента': 'content',
	trash: 'trash',
	корзина: 'trash',
	music: 'music',
	музыка: 'music',
	ewafile: 'ewa_file',
	ewa_file: 'ewa_file',
};

function normalizeFolderLabelSource(
	item: DesktopFolderLabelSource
): Pick<DesktopItem, 'id' | 'name' | 'type' | 'systemKey' | 'isSystem'> {
	const id = String(item.id ?? item.item_id ?? '').trim();
	const rawType = String(item.type ?? item.item_type ?? 'folder').toLowerCase();
	const type =
		rawType === 'folder' || rawType === 'file' || rawType === 'app'
			? rawType
			: 'folder';
	return {
		id,
		name: typeof item.name === 'string' ? item.name : String(item.name ?? ''),
		type,
		systemKey: item.systemKey ?? item.system_key ?? undefined,
		isSystem: Boolean(item.isSystem ?? item.is_system),
	};
}

function resolveSystemFolderLabelIdBySeedName(
	name: string | null | undefined
): DesktopSystemFolderLabelId | null {
	const key = String(name ?? '')
		.trim()
		.toLowerCase();
	if (!key) return null;
	return SYSTEM_FOLDER_SEED_NAME_TO_ID[key] ?? null;
}

export function resolveDesktopSystemFolderLabelId(
	item: DesktopFolderLabelSource
): DesktopSystemFolderLabelId | null {
	const normalized = normalizeFolderLabelSource(item);
	if (normalized.type !== 'folder') return null;
	const key = (normalized.systemKey || normalized.id || '').trim();
	if (key && SYSTEM_FOLDER_LABEL_IDS.has(key)) {
		return key as DesktopSystemFolderLabelId;
	}
	return resolveSystemFolderLabelIdBySeedName(normalized.name);
}

export function resolveDesktopFolderDisplayName(
	item: DesktopFolderLabelSource,
	t: TFunction<'desktopUi'>
): string {
	const normalized = normalizeFolderLabelSource(item);
	const labelId = resolveDesktopSystemFolderLabelId(normalized);
	if (!labelId) return normalized.name;
	return t(I18N_KEY_BY_ID[labelId], { defaultValue: normalized.name });
}
