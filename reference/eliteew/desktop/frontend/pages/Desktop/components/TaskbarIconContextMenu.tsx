/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared right-click menu shell for compact taskbar tray icons. Keeps positioning,
 * portal z-index and outside-dismiss behavior consistent across toolbar buttons.
 *
 * Invariants:
 * - Menu content is provided by the owning icon; this component only owns chrome.
 * - Outside click and Escape must close the menu without stealing primary-click flows.
 * - Escape uses `useShellCaptureEscape` so parent overlays stay open.
 * - First enabled menuitem receives focus when the menu opens.
 *
 * Related:
 * - `TaskbarRightToolbar.tsx`
 * - hooks/useShellCaptureKeyboard.ts
 * - `SessionDeviceTrayButton.tsx`
 * - `TaskbarNotificationCluster.tsx`
 */

import { AnimatePresence, m } from 'framer-motion';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useDesktopWindowPortalStackBase } from '@/pages/Desktop/context/DesktopWindowPortalStackContext';
import { useShellCaptureEscape } from '@/pages/Desktop/hooks/useShellCaptureKeyboard';
import { getFloatingMenuPosition } from '../utils/desktopUi';
import { DesktopShellFloatingPortal } from './DesktopShellFloatingPortal';
import { DesktopAppMenuSurface } from './DesktopAppChrome';

export type TaskbarIconContextMenuPoint = {
	x: number;
	y: number;
};

export type TaskbarIconContextMenuProps = {
	point: TaskbarIconContextMenuPoint | null;
	onClose: () => void;
	children: ReactNode;
	menuWidth?: number;
	menuHeight?: number;
	className?: string;
};

export function TaskbarIconContextMenu({
	point,
	onClose,
	children,
	menuWidth = 220,
	menuHeight = 120,
	className,
}: TaskbarIconContextMenuProps) {
	const portalStackBase = useDesktopWindowPortalStackBase();
	const menuRef = useRef<HTMLDivElement | null>(null);
	const menuPos = useMemo(() => {
		if (!point) return null;
		return getFloatingMenuPosition(
			{ x: point.x, y: point.y },
			{ menuWidth, menuHeight, preferAbove: true, anchorGap: 10 }
		);
	}, [menuHeight, menuWidth, point]);

	useEffect(() => {
		if (!point) return;
		const closeOnOutsidePointer = (event: MouseEvent | PointerEvent) => {
			if (menuRef.current?.contains(event.target as Node)) {
				return;
			}
			onClose();
		};
		window.addEventListener('mousedown', closeOnOutsidePointer, {
			capture: true,
		});
		window.addEventListener('pointerdown', closeOnOutsidePointer, {
			capture: true,
		});
		return () => {
			window.removeEventListener('mousedown', closeOnOutsidePointer, {
				capture: true,
			});
			window.removeEventListener('pointerdown', closeOnOutsidePointer, {
				capture: true,
			});
		};
	}, [onClose, point]);

	useShellCaptureEscape(point != null, onClose);

	useEffect(() => {
		if (!point) return;
		const frameId = window.requestAnimationFrame(() => {
			const first = menuRef.current?.querySelector<HTMLElement>(
				'[role="menuitem"]:not([disabled])'
			);
			first?.focus();
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [point]);

	return (
		<DesktopShellFloatingPortal>
			<AnimatePresence>
				{point && menuPos ? (
					<m.div
						key="taskbar-icon-context-menu"
						ref={menuRef}
						initial={{ opacity: 0, scale: 0.96, y: 4 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.96, y: 4 }}
						transition={{ duration: 0.12 }}
						className="fixed"
						style={{
							zIndex: portalStackBase,
							left: menuPos.x,
							top: menuPos.y,
						}}
						data-taskbar-icon-context-menu
						role="presentation"
						onClick={(event) => event.stopPropagation()}
						onMouseDown={(event) => event.stopPropagation()}
						onContextMenu={(event) => {
							event.preventDefault();
							event.stopPropagation();
						}}
					>
						<DesktopAppMenuSurface className={className} role="menu">
							{children}
						</DesktopAppMenuSurface>
					</m.div>
				) : null}
			</AnimatePresence>
		</DesktopShellFloatingPortal>
	);
}
