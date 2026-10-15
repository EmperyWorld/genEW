import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_LAYOUT } from '../constants';
import {
	clientToDesktopLayoutCoords,
	getSnapZoneForClientPosition,
	readDesktopWorkArea,
	SNAP_THRESHOLD_PX,
	snapZoneFromRelativePointer,
} from './desktopSnapGeometry';

function stubGetBoundingClientRect(
	el: HTMLElement,
	rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
): void {
	const left = rect.left;
	const top = rect.top;
	const width = rect.width;
	const height = rect.height;
	const out: DOMRect = {
		x: left,
		y: top,
		width,
		height,
		left,
		top,
		right: left + width,
		bottom: top + height,
		toJSON() {
			return JSON.stringify(out);
		},
	};
	vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(out);
}

describe('snapZoneFromRelativePointer', () => {
	const W = 1200;
	const H = 800;
	const t = 20;

	it('возвращает top-left у левого верхнего угла', () => {
		expect(snapZoneFromRelativePointer(5, 5, W, H, t)).toBe('top-left');
	});

	it('возвращает top-right у правого верхнего угла', () => {
		expect(snapZoneFromRelativePointer(W - 5, 5, W, H, t)).toBe('top-right');
	});

	it('возвращает bottom-left у левого нижнего угла', () => {
		expect(snapZoneFromRelativePointer(5, H - 5, W, H, t)).toBe('bottom-left');
	});

	it('возвращает bottom-right у правого нижнего угла', () => {
		expect(snapZoneFromRelativePointer(W - 5, H - 5, W, H, t)).toBe(
			'bottom-right'
		);
	});

	it('возвращает left у левого края по центру по вертикали', () => {
		expect(snapZoneFromRelativePointer(5, H / 2, W, H, t)).toBe('left');
	});

	it('возвращает right у правого края по центру по вертикали', () => {
		expect(snapZoneFromRelativePointer(W - 5, H / 2, W, H, t)).toBe('right');
	});

	it('возвращает null в центре области', () => {
		expect(snapZoneFromRelativePointer(W / 2, H / 2, W, H, t)).toBe(null);
	});
});

describe('readDesktopWorkArea', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('берёт ширину из clientWidth корня и высоту до таскбара через layoutScale', () => {
		const main = document.createElement('div');
		main.id = 'desktop-main';
		document.body.appendChild(main);

		const zoom = document.createElement('div');
		zoom.setAttribute('data-desktop-ui-scale', '0.5');
		main.appendChild(zoom);

		const taskbar = document.createElement('div');
		taskbar.setAttribute('data-desktop-taskbar-strip', '');
		main.appendChild(taskbar);

		Object.defineProperty(zoom, 'clientWidth', {
			configurable: true,
			value: 1200,
		});
		stubGetBoundingClientRect(zoom, {
			left: 10,
			top: 20,
			width: 600,
			height: 400,
		});
		stubGetBoundingClientRect(taskbar, {
			left: 10,
			top: 420,
			width: 600,
			height: 40,
		});

		expect(readDesktopWorkArea()).toEqual({
			offsetLeft: 10,
			offsetTop: 20,
			width: 1200,
			height: 800,
			layoutScale: 0.5,
		});
	});

	it('без zoom-корня использует #desktop-main и layoutScale 1', () => {
		const main = document.createElement('div');
		main.id = 'desktop-main';
		document.body.appendChild(main);
		stubGetBoundingClientRect(main, {
			left: 0,
			top: 0,
			width: 1280,
			height: 900,
		});

		const taskbar = document.createElement('div');
		taskbar.setAttribute('data-desktop-taskbar-strip', '');
		main.appendChild(taskbar);
		stubGetBoundingClientRect(taskbar, {
			left: 0,
			top: 820,
			width: 1280,
			height: 46,
		});

		expect(readDesktopWorkArea()).toEqual({
			offsetLeft: 0,
			offsetTop: 0,
			width: 1280,
			height: 820,
			layoutScale: 1,
		});
	});

	it('без полосы задач уменьшает высоту на fallback высоты таскбара', () => {
		const main = document.createElement('div');
		main.id = 'desktop-main';
		document.body.appendChild(main);
		stubGetBoundingClientRect(main, {
			left: 0,
			top: 0,
			width: 1000,
			height: 700,
		});

		expect(readDesktopWorkArea()).toEqual({
			offsetLeft: 0,
			offsetTop: 0,
			width: 1000,
			height: Math.max(240, 700 - DESKTOP_LAYOUT.TASKBAR_HEIGHT_PX),
			layoutScale: 1,
		});
	});
});

describe('clientToDesktopLayoutCoords', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('переводит viewport в layout по offset и layoutScale', () => {
		const main = document.createElement('div');
		main.id = 'desktop-main';
		document.body.appendChild(main);
		const zoom = document.createElement('div');
		zoom.setAttribute('data-desktop-ui-scale', '0.5');
		main.appendChild(zoom);
		stubGetBoundingClientRect(zoom, {
			left: 100,
			top: 40,
			width: 400,
			height: 300,
		});

		expect(clientToDesktopLayoutCoords(100, 40)).toEqual({ x: 0, y: 0 });
		expect(clientToDesktopLayoutCoords(150, 90)).toEqual({ x: 100, y: 100 });
	});
});

describe('getSnapZoneForClientPosition', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('переводит clientX/Y через layoutScale в координаты слоя окон', () => {
		const main = document.createElement('div');
		main.id = 'desktop-main';
		document.body.appendChild(main);

		const zoom = document.createElement('div');
		zoom.setAttribute('data-desktop-ui-scale', '0.5');
		main.appendChild(zoom);

		const taskbar = document.createElement('div');
		taskbar.setAttribute('data-desktop-taskbar-strip', '');
		main.appendChild(taskbar);

		Object.defineProperty(zoom, 'clientWidth', {
			configurable: true,
			value: 1200,
		});
		stubGetBoundingClientRect(zoom, {
			left: 0,
			top: 0,
			width: 600,
			height: 400,
		});
		stubGetBoundingClientRect(taskbar, {
			left: 0,
			top: 400,
			width: 600,
			height: 40,
		});

		const t = SNAP_THRESHOLD_PX;
		expect(getSnapZoneForClientPosition(4, 4, t)).toBe('top-left');
		expect(getSnapZoneForClientPosition(8, 8, t)).toBe('top-left');
	});
});
