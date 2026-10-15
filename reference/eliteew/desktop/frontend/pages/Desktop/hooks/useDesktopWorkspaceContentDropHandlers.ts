/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T33 drop-handler cluster for desktop workspace canvas: content-manager drag onto
 * background/folders and nested desktop item drag-to-root/folder wiring.
 *
 * Invariants:
 * - Mutations go only through commitItems / item-operation callbacks from the host.
 * - No remapping of drag MIME contracts; delegates to desktopExternalContentDrop utils.
 *
 * Related:
 * - DesktopWorkspaceContent.tsx
 * - utils/desktopExternalContentDrop.ts
 * - utils/desktopNestedItemDrag.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import * as React from 'react';
import type { TFunction } from 'i18next';
import type { GridStepPreference, IconSizePreference } from '../constants';
import type { DesktopItem } from '../types/desktop.types';
import {
	appendUnifiedContentShortcutsToDesktopItems,
	computeDesktopIconDropLayoutPosition,
	hydrateContentDragPayload,
} from '../utils/desktopExternalContentDrop';
import {
	dataTransferHasDesktopNestedItemDrag,
	parseDesktopNestedItemDragIds,
} from '../utils/desktopNestedItemDrag';
import { relocateNestedDesktopItemsToRootAtPosition } from '../utils/desktopNestedItemDrop';
import {
	dataTransferHasContentDrag,
	parseContentDragPayloadFromDataTransfer,
} from '@/pages/ContentManager/utils/contentManagerDrag';

type CommitItems = (
	updater: DesktopItem[] | ((prev: DesktopItem[]) => DesktopItem[])
) => void;

type DesktopToastApi = {
	info: (title: string, message?: string) => unknown;
};

export type UseDesktopWorkspaceContentDropHandlersParams = {
	items: DesktopItem[];
	iconSize: IconSizePreference;
	gridStep: GridStepPreference;
	commitItems: CommitItems;
	desktopToast: DesktopToastApi;
	t: TFunction<'desktopUi'>;
	liftDesktopItemsToRoot: (ids: string[]) => void;
	moveDesktopNestedItemsToFolder: (ids: string[], folderId: string) => void;
};

export type UseDesktopWorkspaceContentDropHandlersReturn = {
	onBackgroundContentDragOver: (e: React.DragEvent) => void;
	onBackgroundContentDrop: (e: React.DragEvent) => void;
	onExternalContentDropToFolder: (e: React.DragEvent, folderId: string) => void;
};

export function useDesktopWorkspaceContentDropHandlers(
	params: UseDesktopWorkspaceContentDropHandlersParams
): UseDesktopWorkspaceContentDropHandlersReturn {
	const {
		items,
		iconSize,
		gridStep,
		commitItems,
		desktopToast,
		t,
		liftDesktopItemsToRoot,
		moveDesktopNestedItemsToFolder,
	} = params;

	const applyUnifiedContentDropFromDrag = React.useCallback(
		async (e: React.DragEvent, parentId: string | undefined) => {
			if (!dataTransferHasContentDrag(e.dataTransfer)) return;
			const raw = parseContentDragPayloadFromDataTransfer(e.dataTransfer);
			if (!raw) {
				e.preventDefault();
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			const hydrated = await hydrateContentDragPayload(raw);
			const pos = computeDesktopIconDropLayoutPosition(
				e.clientX,
				e.clientY,
				iconSize
			);
			if (!pos) {
				void desktopToast.info(
					t('workspace.contentDropLayoutError'),
					t('workspace.contentDropLayoutErrorDesc')
				);
				return;
			}
			const next = appendUnifiedContentShortcutsToDesktopItems(
				items,
				hydrated,
				pos,
				gridStep,
				iconSize,
				parentId
			);
			if (next === items) {
				void desktopToast.info(
					t('workspace.contentDropNothingNew'),
					t('workspace.contentDropNothingNewDesc')
				);
			} else {
				commitItems(next);
			}
		},
		[items, iconSize, gridStep, commitItems, desktopToast, t]
	);

	const applyNestedItemDropToDesktopRoot = React.useCallback(
		(e: React.DragEvent): boolean => {
			if (!dataTransferHasDesktopNestedItemDrag(e.dataTransfer)) return false;
			const ids = parseDesktopNestedItemDragIds(e.dataTransfer);
			if (ids.length === 0) return false;
			e.preventDefault();
			e.stopPropagation();
			const pos = computeDesktopIconDropLayoutPosition(
				e.clientX,
				e.clientY,
				iconSize
			);
			if (!pos) {
				liftDesktopItemsToRoot(ids);
				return true;
			}
			commitItems((prev) =>
				relocateNestedDesktopItemsToRootAtPosition(
					prev,
					ids,
					pos,
					gridStep,
					iconSize
				)
			);
			return true;
		},
		[commitItems, gridStep, iconSize, liftDesktopItemsToRoot]
	);

	const onBackgroundContentDragOver = React.useCallback(
		(e: React.DragEvent) => {
			if (dataTransferHasContentDrag(e.dataTransfer)) {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'copy';
				return;
			}
			if (dataTransferHasDesktopNestedItemDrag(e.dataTransfer)) {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
			}
		},
		[]
	);

	const onBackgroundContentDrop = React.useCallback(
		(e: React.DragEvent) => {
			if (applyNestedItemDropToDesktopRoot(e)) return;
			void applyUnifiedContentDropFromDrag(e, undefined);
		},
		[applyNestedItemDropToDesktopRoot, applyUnifiedContentDropFromDrag]
	);

	const onExternalContentDropToFolder = React.useCallback(
		(e: React.DragEvent, folderId: string) => {
			if (dataTransferHasDesktopNestedItemDrag(e.dataTransfer)) {
				const ids = parseDesktopNestedItemDragIds(e.dataTransfer);
				if (ids.length > 0) {
					e.preventDefault();
					e.stopPropagation();
					moveDesktopNestedItemsToFolder(ids, folderId);
					return;
				}
			}
			void applyUnifiedContentDropFromDrag(e, folderId);
		},
		[applyUnifiedContentDropFromDrag, moveDesktopNestedItemsToFolder]
	);

	return {
		onBackgroundContentDragOver,
		onBackgroundContentDrop,
		onExternalContentDropToFolder,
	};
}
