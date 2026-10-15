/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * User-facing desktop window/item labels derived from stable window payloads without changing app ids or router components.
 *
 * Invariants:
 * - `EwaApp` keeps its technical app identity; only visible chrome may use the active companion display name.
 * - Folder chrome localizes system path/title via display helper; stored ``win.title`` / ``path`` stay API-canonical.
 * - DocEditor/GAF dynamic titles stay compatible with their existing payload contracts.
 *
 * Related:
 * - src/features/ewa/EwaDesktopApp.tsx
 * - src/pages/Desktop/components/EnhancedWindow.tsx
 * - src/pages/Desktop/components/TaskbarPinnedAndWindowsStrip.tsx
 * - src/pages/Desktop/utils/desktopSystemFolderLabels.ts
 */
import type { TFunction } from 'i18next';
import i18n from '@/i18n/config';
import type {
	DesktopItem,
	WindowInitialPayload,
	WindowState,
} from '@/pages/Desktop/types/desktop.types';
import { localizeDefaultDesktopWindowCatalogTitle } from '@/pages/Desktop/utils/localizeDefaultDesktopAppCatalogCopy';
import { resolveDocEditorMaskedWindowTitle } from '@/pages/Desktop/utils/desktopOpenPayloads';
import { resolveDesktopFolderDisplayName } from '@/pages/Desktop/utils/desktopSystemFolderLabels';

const EWA_APP_COMPONENT = 'EwaApp';

function trimDisplayName(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function resolveDesktopUiTranslator(
	t?: TFunction<'desktopUi'>
): TFunction<'desktopUi'> {
	return (
		t ??
		((key, opts) =>
			i18n.t(key, { ns: 'desktopUi', ...(opts as object) }) as string)
	);
}

function localizeFolderWindowPathSegment(
	segment: string,
	options: {
		folderId?: string;
		isLeaf: boolean;
		t: TFunction<'desktopUi'>;
	}
): string {
	return resolveDesktopFolderDisplayName(
		{
			id: options.isLeaf ? options.folderId : undefined,
			name: segment,
			type: 'folder',
		},
		options.t
	);
}

export function readEwaDesktopDisplayNameFromPayload(
	payload: WindowInitialPayload | undefined
): string | null {
	return trimDisplayName(payload?.ewaDesktopDisplayName);
}

export function resolveDesktopWindowDisplayTitle(
	win: WindowState,
	tDesktopUi?: TFunction<'desktopUi'>
): string {
	if (win.type === 'folder') {
		const t = resolveDesktopUiTranslator(tDesktopUi);
		const path = win.path?.filter((p) => p.trim().length > 0) ?? [];
		if (path.length > 0) {
			return path
				.map((segment, index) =>
					localizeFolderWindowPathSegment(segment, {
						folderId: win.folderId,
						isLeaf: index === path.length - 1,
						t,
					})
				)
				.join(' › ');
		}
		const fallbackTitle = win.title?.trim() || 'Folder';
		return resolveDesktopFolderDisplayName(
			{
				id: win.folderId,
				name: fallbackTitle,
				type: 'folder',
			},
			t
		);
	}
	const username = trimDisplayName(win.initialPayload?.targetUsername);
	if (win.appComponent === 'GAFChatApp' && username) {
		return `GAF Chat · ${username}`;
	}
	if (win.appComponent === 'DocEditor') {
		return resolveDocEditorMaskedWindowTitle(win.initialPayload, win.title);
	}
	if (win.appComponent === EWA_APP_COMPONENT) {
		return (
			readEwaDesktopDisplayNameFromPayload(win.initialPayload) ?? win.title
		);
	}
	return localizeDefaultDesktopWindowCatalogTitle({
		appId: win.folderId,
		appComponent: win.appComponent,
		title: win.title,
	});
}

export function newestEwaDesktopDisplayName(
	windows: readonly WindowState[]
): string | null {
	for (const win of [...windows].sort((a, b) => b.zIndex - a.zIndex)) {
		if (win.appComponent !== EWA_APP_COMPONENT) continue;
		const displayName = readEwaDesktopDisplayNameFromPayload(
			win.initialPayload
		);
		if (displayName) return displayName;
	}
	return null;
}

export function withEwaDesktopItemDisplayName(
	item: DesktopItem,
	windows: readonly WindowState[]
): DesktopItem {
	if (item.appComponent !== EWA_APP_COMPONENT) return item;
	const displayName = newestEwaDesktopDisplayName(windows);
	if (!displayName || item.name === displayName) return item;
	return { ...item, name: displayName };
}

export function withEwaDesktopItemsDisplayName(
	items: readonly DesktopItem[],
	windows: readonly WindowState[]
): DesktopItem[] {
	const displayName = newestEwaDesktopDisplayName(windows);
	if (!displayName) return items as DesktopItem[];
	let changed = false;
	const next = items.map((item) => {
		if (item.appComponent !== EWA_APP_COMPONENT || item.name === displayName) {
			return item;
		}
		changed = true;
		return { ...item, name: displayName };
	});
	return changed ? next : (items as DesktopItem[]);
}
