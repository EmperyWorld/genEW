/**
 * Геометрия привязки окон к краям: указатель в viewport, зоны в координатах слоя окон
 * (деление на `layoutScale` у `[data-desktop-ui-scale]`). Высота — по полосе задач в DOM.
 */

import { DESKTOP_LAYOUT } from '../constants';
import type { SnapZone } from '../types/desktop.types';

/** Согласовано с `useWindowManager.snapWindow` — для сохранённых пресетов и тестов. */
export type SnapLayoutRect = {
	position: { x: number; y: number };
	size: { width: number; height: number };
	isMaximized: boolean;
};

/**
 * Прямоугольник окна для зоны snap в координатах рабочей области над таскбаром
 * (`getMaximizedWindowBounds().size`).
 */
export function getRectForSnapZone(
	zone: Exclude<SnapZone, null>,
	work: { width: number; height: number }
): SnapLayoutRect {
	const screenW = work.width;
	const screenH = work.height;
	const halfW = screenW / 2;
	const halfH = screenH / 2;
	const thirdW = screenW / 3;

	switch (zone) {
		case 'left':
			return {
				position: { x: 0, y: 0 },
				size: { width: halfW, height: screenH },
				isMaximized: false,
			};
		case 'right':
			return {
				position: { x: halfW, y: 0 },
				size: { width: halfW, height: screenH },
				isMaximized: false,
			};
		case 'top':
			return {
				position: { x: 0, y: 0 },
				size: { width: screenW, height: screenH },
				isMaximized: true,
			};
		case 'bottom':
			return {
				position: { x: 0, y: halfH },
				size: { width: screenW, height: halfH },
				isMaximized: false,
			};
		case 'left-third':
			return {
				position: { x: 0, y: 0 },
				size: { width: thirdW, height: screenH },
				isMaximized: false,
			};
		case 'center-third':
			return {
				position: { x: thirdW, y: 0 },
				size: { width: thirdW, height: screenH },
				isMaximized: false,
			};
		case 'right-third':
			return {
				position: { x: 2 * thirdW, y: 0 },
				size: { width: thirdW, height: screenH },
				isMaximized: false,
			};
		case 'top-left':
			return {
				position: { x: 0, y: 0 },
				size: { width: halfW, height: halfH },
				isMaximized: false,
			};
		case 'top-right':
			return {
				position: { x: halfW, y: 0 },
				size: { width: halfW, height: halfH },
				isMaximized: false,
			};
		case 'bottom-left':
			return {
				position: { x: 0, y: halfH },
				size: { width: halfW, height: halfH },
				isMaximized: false,
			};
		case 'bottom-right':
			return {
				position: { x: halfW, y: halfH },
				size: { width: halfW, height: halfH },
				isMaximized: false,
			};
		default: {
			const _never: never = zone;
			return _never;
		}
	}
}

export const SNAP_THRESHOLD_PX = 20;

const TASKBAR_FALLBACK_PX = DESKTOP_LAYOUT.TASKBAR_HEIGHT_PX;

export type DesktopWorkArea = {
	/** Смещение левого верхнего угла рабочей области относительно viewport (для clientX/Y). */
	offsetLeft: number;
	offsetTop: number;
	/** Ширина/высота в координатах слоя окон (layout px внутри масштабированного корня). */
	width: number;
	height: number;
	/**
	 * Множитель масштаба стола (`data-desktop-ui-scale`, `transform: scale`). Перевод clientX/Y
	 * в координаты `react-rnd` / `WindowState.position`.
	 */
	layoutScale: number;
};

/**
 * Читает прямоугольник под окна: от верха масштабированного корня стола до полосы задач.
 * Корень: `[data-desktop-ui-scale]` внутри `#desktop-main` (см. DesktopWorkspaceShellLayout).
 * Полоса задач: `data-desktop-taskbar-strip`.
 */
export function readDesktopWorkArea(): DesktopWorkArea {
	if (typeof document === 'undefined') {
		return {
			offsetLeft: 0,
			offsetTop: 0,
			width: 1280,
			height: Math.max(240, 720 - TASKBAR_FALLBACK_PX),
			layoutScale: 1,
		};
	}
	const main = document.getElementById('desktop-main');
	if (!main) {
		const w = window.innerWidth;
		const h = window.innerHeight;
		return {
			offsetLeft: 0,
			offsetTop: 0,
			width: w,
			height: Math.max(240, h - TASKBAR_FALLBACK_PX),
			layoutScale: 1,
		};
	}

	const zoomRoot = main.querySelector<HTMLElement>('[data-desktop-ui-scale]');
	const taskbar = main.querySelector<HTMLElement>(
		'[data-desktop-taskbar-strip]'
	);

	if (zoomRoot) {
		const zr = zoomRoot.getBoundingClientRect();
		const rawScale = parseFloat(
			zoomRoot.getAttribute('data-desktop-ui-scale') || '1'
		);
		const layoutScale =
			Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;

		/** После волны 19: корень с `transform: scale` — layout-ширина в `clientWidth`. */
		const width = Math.max(320, zoomRoot.clientWidth);
		let height: number;
		if (taskbar) {
			const tb = taskbar.getBoundingClientRect();
			height = Math.max(240, Math.round((tb.top - zr.top) / layoutScale));
		} else {
			height = Math.max(240, zoomRoot.clientHeight - TASKBAR_FALLBACK_PX);
		}

		return {
			offsetLeft: zr.left,
			offsetTop: zr.top,
			width,
			height,
			layoutScale,
		};
	}

	const mainRect = main.getBoundingClientRect();
	if (taskbar) {
		const tb = taskbar.getBoundingClientRect();
		const height = Math.max(240, tb.top - mainRect.top);
		return {
			offsetLeft: mainRect.left,
			offsetTop: mainRect.top,
			width: mainRect.width,
			height,
			layoutScale: 1,
		};
	}
	return {
		offsetLeft: mainRect.left,
		offsetTop: mainRect.top,
		width: mainRect.width,
		height: Math.max(240, mainRect.height - TASKBAR_FALLBACK_PX),
		layoutScale: 1,
	};
}

/** Чистая логика зон: координаты относительно левого верхнего угла рабочей области. */
export function snapZoneFromRelativePointer(
	relX: number,
	relY: number,
	screenW: number,
	screenH: number,
	threshold = SNAP_THRESHOLD_PX
): SnapZone {
	if (relX <= threshold && relY <= threshold) {
		return 'top-left';
	}
	if (relX >= screenW - threshold && relY <= threshold) {
		return 'top-right';
	}
	if (relX <= threshold && relY >= screenH - threshold) {
		return 'bottom-left';
	}
	if (relX >= screenW - threshold && relY >= screenH - threshold) {
		return 'bottom-right';
	}
	if (relY <= threshold) {
		if (relX < screenW / 3) return 'left-third';
		if (relX < (2 * screenW) / 3) return 'center-third';
		return 'right-third';
	}
	if (relX <= threshold) {
		return 'left';
	}
	if (relX >= screenW - threshold) {
		return 'right';
	}
	if (relY >= screenH - threshold) {
		return 'bottom';
	}
	return null;
}

/**
 * Координаты курсора в viewport → слой стола (как `item.position` / rubber-band),
 * согласовано с `[data-desktop-ui-scale]` и `readDesktopWorkArea`.
 */
export function clientToDesktopLayoutCoords(
	clientX: number,
	clientY: number
): { x: number; y: number } {
	const wa = readDesktopWorkArea();
	const s = wa.layoutScale > 0 ? wa.layoutScale : 1;
	return {
		x: (clientX - wa.offsetLeft) / s,
		y: (clientY - wa.offsetTop) / s,
	};
}

/** Зона привязки по координатам указателя в viewport (clientX / clientY). */
export function getSnapZoneForClientPosition(
	clientX: number,
	clientY: number,
	threshold = SNAP_THRESHOLD_PX
): SnapZone {
	const wa = readDesktopWorkArea();
	const scale = wa.layoutScale > 0 ? wa.layoutScale : 1;
	const relX = (clientX - wa.offsetLeft) / scale;
	const relY = (clientY - wa.offsetTop) / scale;
	return snapZoneFromRelativePointer(
		relX,
		relY,
		wa.width,
		wa.height,
		threshold
	);
}
