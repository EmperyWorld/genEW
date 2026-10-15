/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared dismiss pattern for floating context/overflow menus (outside click + Escape).
 *
 * Invariants:
 * - No dim backdrop — close only on pointer outside or Escape.
 * - When `escapeCapture` is true, Escape delegates to `useShellCaptureEscape` on window.
 *
 * Related:
 * - hooks/useShellCaptureKeyboard.ts
 * - components/StartMenu.tsx, TaskbarPinnedAndWindowsStrip.tsx
 * - components/TaskbarIconContextMenu.tsx, components/Taskbar.tsx
 */

import { useEffect, type RefObject } from 'react';
import { useShellCaptureEscape } from './useShellCaptureKeyboard';

export interface UseDismissibleFloatingMenuOptions {
	isOpen: boolean;
	menuRef: RefObject<HTMLElement | null>;
	onClose: () => void;
	/** `mousedown` / `touchstart` outside menu (default true) */
	closeOnPointerDownOutside?: boolean;
	/** Escape (default true); listener on `document` when not capture */
	closeOnEscape?: boolean;
	/** Capture + stopPropagation on Escape via `useShellCaptureEscape` (default false) */
	escapeCapture?: boolean;
	/** Focus first enabled `[role="menuitem"]` when menu opens (default false) */
	focusFirstMenuItem?: boolean;
}

/**
 * Единый паттерн для плавающих ПКМ/overflow-меню: клик снаружи + Escape.
 * Без dim-backdrop — только закрытие по событию.
 */
export function useDismissibleFloatingMenu({
	isOpen,
	menuRef,
	onClose,
	closeOnPointerDownOutside = true,
	closeOnEscape = true,
	escapeCapture = false,
	focusFirstMenuItem = false,
}: UseDismissibleFloatingMenuOptions): void {
	useShellCaptureEscape(isOpen && closeOnEscape && escapeCapture, onClose);

	useEffect(() => {
		if (!isOpen) return;

		const onPointerDown = (e: MouseEvent | TouchEvent): void => {
			if (!closeOnPointerDownOutside) return;
			const t = e.target as Node;
			if (menuRef.current?.contains(t)) return;
			onClose();
		};

		document.addEventListener('mousedown', onPointerDown);
		document.addEventListener('touchstart', onPointerDown, { passive: true });

		return (): void => {
			document.removeEventListener('mousedown', onPointerDown);
			document.removeEventListener('touchstart', onPointerDown);
		};
	}, [isOpen, onClose, menuRef, closeOnPointerDownOutside]);

	useEffect(() => {
		if (!isOpen || !closeOnEscape || escapeCapture) return;

		const onKeyDown = (e: KeyboardEvent): void => {
			if (e.key !== 'Escape') return;
			e.preventDefault();
			onClose();
		};

		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [isOpen, onClose, closeOnEscape, escapeCapture]);

	useEffect(() => {
		if (!isOpen || !focusFirstMenuItem) return;
		const frameId = window.requestAnimationFrame(() => {
			const first = menuRef.current?.querySelector<HTMLElement>(
				'[role="menuitem"]:not([disabled])'
			);
			first?.focus();
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [focusFirstMenuItem, isOpen, menuRef]);
}
