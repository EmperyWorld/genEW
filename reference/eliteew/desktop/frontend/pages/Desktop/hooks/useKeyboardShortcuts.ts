/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Advanced keyboard shortcuts for the desktop shell (window snap, launcher, media keys).
 *
 * Invariants:
 * - Ignore key events without a string `key` (IME / some browser synthetic events) so handlers never throw.
 * - Defer to focused app/dialog/shell overlay surfaces via `shouldDeferDesktopShellKeydownToFocusedSurface`.
 * - `preventDefault` when a wired handler runs (avoids browser chrome stealing Win/Alt shortcuts).
 *
 * Related:
 * - `useDesktopWorkspaceKeyboardShortcuts.ts`, `ShortcutsHelpModal.tsx`
 * - utils/desktopShellKeyboardCapture.ts
 */

import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef } from 'react';
import { shouldDeferDesktopShellKeydownToFocusedSurface } from '../utils/desktopShellKeyboardCapture';

export interface ShortcutHandlers {
	// Window management
	onSnapLeft?: () => void;
	onSnapRight?: () => void;
	onSnapTop?: () => void;
	onSnapBottom?: () => void;
	onSnapLeftThird?: () => void;
	onSnapCenterThird?: () => void;
	onSnapRightThird?: () => void;
	onSnapTopLeft?: () => void;
	onSnapTopRight?: () => void;
	onSnapBottomLeft?: () => void;
	onSnapBottomRight?: () => void;
	onMaximize?: () => void;
	onMinimize?: () => void;
	onCloseWindow?: () => void;
	onMoveWindowLeft?: () => void;
	onMoveWindowRight?: () => void;
	onMoveWindowUp?: () => void;
	onMoveWindowDown?: () => void;

	// Desktop management
	onShowDesktop?: () => void;
	onOpenExplorer?: () => void;
	onOpenSearch?: () => void;
	onOpenRun?: () => void;
	onOpenSettings?: () => void;
	onOpenProfile?: () => void;
	onNewFolder?: () => void;
	onSave?: () => void;
	onOpen?: () => void;

	// App shortcuts
	onSwitchApp?: (direction: 'next' | 'prev') => void;
	onOpenTaskSwitcher?: () => void;
	onQuickSearch?: () => void;
	onOpenClipboard?: () => void;
	onScreenshot?: () => void;
	onScreenshotRegion?: () => void;

	// System shortcuts
	onLockDesktop?: () => void;
	onOpenTaskManager?: () => void;
	onToggleTheme?: () => void;
	onIncreaseBrightness?: () => void;
	onDecreaseBrightness?: () => void;
	onIncreaseVolume?: () => void;
	onDecreaseVolume?: () => void;
	onToggleMute?: () => void;
	onToggleWindowMenu?: () => void;
	onHelp?: () => void;
	onRename?: () => void;
	onSearch?: () => void;
	onRefresh?: () => void;
	onToggleFullscreen?: () => void;

	// Custom actions
	onToggleNotifications?: () => void;
	onOpenCommandPalette?: () => void;
	onQuickAppAccess?: (appNumber: number) => void;

	// Virtual desktops
	onSwitchToNextDesktop?: () => void;
	onSwitchToPreviousDesktop?: () => void;
	onCreateDesktop?: () => void;
	onSwitchToDesktop?: (desktopNumber: number) => void;
}

interface ModifierKeys {
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean; // Win/Cmd key
}

export type DesktopShortcutHelpGroups = Array<{
	group: string;
	items: Array<{ id: string; keys: string; desc: string }>;
}>;

/** Command palette row id → `desktopUi` i18n path for `shortcuts.*.keys`. */
export const COMMAND_PALETTE_SHORTCUT_I18N_KEYS: Record<string, string> = {
	'new-folder': 'shortcuts.shell.newFolder.keys',
	refresh: 'shortcuts.system.refresh.keys',
	'quick-search': 'shortcuts.shell.quickSearch.keys',
	'minimize-all': 'shortcuts.shell.showDesktop.keys',
	'task-switcher': 'shortcuts.shell.altTab.keys',
	'snap-window-left': 'shortcuts.windows.snapLeft.keys',
	'snap-window-right': 'shortcuts.windows.snapRight.keys',
	'maximize-active-window': 'shortcuts.windows.maximize.keys',
	'restore-active-window': 'shortcuts.windows.restore.keys',
	settings: 'shortcuts.shell.settings.keys',
	open_profile: 'shortcuts.shell.profile.keys',
	open_explorer: 'shortcuts.shell.explorer.keys',
	theme: 'shortcuts.system.theme.keys',
	notifications: 'shortcuts.shell.notifications.keys',
	'shortcuts-help': 'shortcuts.system.help.keys',
	clipboard: 'shortcuts.shell.clipboardHistory.keys',
	create_virtual_desktop: 'shortcuts.shell.newVDesktop.keys',
	next_virtual_desktop: 'shortcuts.shell.nextVDesktop.keys',
	prev_virtual_desktop: 'shortcuts.shell.prevVDesktop.keys',
};

export function isAppleDesktopPlatform(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

/** Pick platform-appropriate shortcut chips from a comma/or-separated i18n keys string. */
export function formatShortcutKeysForPlatform(keys: string): string {
	const parts = keys
		.split(/\s*(?:,|или|or)\s*/i)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	if (parts.length <= 1) return parts[0] ?? keys;

	if (isAppleDesktopPlatform()) {
		const cmdPart = parts.find((part) => /⌘|Cmd/i.test(part));
		if (cmdPart) return cmdPart;
		const nonWin = parts.find((part) => !/^Win\+/i.test(part));
		return nonWin ?? parts[0];
	}

	const nonCmd = parts.find((part) => !/⌘|Cmd/i.test(part));
	return nonCmd ?? parts[0];
}

/** Palette kbd badge — mirrors F1 help `shortcuts.*.keys` with platform-aware label. */
export function getCommandPaletteShortcutLabel(
	t: TFunction<'desktopUi'>,
	commandId: string
): string | undefined {
	const i18nKey = COMMAND_PALETTE_SHORTCUT_I18N_KEYS[commandId];
	if (!i18nKey) return undefined;
	const keys = t(i18nKey);
	if (!keys || keys === i18nKey) return undefined;
	return formatShortcutKeysForPlatform(keys);
}

/** Keys under `desktopUi.shortcuts.*` — see locales `desktopUi.json`. */
export function getDesktopShortcutHelpGroups(
	t: TFunction<'desktopUi'>
): DesktopShortcutHelpGroups {
	const row = (id: string) => ({
		id,
		keys: t(`${id}.keys`),
		desc: t(`${id}.desc`),
	});
	return [
		{
			group: t('shortcuts.groups.shell'),
			items: [
				row('shortcuts.shell.commandPalette'),
				row('shortcuts.shell.quickSearch'),
				row('shortcuts.shell.explorer'),
				row('shortcuts.shell.profile'),
				row('shortcuts.shell.settings'),
				row('shortcuts.shell.showDesktop'),
				row('shortcuts.shell.notifications'),
				row('shortcuts.shell.newVDesktop'),
				row('shortcuts.shell.switchVDesktop'),
				row('shortcuts.shell.newFolder'),
				row('shortcuts.shell.clipboardHistory'),
				row('shortcuts.shell.altTab'),
				row('shortcuts.shell.altShiftTab'),
				row('shortcuts.shell.pinnedApps'),
			],
		},
		{
			group: t('shortcuts.groups.windows'),
			items: [
				row('shortcuts.windows.maximize'),
				row('shortcuts.windows.restore'),
				row('shortcuts.windows.snapBottom'),
				row('shortcuts.windows.snap'),
				row('shortcuts.windows.snapLeft'),
				row('shortcuts.windows.snapRight'),
				row('shortcuts.windows.close'),
			],
		},
		{
			group: t('shortcuts.groups.system'),
			items: [
				row('shortcuts.system.help'),
				row('shortcuts.system.refresh'),
				row('shortcuts.system.theme'),
				row('shortcuts.system.fullscreen'),
			],
		},
	];
}

function keyboardEventKey(event: KeyboardEvent): string | null {
	const key = event.key;
	return typeof key === 'string' && key.length > 0 ? key : null;
}

/** Run a wired shell shortcut and consume the browser default when the handler exists. */
function runShellShortcut(event: KeyboardEvent, action?: () => void): boolean {
	if (!action) return false;
	event.preventDefault();
	action();
	return true;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
	const keysPressed = useRef<Set<string>>(new Set());
	const modifiers = useRef<ModifierKeys>({
		ctrl: false,
		alt: false,
		shift: false,
		meta: false,
	});

	const updateModifiers = useCallback((key: string, isPressed: boolean) => {
		switch (key) {
			case 'Control':
				modifiers.current.ctrl = isPressed;
				break;
			case 'Alt':
				modifiers.current.alt = isPressed;
				break;
			case 'Shift':
				modifiers.current.shift = isPressed;
				break;
			case 'Meta':
				modifiers.current.meta = isPressed;
				break;
		}
	}, []);

	// Keyboard event handlers
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			const key = keyboardEventKey(e);
			if (!key) return;

			keysPressed.current.add(key);
			updateModifiers(key, true);

			if (shouldDeferDesktopShellKeydownToFocusedSurface()) {
				return;
			}

			// Check for shortcuts
			const { ctrl, alt, shift, meta } = modifiers.current;

			// Window snapping (Win + Arrow keys)
			if (meta && !ctrl && !alt && !shift) {
				switch (key) {
					case 'ArrowLeft':
						if (runShellShortcut(e, handlers.onSnapLeft)) return;
						break;
					case 'ArrowRight':
						if (runShellShortcut(e, handlers.onSnapRight)) return;
						break;
					case 'ArrowUp':
						if (runShellShortcut(e, handlers.onSnapTop)) return;
						break;
					case 'ArrowDown':
						if (runShellShortcut(e, handlers.onSnapBottom)) return;
						break;
				}
			}

			// Window management (Win + Shift + Arrow)
			if (meta && shift && !ctrl && !alt) {
				switch (key) {
					case 'ArrowLeft':
						if (runShellShortcut(e, handlers.onMoveWindowLeft)) return;
						break;
					case 'ArrowRight':
						if (runShellShortcut(e, handlers.onMoveWindowRight)) return;
						break;
					case 'ArrowUp':
						if (runShellShortcut(e, handlers.onMoveWindowUp)) return;
						break;
					case 'ArrowDown':
						if (runShellShortcut(e, handlers.onMoveWindowDown)) return;
						break;
					case 'n':
					case 'N':
						if (runShellShortcut(e, handlers.onNewFolder)) return;
						break;
				}
			}

			// Desktop shortcuts (Win + key, no Ctrl)
			if (meta && !ctrl && !alt && !shift) {
				switch (key) {
					case 'd':
					case 'D':
						if (runShellShortcut(e, handlers.onShowDesktop)) return;
						break;
					case 'e':
					case 'E':
						if (runShellShortcut(e, handlers.onOpenExplorer)) return;
						break;
					case 'f':
					case 'F':
						if (runShellShortcut(e, handlers.onOpenSearch)) return;
						break;
					case 's':
					case 'S':
						if (runShellShortcut(e, handlers.onQuickSearch)) return;
						break;
					case 'r':
					case 'R':
						if (runShellShortcut(e, handlers.onOpenRun)) return;
						break;
					case 'i':
					case 'I':
						if (runShellShortcut(e, handlers.onOpenSettings)) return;
						break;
					case 'u':
					case 'U':
						if (runShellShortcut(e, handlers.onOpenProfile)) return;
						break;
					case 'v':
					case 'V':
						if (runShellShortcut(e, handlers.onOpenClipboard)) return;
						break;
					case 'n':
					case 'N':
						if (runShellShortcut(e, handlers.onToggleNotifications)) return;
						break;
					case 'l':
					case 'L':
						if (runShellShortcut(e, handlers.onLockDesktop)) return;
						break;
					case 'k':
					case 'K':
						if (runShellShortcut(e, handlers.onOpenCommandPalette)) return;
						break;
					case 'Tab':
						if (runShellShortcut(e, () => handlers.onSwitchApp?.('next')))
							return;
						break;
					case '1':
					case '2':
					case '3':
					case '4':
					case '5':
					case '6':
					case '7':
					case '8':
					case '9': {
						const appNumber = parseInt(key, 10);
						if (
							runShellShortcut(e, () => handlers.onQuickAppAccess?.(appNumber))
						) {
							return;
						}
						break;
					}
				}
			}

			// Virtual desktop shortcuts (Win + Ctrl + key)
			if (meta && ctrl && !alt && !shift) {
				switch (key) {
					case 'Tab':
						if (runShellShortcut(e, handlers.onSwitchToNextDesktop)) return;
						break;
					case 'd':
						if (runShellShortcut(e, handlers.onCreateDesktop)) return;
						break;
					case 'ArrowRight':
						if (runShellShortcut(e, handlers.onSwitchToNextDesktop)) return;
						break;
					case 'ArrowLeft':
						if (runShellShortcut(e, handlers.onSwitchToPreviousDesktop)) return;
						break;
				}
			}

			// App shortcuts (Ctrl + key)
			if (ctrl && !alt && !shift && !meta) {
				switch (key) {
					case 's':
					case 'S':
						if (runShellShortcut(e, handlers.onSave)) return;
						break;
					case 'o':
					case 'O':
						if (runShellShortcut(e, handlers.onOpen)) return;
						break;
					case 'a':
					case 'A':
						// Select all - handled elsewhere
						return;
					case 'f':
					case 'F':
						if (runShellShortcut(e, handlers.onSearch)) return;
						break;
					case 'k':
					case 'K':
						if (runShellShortcut(e, handlers.onOpenCommandPalette)) return;
						break;
				}
			}

			if (ctrl && shift && !alt && !meta) {
				switch (key) {
					case 'n':
					case 'N':
						if (runShellShortcut(e, handlers.onNewFolder)) return;
						break;
				}
			}

			// Alt + shortcuts (Alt+Tab = Task Switcher)
			if (alt && !ctrl && !shift && !meta) {
				switch (key) {
					case 'Tab':
						if (
							runShellShortcut(e, () => {
								if (handlers.onOpenTaskSwitcher) {
									handlers.onOpenTaskSwitcher();
									return;
								}
								handlers.onSwitchApp?.('next');
							})
						) {
							return;
						}
						break;
					case 'F4':
						if (runShellShortcut(e, handlers.onCloseWindow)) return;
						break;
					case 'Space':
						if (runShellShortcut(e, handlers.onToggleWindowMenu)) return;
						break;
					case 'Escape':
						if (runShellShortcut(e, handlers.onCloseWindow)) return;
						break;
				}
			}

			if (alt && shift && !ctrl && !meta) {
				switch (key) {
					case 'Tab':
						if (runShellShortcut(e, () => handlers.onSwitchApp?.('prev')))
							return;
						break;
					case 't':
					case 'T':
						if (runShellShortcut(e, handlers.onToggleTheme)) return;
						break;
				}
			}

			if (ctrl && alt && !shift && !meta) {
				switch (key) {
					case 'Delete':
						if (runShellShortcut(e, handlers.onOpenTaskManager)) return;
						break;
					case 'l':
					case 'L':
						if (runShellShortcut(e, handlers.onLockDesktop)) return;
						break;
				}
			}

			// System shortcuts
			if (meta && alt && !ctrl && !shift) {
				switch (key) {
					case 'Tab':
						if (runShellShortcut(e, () => handlers.onSwitchApp?.('prev')))
							return;
						break;
				}
			}

			// F keys
			if (key.startsWith('F') && !ctrl && !alt && !shift && !meta) {
				switch (key) {
					case 'F1':
						if (runShellShortcut(e, handlers.onHelp)) return;
						break;
					case 'F5': {
						const onRefresh = handlers.onRefresh;
						if (runShellShortcut(e, onRefresh)) return;
						break;
					}
					case 'F11':
						if (runShellShortcut(e, handlers.onToggleFullscreen)) return;
						break;
				}
			}

			// Media keys
			switch (key) {
				case 'AudioVolumeUp':
					if (runShellShortcut(e, handlers.onIncreaseVolume)) return;
					break;
				case 'AudioVolumeDown':
					if (runShellShortcut(e, handlers.onDecreaseVolume)) return;
					break;
				case 'AudioVolumeMute':
					if (runShellShortcut(e, handlers.onToggleMute)) return;
					break;
				case 'BrightnessUp':
					if (runShellShortcut(e, handlers.onIncreaseBrightness)) return;
					break;
				case 'BrightnessDown':
					if (runShellShortcut(e, handlers.onDecreaseBrightness)) return;
					break;
			}
		},
		[handlers, updateModifiers]
	);

	const handleKeyUp = useCallback(
		(e: KeyboardEvent) => {
			const key = keyboardEventKey(e);
			if (!key) return;
			keysPressed.current.delete(key);
			updateModifiers(key, false);
		},
		[updateModifiers]
	);

	useEffect(() => {
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	}, [handleKeyDown, handleKeyUp]);

	// Helper to register custom shortcuts
	const registerShortcut = useCallback(
		(key: string, modifierList: string[], action: () => void) => {
			const checkCustomShortcut = (e: KeyboardEvent) => {
				const { ctrl, alt, shift, meta } = modifiers.current;

				const hasCtrl = modifierList.includes('ctrl') && ctrl;
				const hasAlt = modifierList.includes('alt') && alt;
				const hasShift = modifierList.includes('shift') && shift;
				const hasMeta = modifierList.includes('meta') && meta;

				const modifiersMatch =
					modifierList.includes('ctrl') === hasCtrl &&
					modifierList.includes('alt') === hasAlt &&
					modifierList.includes('shift') === hasShift &&
					modifierList.includes('meta') === hasMeta;

				if (modifiersMatch && e.key === key) {
					e.preventDefault();
					action();
				}
			};

			window.addEventListener('keydown', checkCustomShortcut);

			return () => {
				window.removeEventListener('keydown', checkCustomShortcut);
			};
		},
		[]
	);

	return {
		registerShortcut,
	};
}

// Extended interface for additional handlers
declare module './useKeyboardShortcuts' {
	interface ShortcutHandlers {
		onMoveWindowLeft?: () => void;
		onMoveWindowRight?: () => void;
		onMoveWindowUp?: () => void;
		onMoveWindowDown?: () => void;
		onSnapUp?: () => void;
		onSnapDown?: () => void;
		onNewFolder?: () => void;
		onSave?: () => void;
		onOpen?: () => void;
		onHelp?: () => void;
		onRename?: () => void;
		onSearch?: () => void;
		onRefresh?: () => void;
		onToggleFullscreen?: () => void;
		onToggleWindowMenu?: () => void;
		onIncreaseVolume?: () => void;
		onDecreaseVolume?: () => void;
		onToggleMute?: () => void;
		onOpenClipboard?: () => void;
	}
}
