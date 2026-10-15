/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Folder-window keyboard shortcut lines for header help tooltip (F1 modal keys live in desktopUi.shortcuts.folderWindow).
 *
 * Invariants:
 * - Copy only; does not register global key handlers.
 *
 * Related:
 * - DesktopFolderWindowHeader.tsx · useFolderWindowListKeyboard.ts
 */

import type { TFunction } from 'i18next';

const FOLDER_WINDOW_SHORTCUT_IDS = [
	'shortcuts.folderWindow.navigateUp',
	'shortcuts.folderWindow.renameNested',
	'shortcuts.folderWindow.deleteShortcut',
	'shortcuts.folderWindow.selectAll',
	'shortcuts.folderWindow.previewNav',
] as const;

export function getFolderWindowShortcutHelpLines(
	t: TFunction<'desktopUi'>
): string[] {
	return FOLDER_WINDOW_SHORTCUT_IDS.map(
		(id) => `${t(`${id}.keys`)} — ${t(`${id}.desc`)}`
	);
}
