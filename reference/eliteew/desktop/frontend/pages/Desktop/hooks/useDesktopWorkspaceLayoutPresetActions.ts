/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Window layout preset + curated workspace layout actions for DesktopWorkspaceContent
 * (prompt state, apply/replace/add, tile visible windows, snap curated zones).
 *
 * Invariants:
 * - Extract-only from DesktopWorkspaceContent — behavior matches prior inline callbacks.
 * - Replace/add prompt uses shouldPromptDesktopWindowLayoutPresetApply only.
 *
 * Related:
 * - utils/applyDesktopWindowLayoutPresetWindows.ts
 * - constants/desktopCuratedWorkspaceLayoutTemplates.ts
 * - DesktopWorkspaceContent.tsx
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { notify as toast } from '@/notifications';
import { DEFAULT_APPS } from '../constants';
import {
	curatedLayoutZones,
	type CuratedWorkspaceLayoutTemplateId,
} from '../constants/desktopCuratedWorkspaceLayoutTemplates';
import type { DesktopWindowLayoutPreset } from '../types/desktopExpansion.types';
import type { SnapZoneConcrete } from '../constants/desktopCuratedWorkspaceLayoutTemplates';
import type { DesktopItem, WindowState } from '../types/desktop.types';
import {
	applyDesktopWindowLayoutPresetWindows,
	shouldPromptDesktopWindowLayoutPresetApply,
	type ApplyDesktopWindowLayoutPresetMode,
} from '../utils/applyDesktopWindowLayoutPresetWindows';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';
import { getDesktopWindowMinSize } from '../utils/desktopWindowMinSizeRegistry';
import type { OpenWindowOptions } from './useWindowManager';

export type UseDesktopWorkspaceLayoutPresetActionsParams = {
	currentDesktopWindows: readonly WindowState[];
	windows: readonly WindowState[];
	items: readonly DesktopItem[];
	installedApps: readonly DesktopItem[];
	activeDesktopId: string;
	handleOpenWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
	closeWindow: (windowId: string) => void;
	moveWindow: (windowId: string, x: number, y: number) => void;
	resizeWindow: (windowId: string, width: number, height: number) => void;
	bringWindowsIntoWorkArea: (predicate: (win: WindowState) => boolean) => void;
	getWindowsOnDesktop: (desktopId: string) => string[];
	snapWindow: (windowId: string, zone: SnapZoneConcrete) => void;
};

export type UseDesktopWorkspaceLayoutPresetActionsResult = {
	layoutPresetApplyPrompt: DesktopWindowLayoutPreset | null;
	setLayoutPresetApplyPrompt: React.Dispatch<
		React.SetStateAction<DesktopWindowLayoutPreset | null>
	>;
	executeApplyWindowLayoutPreset: (
		preset: DesktopWindowLayoutPreset,
		mode: ApplyDesktopWindowLayoutPresetMode
	) => void;
	applyWindowLayoutPreset: (preset: DesktopWindowLayoutPreset) => void;
	collectCurrentWorkspaceWindows: () => void;
	bringWindowIntoWorkAreaById: (windowId: string) => void;
	applyCuratedWorkspaceLayout: (
		templateId: CuratedWorkspaceLayoutTemplateId
	) => void;
};

export function useDesktopWorkspaceLayoutPresetActions(
	params: UseDesktopWorkspaceLayoutPresetActionsParams
): UseDesktopWorkspaceLayoutPresetActionsResult {
	const {
		currentDesktopWindows,
		windows,
		items,
		installedApps,
		activeDesktopId,
		handleOpenWindow,
		closeWindow,
		moveWindow,
		resizeWindow,
		bringWindowsIntoWorkArea,
		getWindowsOnDesktop,
		snapWindow,
	} = params;
	const { t } = useTranslation('desktopUi');

	const [layoutPresetApplyPrompt, setLayoutPresetApplyPrompt] =
		React.useState<DesktopWindowLayoutPreset | null>(null);

	const executeApplyWindowLayoutPreset = React.useCallback(
		(
			preset: DesktopWindowLayoutPreset,
			mode: ApplyDesktopWindowLayoutPresetMode
		) => {
			const result = applyDesktopWindowLayoutPresetWindows({
				preset,
				catalog: [...installedApps, ...items, ...DEFAULT_APPS],
				openWindow: handleOpenWindow,
				mode,
				closeWindow,
				currentDesktopWindowIds: currentDesktopWindows.map((w) => w.id),
			});
			if (result.openedCount === 0 && result.skippedCount > 0) {
				toast.info(t('settingsPanel.expansionLayoutApplyNoneResolved'));
			}
		},
		[
			closeWindow,
			currentDesktopWindows,
			handleOpenWindow,
			installedApps,
			items,
			t,
		]
	);

	const applyWindowLayoutPreset = React.useCallback(
		(preset: DesktopWindowLayoutPreset) => {
			if (
				shouldPromptDesktopWindowLayoutPresetApply(currentDesktopWindows.length)
			) {
				setLayoutPresetApplyPrompt(preset);
				return;
			}
			executeApplyWindowLayoutPreset(preset, 'add');
		},
		[currentDesktopWindows.length, executeApplyWindowLayoutPreset]
	);

	const collectCurrentWorkspaceWindows = React.useCallback(() => {
		const visibleWindows = currentDesktopWindows.filter((w) => !w.isMinimized);
		if (visibleWindows.length === 0) return;
		const wa = readDesktopWorkArea();
		const margin = 24;
		const gapX = 16;
		const gapY = 16;
		const list = visibleWindows.slice(0, 8);
		const rows = Math.ceil(list.length / 2);
		const innerW = Math.max(0, wa.width - margin * 2 - gapX);
		const colW = Math.floor(innerW / 2);
		const innerH = Math.max(
			0,
			wa.height - margin * 2 - (rows > 1 ? gapY * (rows - 1) : 0)
		);
		const rowH = rows > 0 ? Math.floor(innerH / rows) : wa.height;
		const ids = new Set<string>();
		list.forEach((w, index) => {
			const minSz = getDesktopWindowMinSize(w);
			const column = index % 2;
			const row = Math.floor(index / 2);
			const rawW = Math.max(minSz.minWidth, colW);
			const rawH = Math.max(minSz.minHeight, rowH);
			const width = Math.min(rawW, wa.width - margin * 2);
			const height = Math.min(rawH, wa.height - margin * 2);
			const x = margin + column * (colW + gapX);
			const y = margin + row * (rowH + gapY);
			ids.add(w.id);
			resizeWindow(w.id, width, height);
			moveWindow(w.id, x, y);
		});
		bringWindowsIntoWorkArea((win) => ids.has(win.id));
	}, [
		currentDesktopWindows,
		moveWindow,
		resizeWindow,
		bringWindowsIntoWorkArea,
	]);

	const bringWindowIntoWorkAreaById = React.useCallback(
		(windowId: string) => {
			bringWindowsIntoWorkArea((w) => w.id === windowId);
		},
		[bringWindowsIntoWorkArea]
	);

	const applyCuratedWorkspaceLayout = React.useCallback(
		(templateId: CuratedWorkspaceLayoutTemplateId) => {
			const zones = curatedLayoutZones(templateId);
			if (zones.length === 0) return;
			const ids = getWindowsOnDesktop(activeDesktopId);
			const ordered = ids
				.map((id) => windows.find((w) => w.id === id))
				.filter((w): w is WindowState => w != null && !w.isMinimized)
				.sort((a, b) => b.zIndex - a.zIndex);
			if (ordered.length === 0) {
				toast.info(t('settingsPanel.expansionCuratedLayoutNoWindows'));
				return;
			}
			const limit = Math.min(ordered.length, zones.length);
			for (let i = 0; i < limit; i++) {
				snapWindow(ordered[i].id, zones[i]);
			}
		},
		[activeDesktopId, getWindowsOnDesktop, snapWindow, windows, t]
	);

	return {
		layoutPresetApplyPrompt,
		setLayoutPresetApplyPrompt,
		executeApplyWindowLayoutPreset,
		applyWindowLayoutPreset,
		collectCurrentWorkspaceWindows,
		bringWindowIntoWorkAreaById,
		applyCuratedWorkspaceLayout,
	};
}
