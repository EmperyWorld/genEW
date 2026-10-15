import { describe, expect, it } from 'vitest';
import type { DesktopItem } from '../types/desktop.types';
import {
	compareDesktopRootByDateDesc,
	compareDesktopRootByGridPosition,
	compareDesktopRootByName,
	compareDesktopRootByPinnedThenName,
	compareDesktopRootByTypeThenFileSizeDesc,
	compareDesktopRootByTypeThenName,
	desktopItemTimeMs,
	layoutRootIconsOnGrid,
} from './desktopRootSort';

function item(
	partial: Pick<DesktopItem, 'id' | 'name' | 'type'> & Partial<DesktopItem>
): DesktopItem {
	return {
		position: { x: 0, y: 0 },
		...partial,
	};
}

describe('desktopItemTimeMs', () => {
	it('returns 0 when no timestamps', () => {
		expect(desktopItemTimeMs(item({ id: '1', name: 'a', type: 'app' }))).toBe(
			0
		);
	});

	it('parses created_at ISO string', () => {
		const t = '2024-01-15T12:00:00.000Z';
		expect(
			desktopItemTimeMs(
				item({ id: '1', name: 'a', type: 'file', created_at: t })
			)
		).toBe(Date.parse(t));
	});
});

describe('compareDesktopRootByName', () => {
	it('sorts lexicographically with numeric awareness', () => {
		const a = item({ id: 'a', name: 'file2', type: 'file' });
		const b = item({ id: 'b', name: 'file10', type: 'file' });
		expect(compareDesktopRootByName(a, b)).toBeLessThan(0);
	});
});

describe('compareDesktopRootByTypeThenName', () => {
	it('orders folder before file', () => {
		const f = item({ id: '1', name: 'z', type: 'folder' });
		const g = item({ id: '2', name: 'a', type: 'file' });
		expect(compareDesktopRootByTypeThenName(f, g)).toBeLessThan(0);
	});
});

describe('compareDesktopRootByDateDesc', () => {
	it('places newer created_at first', () => {
		const older = item({
			id: '1',
			name: 'a',
			type: 'file',
			created_at: '2020-01-01T00:00:00.000Z',
		});
		const newer = item({
			id: '2',
			name: 'b',
			type: 'file',
			created_at: '2025-01-01T00:00:00.000Z',
		});
		expect(compareDesktopRootByDateDesc(older, newer)).toBeGreaterThan(0);
	});
});

describe('compareDesktopRootByTypeThenFileSizeDesc', () => {
	it('among files, larger size comes first', () => {
		const small = item({
			id: '1',
			name: 'a',
			type: 'file',
			size: 10,
		});
		const big = item({
			id: '2',
			name: 'b',
			type: 'file',
			size: 100,
		});
		expect(
			compareDesktopRootByTypeThenFileSizeDesc(small, big)
		).toBeGreaterThan(0);
	});

	it('still groups folder before file', () => {
		const folder = item({ id: '1', name: 'z', type: 'folder' });
		const file = item({ id: '2', name: 'a', type: 'file', size: 99999 });
		expect(compareDesktopRootByTypeThenFileSizeDesc(folder, file)).toBeLessThan(
			0
		);
	});
});

describe('compareDesktopRootByGridPosition', () => {
	it('orders by y then x then name', () => {
		const top = item({
			id: '1',
			name: 'b',
			type: 'app',
			position: { x: 100, y: 0 },
		});
		const bottomLeft = item({
			id: '2',
			name: 'a',
			type: 'app',
			position: { x: 0, y: 100 },
		});
		expect(compareDesktopRootByGridPosition(top, bottomLeft)).toBeLessThan(0);
		const sameRowLeft = item({
			id: '3',
			name: 'z',
			type: 'app',
			position: { x: 0, y: 0 },
		});
		const sameRowRight = item({
			id: '4',
			name: 'a',
			type: 'app',
			position: { x: 50, y: 0 },
		});
		expect(
			compareDesktopRootByGridPosition(sameRowLeft, sameRowRight)
		).toBeLessThan(0);
	});
});

describe('compareDesktopRootByPinnedThenName', () => {
	it('places pinned first', () => {
		const unpinned = item({
			id: '1',
			name: 'a',
			type: 'app',
			isPinned: false,
		});
		const pinned = item({
			id: '2',
			name: 'z',
			type: 'app',
			isPinned: true,
		});
		expect(
			compareDesktopRootByPinnedThenName(unpinned, pinned)
		).toBeGreaterThan(0);
	});
});

describe('layoutRootIconsOnGrid', () => {
	it('assigns column-major positions', () => {
		const root = [
			item({ id: '1', name: 'a', type: 'app' }),
			item({ id: '2', name: 'b', type: 'app' }),
			item({ id: '3', name: 'c', type: 'app' }),
		];
		const gridSize = 95;
		const offset = 20;
		const viewport = 160 + gridSize * 2 + 1;
		const originalInnerHeight = window.innerHeight;
		Object.defineProperty(window, 'innerHeight', {
			configurable: true,
			value: viewport,
		});
		try {
			const laid = layoutRootIconsOnGrid(root, 'medium');
			expect(laid[0]?.position).toEqual({ x: offset, y: offset });
			expect(laid[1]?.position).toEqual({ x: offset, y: offset + gridSize });
			expect(laid[2]?.position).toEqual({
				x: offset + gridSize,
				y: offset,
			});
		} finally {
			Object.defineProperty(window, 'innerHeight', {
				configurable: true,
				value: originalInnerHeight,
			});
		}
	});
});
