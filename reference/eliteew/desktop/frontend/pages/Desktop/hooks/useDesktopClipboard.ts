/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop shell clipboard shortcuts (copy/cut/paste/delete) and a few global desktop keys.
 *
 * Invariants:
 * - Ctrl/Meta+A never selects desktop icons; text fields keep native select-all via defer.
 * - Shell shortcuts defer when focus is inside a window field or rename editor.
 *
 * Related:
 * - utils/desktopShellKeyboardCapture.ts
 */

import { useCallback, useEffect } from 'react';
import type { ContextMenuState, DesktopItem } from '../types/desktop.types';
import { isSystemDesktopApp } from '../utils/desktopAppRegistry';
import { shouldDeferDesktopShellKeydownToFocusedSurface } from '../utils/desktopShellKeyboardCapture';

type ClipboardAction = 'copy' | 'cut' | null;

interface UseDesktopClipboardParams {
	items: DesktopItem[];
	selected: Set<string>;
	clipboard: DesktopItem[];
	clipboardAction: ClipboardAction;
	commitItems: (next: DesktopItem[]) => void;
	setSelected: (
		updater: Set<string> | ((prev: Set<string>) => Set<string>)
	) => void;
	setClipboard: (items: DesktopItem[], action: ClipboardAction) => void;
	setCtx: (
		updater: ContextMenuState | ((prev: ContextMenuState) => ContextMenuState)
	) => void;
	setRenamingId: (value: string | null) => void;
	setShowCommandPalette: (value: boolean) => void;
	setShowNF: (value: boolean) => void;
	setShowShortcutsHelp: (value: boolean) => void;
	minimizeAllWindows: () => void;
	/** Пока переименование ярлыка на столе — не перехватывать Ctrl+A / Delete и т.д. */
	renamingId: string | null;
}

const createDesktopItemId = (sourceId: string, suffix: string): string =>
	`${sourceId}-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const cloneForCopy = (item: DesktopItem, index: number): DesktopItem => {
	const offset = 20 * (index + 1);

	if (item.type === 'app') {
		return {
			...item,
			id: createDesktopItemId(item.id, 'shortcut'),
			name: `${item.name} (ярлык)`,
			isPinned: false,
			position: { x: item.position.x + offset, y: item.position.y + offset },
		};
	}

	if (item.type === 'folder') {
		return {
			...item,
			id: createDesktopItemId(item.id, 'folder-copy'),
			name: `${item.name} (копия)`,
			children: [],
			parentId: undefined,
			position: { x: item.position.x + offset, y: item.position.y + offset },
		};
	}

	return {
		...item,
		id: createDesktopItemId(item.id, 'file-link'),
		name: `${item.name} (ссылка)`,
		parentId: undefined,
		position: { x: item.position.x + offset, y: item.position.y + offset },
	};
};

export const buildClipboardPasteResult = (
	items: DesktopItem[],
	clipboard: DesktopItem[],
	clipboardAction: ClipboardAction
): { nextItems: DesktopItem[]; shouldClearClipboard: boolean } => {
	if (clipboard.length === 0 || !clipboardAction) {
		return { nextItems: items, shouldClearClipboard: false };
	}

	if (clipboardAction === 'cut') {
		const movedIds = new Set(clipboard.map((item) => item.id));
		const movedItems = clipboard.map((item, index) => ({
			...item,
			position: {
				x: item.position.x + 20 * (index + 1),
				y: item.position.y + 20 * (index + 1),
			},
		}));
		return {
			nextItems: [
				...items.filter((item) => !movedIds.has(item.id)),
				...movedItems,
			],
			shouldClearClipboard: true,
		};
	}

	return {
		nextItems: [
			...items,
			...clipboard.map((item, index) => cloneForCopy(item, index)),
		],
		shouldClearClipboard: false,
	};
};

export function useDesktopClipboard({
	items,
	selected,
	clipboard,
	clipboardAction,
	commitItems,
	setSelected,
	setClipboard,
	setCtx,
	setRenamingId,
	setShowCommandPalette,
	setShowNF,
	setShowShortcutsHelp,
	minimizeAllWindows,
	renamingId,
}: UseDesktopClipboardParams) {
	const copyItems = useCallback(
		(sourceItems: DesktopItem[]) => {
			if (sourceItems.length > 0) {
				setClipboard(sourceItems, 'copy');
			}
		},
		[setClipboard]
	);

	const cutItems = useCallback(
		(sourceItems: DesktopItem[]) => {
			if (sourceItems.length > 0) {
				setClipboard(sourceItems, 'cut');
			}
		},
		[setClipboard]
	);

	const pasteClipboard = useCallback(() => {
		const { nextItems, shouldClearClipboard } = buildClipboardPasteResult(
			items,
			clipboard,
			clipboardAction
		);
		if (nextItems === items) {
			return;
		}
		commitItems(nextItems);
		if (shouldClearClipboard) {
			setClipboard([], null);
		}
	}, [clipboard, clipboardAction, commitItems, items, setClipboard]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const defer =
				renamingId != null || shouldDeferDesktopShellKeydownToFocusedSurface();

			if (!defer) {
				if (e.ctrlKey && e.key.toLowerCase() === 'k') {
					e.preventDefault();
					setShowCommandPalette(true);
				}
				if (e.ctrlKey && e.shiftKey && e.key === 'N') {
					e.preventDefault();
					setShowNF(true);
				}
				if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
					e.preventDefault();
					minimizeAllWindows();
				}
				if (e.key === '?' && (e.ctrlKey || e.metaKey)) {
					e.preventDefault();
					setShowShortcutsHelp(true);
				}
				if (e.key === 'Escape') {
					setSelected(new Set());
					setCtx((prev) => ({ ...prev, isOpen: false }));
					setRenamingId(null);
				}
			}

			if (defer) return;

			const modCombo = e.ctrlKey || e.metaKey;
			if (modCombo && e.key.toLowerCase() === 'a') {
				// Block desktop-wide select-all; native select-all remains in text inputs (defer path).
				e.preventDefault();
			}
			if (modCombo && e.key.toLowerCase() === 'c' && selected.size > 0) {
				e.preventDefault();
				copyItems(items.filter((item) => selected.has(item.id)));
			}
			if (modCombo && e.key.toLowerCase() === 'x' && selected.size > 0) {
				e.preventDefault();
				cutItems(items.filter((item) => selected.has(item.id)));
			}
			if (modCombo && e.key.toLowerCase() === 'v') {
				e.preventDefault();
				pasteClipboard();
			}
			if (e.key === 'Delete' && selected.size > 0) {
				e.preventDefault();
				const toDeleteIds = new Set(
					[...selected].filter((id) => {
						const item = items.find((i) => i.id === id);
						return item && !isSystemDesktopApp(item);
					})
				);
				let added = true;
				while (added) {
					added = false;
					for (const item of items) {
						if (
							item.parentId &&
							toDeleteIds.has(item.parentId) &&
							!toDeleteIds.has(item.id)
						) {
							toDeleteIds.add(item.id);
							added = true;
						}
					}
				}
				const newItems = items.filter((item) => !toDeleteIds.has(item.id));
				commitItems(newItems);
				setSelected(new Set());
			}
			if (e.key === 'F2' && selected.size === 1) {
				e.preventDefault();
				setRenamingId(Array.from(selected)[0] ?? null);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [
		copyItems,
		cutItems,
		items,
		minimizeAllWindows,
		pasteClipboard,
		selected,
		commitItems,
		setCtx,
		setRenamingId,
		setSelected,
		setShowCommandPalette,
		setShowNF,
		setShowShortcutsHelp,
		renamingId,
	]);

	return {
		copyItems,
		cutItems,
		pasteClipboard,
	};
}
