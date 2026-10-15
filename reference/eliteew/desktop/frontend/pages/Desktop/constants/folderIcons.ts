/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Catalog of selectable icons for user-created desktop folders (persisted as meta.folder_icon).
 *
 * Invariants:
 * - ids must stay aligned with api/services/desktop_folder_icon.py USER_FOLDER_ICON_IDS.
 *
 * Related:
 * - components/NewFolderDialog.tsx
 * - utils/desktopFolderIconMeta.ts
 */

import {
	ArchiveBoxIcon,
	BookOpenIcon,
	BookmarkIcon,
	BriefcaseIcon,
	CameraIcon,
	ChartBarIcon,
	CodeBracketIcon,
	FlagIcon,
	GiftIcon,
	HeartIcon,
	KeyIcon,
	LightBulbIcon,
	PuzzlePieceIcon,
	SparklesIcon,
	StarIcon,
	TagIcon,
} from '@heroicons/react/24/outline';
import type React from 'react';
import { createElement } from 'react';

export const USER_FOLDER_ICON_IDS = [
	'star',
	'heart',
	'bookmark',
	'briefcase',
	'tag',
	'archive',
	'chart',
	'code',
	'lightbulb',
	'gift',
	'camera',
	'key',
	'flag',
	'puzzle',
	'book',
	'sparkles',
] as const;

export type UserFolderIconId = (typeof USER_FOLDER_ICON_IDS)[number];

export const DEFAULT_USER_FOLDER_ICON_ID: UserFolderIconId = 'star';

const ICON_CLASS = 'h-5 w-5 text-(--desktop-text-primary)';

const ICON_COMPONENTS: Record<
	UserFolderIconId,
	React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
	star: StarIcon,
	heart: HeartIcon,
	bookmark: BookmarkIcon,
	briefcase: BriefcaseIcon,
	tag: TagIcon,
	archive: ArchiveBoxIcon,
	chart: ChartBarIcon,
	code: CodeBracketIcon,
	lightbulb: LightBulbIcon,
	gift: GiftIcon,
	camera: CameraIcon,
	key: KeyIcon,
	flag: FlagIcon,
	puzzle: PuzzlePieceIcon,
	book: BookOpenIcon,
	sparkles: SparklesIcon,
};

export function isUserFolderIconId(value: string): value is UserFolderIconId {
	return (USER_FOLDER_ICON_IDS as readonly string[]).includes(value);
}

export function resolveUserFolderIconNode(
	iconId: string | undefined | null
): React.ReactNode | undefined {
	if (!iconId || !isUserFolderIconId(iconId)) return undefined;
	const Icon = ICON_COMPONENTS[iconId];
	return createElement(Icon, {
		className: ICON_CLASS,
		strokeWidth: 1.35,
		'aria-hidden': true,
	});
}

export function getUserFolderIconLabelKey(iconId: UserFolderIconId): string {
	return `folder.icons.${iconId}`;
}
