/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Minimal desktop background hit-target (click to deselect, context menu, external drops).
 *
 * Invariants:
 * - Decorative wallpaper lives on `#desktop-main`; this layer is transparent and non-focusable.
 *
 * Related:
 * - DesktopWorkspaceCanvas.tsx, desktopWelcomeGuideConstants.ts
 */

import * as React from 'react';

/**
 * Если после mousedown указатель заметно сдвинулся (рамка выделения), не считаем это кликом по фону:
 * иначе синтетический `click` снимет выделение сразу после отпускания ЛКМ.
 */
const BACKGROUND_CLICK_MAX_MOVE_PX = 5;

/**
 * Минимальный слой рабочего стола: только hit-target по фону (снять выделение, контекстное меню).
 * Декоративные оверлеи сняты ради производительности; фон задаётся на shell выше (обои / градиент).
 */
export interface DesktopWorkspaceSceneDecorProps {
	backgroundAriaLabel: string;
	onBackgroundClick: () => void;
	onBackgroundContextMenu: (e: React.MouseEvent) => void;
	/** HTML5 drop from Content Manager (unified content ids) onto desktop background. */
	onBackgroundDragOver?: (e: React.DragEvent) => void;
	onBackgroundDrop?: (e: React.DragEvent) => void;
}

export const DesktopWorkspaceSceneDecor: React.FC<
	DesktopWorkspaceSceneDecorProps
> = ({
	backgroundAriaLabel,
	onBackgroundClick,
	onBackgroundContextMenu,
	onBackgroundDragOver,
	onBackgroundDrop,
}) => {
	const leftDownClientRef = React.useRef<{ x: number; y: number } | null>(null);

	const handleBackgroundPointerDown = React.useCallback(
		(e: React.PointerEvent<HTMLButtonElement>) => {
			if (e.button !== 0) return;
			leftDownClientRef.current = { x: e.clientX, y: e.clientY };
		},
		[]
	);

	const handleBackgroundClick = React.useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			const start = leftDownClientRef.current;
			leftDownClientRef.current = null;
			if (start != null) {
				const dx = e.clientX - start.x;
				const dy = e.clientY - start.y;
				const slack = BACKGROUND_CLICK_MAX_MOVE_PX;
				if (dx * dx + dy * dy > slack * slack) {
					return;
				}
			}
			onBackgroundClick();
		},
		[onBackgroundClick]
	);

	return (
		<button
			type="button"
			tabIndex={-1}
			aria-label={backgroundAriaLabel}
			data-desktop-background
			data-desktop-welcome-guide="workspace"
			className="absolute inset-0 z-0 cursor-default bg-transparent border-0 p-0"
			onPointerDown={handleBackgroundPointerDown}
			onClick={handleBackgroundClick}
			onContextMenu={onBackgroundContextMenu}
			onDragOver={onBackgroundDragOver}
			onDrop={onBackgroundDrop}
		/>
	);
};
