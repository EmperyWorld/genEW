/**
 * Drop unified content from Content Manager (HTML5 drag) onto the desktop grid.
 */

import type {
	ContentDragEntry,
	ContentDragPayload,
} from '@/pages/ContentManager/utils/contentManagerDrag';
import { contentApi } from '@/services/contentApi';
import {
	DESKTOP_GRID,
	DESKTOP_GRID_STEPS,
	DESKTOP_ICON_SIZES,
	type GridStepPreference,
	type IconSizePreference,
} from '../constants';
import type { DesktopItem } from '../types/desktop.types';
import { findNearestFreePosition, snapToGrid } from './desktopGrid';
import { readDesktopWorkArea } from './desktopSnapGeometry';

const EXCLUDE_NONE = '__desktop_extdrop_exclude__';

export function computeDesktopIconDropLayoutPosition(
	clientX: number,
	clientY: number,
	iconSize: IconSizePreference
): { x: number; y: number } | null {
	if (typeof document === 'undefined') return null;
	const main = document.getElementById('desktop-main');
	const zoomRoot = main?.querySelector<HTMLElement>('[data-desktop-ui-scale]');
	const parent = zoomRoot ?? main;
	if (!parent) return null;
	const wa = readDesktopWorkArea();
	const s = wa.layoutScale > 0 ? wa.layoutScale : 1;
	const pr = parent.getBoundingClientRect();
	const iconMetrics = DESKTOP_ICON_SIZES[iconSize] ?? DESKTOP_ICON_SIZES.medium;
	const x = (clientX - pr.left) / s - iconMetrics.width / 2;
	const y = (clientY - pr.top) / s - iconMetrics.height / 2;
	return { x, y };
}

export async function hydrateContentDragPayload(
	payload: ContentDragPayload
): Promise<ContentDragPayload> {
	const fromPayload = new Map((payload.items ?? []).map((e) => [e.id, e]));
	const items: ContentDragEntry[] = await Promise.all(
		payload.ids.map(async (id) => {
			const existing = fromPayload.get(id);
			if (existing?.name.trim() && existing.name !== id) {
				return existing;
			}
			try {
				const row = await contentApi.getContent(id);
				return {
					id,
					name: row.title?.trim() || row.name?.trim() || id,
					content_type: row.content_type ?? null,
				};
			} catch {
				return {
					id,
					name: existing?.name?.trim() || id,
					content_type: existing?.content_type ?? null,
				};
			}
		})
	);
	return { ids: payload.ids, items };
}

export function appendUnifiedContentShortcutsToDesktopItems(
	currentItems: DesktopItem[],
	payload: ContentDragPayload,
	dropLayoutPoint: { x: number; y: number },
	gridStepKey: GridStepPreference,
	iconSize: IconSizePreference,
	parentId: string | undefined
): DesktopItem[] {
	const gridSize = DESKTOP_GRID_STEPS[gridStepKey];
	const wa = readDesktopWorkArea();
	const iconMetrics = DESKTOP_ICON_SIZES[iconSize] ?? DESKTOP_ICON_SIZES.medium;
	const layoutMax = {
		maxX: Math.max(DESKTOP_GRID.OFFSET, wa.width - iconMetrics.width),
		maxY: Math.max(DESKTOP_GRID.OFFSET, wa.height - iconMetrics.height),
	};
	const metaById = new Map((payload.items ?? []).map((it) => [it.id, it]));
	let working = [...currentItems];
	const toAppend: DesktopItem[] = [];
	const parentKey = parentId ?? '';

	for (const id of payload.ids) {
		if (
			working.some(
				(i) =>
					i.type === 'file' && i.id === id && (i.parentId ?? '') === parentKey
			)
		) {
			continue;
		}
		const entry = metaById.get(id) ?? { id, name: id, content_type: null };
		const rawPos = findNearestFreePosition(
			working,
			EXCLUDE_NONE,
			dropLayoutPoint.x,
			dropLayoutPoint.y,
			gridSize,
			DESKTOP_GRID.OFFSET,
			layoutMax
		);
		const snapped = snapToGrid(
			rawPos.x,
			rawPos.y,
			gridSize,
			DESKTOP_GRID.OFFSET,
			layoutMax
		);
		const fileItem: DesktopItem = {
			id: entry.id,
			name: entry.name,
			type: 'file',
			position: snapped,
			fileType: entry.content_type ?? undefined,
			parentId,
		};
		toAppend.push(fileItem);
		working = [...working, fileItem];
	}

	if (toAppend.length === 0) return currentItems;
	return [...currentItems, ...toAppend];
}
