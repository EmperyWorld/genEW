import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { log } from '../../../utils/logger';
import {
	DESKTOP_GRID,
	DESKTOP_GRID_STEPS,
	DESKTOP_ICON_SIZES,
} from '../constants';
import { coerceDesktopSelectionSet } from '../context/DesktopStateContext';
import type { ContextMenuState, DesktopItem } from '../types/desktop.types';
import { filterVisibleDesktopItems } from '../utils/desktopAppRegistry';
import { collectDesktopMoveIntoFolderIds } from '../utils/desktopItemTree';
import { sanitizeStackedDesktopIconPositions } from '../utils/desktopIconPositionSanitizer';
import {
	findNearestFreeGroupDelta,
	findNearestFreePosition,
	snapToGrid as snapToGridPosition,
} from '../utils/desktopGrid';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';
import { getContextMenuPositionFromCursor } from '../utils/desktopUi';

const DESKTOP_ICONS_REFLOW_TOAST_SESSION_KEY =
	'eliteew.desktop.icons-reflow-toast-shown';

export type DesktopWorkspaceGroupDragState = {
	anchorId: string;
	startPositions: Record<string, { x: number; y: number }>;
	delta: { dx: number; dy: number };
};

function escapeDesktopIconSelectorId(itemId: string): string {
	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
		return CSS.escape(itemId);
	}
	return itemId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function queryDesktopIconWrapper(itemId: string): HTMLElement | null {
	return document.querySelector(
		`[data-desktop-icon-id="${escapeDesktopIconSelectorId(itemId)}"]`
	);
}

/** Sibling preview during multi-select drag — DOM transform only (no React remap). */
function applyGroupSiblingDragPreview(
	state: DesktopWorkspaceGroupDragState,
	dx: number,
	dy: number
): void {
	for (const id of Object.keys(state.startPositions)) {
		if (id === state.anchorId) continue;
		const el = queryDesktopIconWrapper(id);
		if (!el) continue;
		el.style.willChange = 'transform';
		el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
	}
}

function clearGroupSiblingDragPreview(
	state: DesktopWorkspaceGroupDragState
): void {
	for (const id of Object.keys(state.startPositions)) {
		if (id === state.anchorId) continue;
		const el = queryDesktopIconWrapper(id);
		if (!el) continue;
		el.style.transform = '';
		el.style.willChange = '';
	}
}

export type UseDesktopWorkspaceIconInteractionsParams = {
	items: DesktopItem[];
	installedAppIds: ReadonlySet<string>;
	desktopAreaRef: React.RefObject<HTMLElement | null>;
	iconSize: 'small' | 'medium' | 'large';
	gridStepKey: 'small' | 'medium' | 'large';
	commitItems: (
		updater: DesktopItem[] | ((prev: DesktopItem[]) => DesktopItem[])
	) => void;
	updateItemPosition: (
		itemId: string,
		position: { x: number; y: number }
	) => void;
	selected: Set<string>;
	setSelected: (
		updater: Set<string> | ((prev: Set<string>) => Set<string>)
	) => void;
	selectedSyncRef: React.MutableRefObject<Set<string>>;
	setIsDraggingIcon: (value: boolean) => void;
	setRenamingId: (id: string | null) => void;
	clipboard: DesktopItem[];
	clipboardAction: 'copy' | 'cut' | null;
	setCtx: (
		updater: ContextMenuState | ((prev: ContextMenuState) => ContextMenuState)
	) => void;
	setContextMenuType: (
		type: 'desktop' | 'folder' | 'file' | 'app' | 'window'
	) => void;
	setContextMenuPosition: (pos: { x: number; y: number }) => void;
	setShowEnhancedContextMenu: (open: boolean) => void;
};

export function useDesktopWorkspaceIconInteractions(
	deps: UseDesktopWorkspaceIconInteractionsParams
) {
	const {
		items,
		installedAppIds,
		desktopAreaRef,
		iconSize,
		gridStepKey,
		commitItems,
		updateItemPosition,
		selected,
		setSelected,
		selectedSyncRef,
		setIsDraggingIcon,
		setRenamingId,
		clipboard,
		clipboardAction,
		setCtx,
		setContextMenuType,
		setContextMenuPosition,
		setShowEnhancedContextMenu,
	} = deps;

	const { t } = useTranslation('desktopUi');

	const [groupDragState, setGroupDragState] =
		useState<DesktopWorkspaceGroupDragState | null>(null);
	/** Согласование с состоянием группового перетаскивания до commit React: `mouseup` на window живёт со старым замыканием. */
	const groupDragStateRef = React.useRef<DesktopWorkspaceGroupDragState | null>(
		null
	);
	/** Skip re-sanitize after a successful hydrate pass for the current items fingerprint. */
	const iconHydrateSanitizeFingerprintRef = useRef<string | null>(null);

	const getIconLayoutMax = useCallback(() => {
		const wa = readDesktopWorkArea();
		const iconMetrics =
			DESKTOP_ICON_SIZES[iconSize] ?? DESKTOP_ICON_SIZES.medium;
		return {
			maxX: Math.max(DESKTOP_GRID.OFFSET, wa.width - iconMetrics.width),
			maxY: Math.max(DESKTOP_GRID.OFFSET, wa.height - iconMetrics.height),
		};
	}, [iconSize]);

	useEffect(() => {
		if (items.length === 0 || groupDragStateRef.current) {
			return;
		}
		const fingerprint = items
			.map((item) => `${item.id}:${item.position.x},${item.position.y}`)
			.join('|');
		if (iconHydrateSanitizeFingerprintRef.current === fingerprint) {
			return;
		}

		const {
			items: sanitized,
			changed,
			changedItemIds,
		} = sanitizeStackedDesktopIconPositions({
			items,
			gridStepKey,
			installedAppIds,
			layoutMax: getIconLayoutMax(),
		});
		if (!changed) {
			iconHydrateSanitizeFingerprintRef.current = fingerprint;
			return;
		}

		commitItems(sanitized);
		for (const itemId of changedItemIds) {
			const next = sanitized.find((entry) => entry.id === itemId);
			if (next) {
				void updateItemPosition(itemId, next.position);
			}
		}
		if (typeof window !== 'undefined') {
			try {
				if (
					!window.sessionStorage.getItem(DESKTOP_ICONS_REFLOW_TOAST_SESSION_KEY)
				) {
					window.sessionStorage.setItem(
						DESKTOP_ICONS_REFLOW_TOAST_SESSION_KEY,
						'1'
					);
					toast.info(t('workspace.iconsReflowOnHydrateToast'));
				}
			} catch {
				/* sessionStorage unavailable */
			}
		}
	}, [
		commitItems,
		getIconLayoutMax,
		gridStepKey,
		installedAppIds,
		items,
		t,
		updateItemPosition,
	]);

	const getGroupDragBounds = useCallback(
		(startPositions: Record<string, { x: number; y: number }>) => {
			const positions = Object.values(startPositions);
			if (positions.length === 0) {
				return {
					minDx: Number.NEGATIVE_INFINITY,
					maxDx: Number.POSITIVE_INFINITY,
					minDy: Number.NEGATIVE_INFINITY,
					maxDy: Number.POSITIVE_INFINITY,
				};
			}
			const iconMetrics =
				DESKTOP_ICON_SIZES[iconSize] ?? DESKTOP_ICON_SIZES.medium;
			const wa = typeof document !== 'undefined' ? readDesktopWorkArea() : null;
			const desktopRect = desktopAreaRef.current?.getBoundingClientRect();
			const desktopWidth = wa?.width ?? desktopRect?.width ?? window.innerWidth;
			const desktopHeight =
				wa?.height ??
				Math.max(
					iconMetrics.height,
					(desktopRect?.height ?? window.innerHeight) - 56
				);
			const minX = Math.min(...positions.map((position) => position.x));
			const minY = Math.min(...positions.map((position) => position.y));
			const maxX = Math.max(...positions.map((position) => position.x));
			const maxY = Math.max(...positions.map((position) => position.y));

			return {
				minDx: DESKTOP_GRID.OFFSET - minX,
				minDy: DESKTOP_GRID.OFFSET - minY,
				maxDx: desktopWidth - iconMetrics.width - maxX,
				maxDy: desktopHeight - iconMetrics.height - maxY,
			};
		},
		[desktopAreaRef, iconSize]
	);

	const clampGroupDragDelta = useCallback(
		(
			startPositions: Record<string, { x: number; y: number }>,
			proposedDx: number,
			proposedDy: number
		) => {
			const bounds = getGroupDragBounds(startPositions);
			if (!Number.isFinite(bounds.minDx)) {
				return { dx: proposedDx, dy: proposedDy };
			}

			return {
				dx: Math.max(bounds.minDx, Math.min(bounds.maxDx, proposedDx)),
				dy: Math.max(bounds.minDy, Math.min(bounds.maxDy, proposedDy)),
			};
		},
		[getGroupDragBounds]
	);

	// Positions stay in React at rest; group-drag siblings move via DOM translate3d
	// (see applyGroupSiblingDragPreview) so mousemove does not remap displayItems.
	const displayItems = useMemo(
		() => filterVisibleDesktopItems(items, installedAppIds),
		[items, installedAppIds]
	);

	const handleDragStart = useCallback(
		(itemId: string) => {
			setIsDraggingIcon(true);
			if (!selected.has(itemId) || selected.size < 2) {
				groupDragStateRef.current = null;
				setGroupDragState(null);
				return;
			}
			const selectedRootItems = items.filter(
				(item) => !item.parentId && selected.has(item.id)
			);
			if (selectedRootItems.length < 2) {
				groupDragStateRef.current = null;
				setGroupDragState(null);
				return;
			}
			const next: DesktopWorkspaceGroupDragState = {
				anchorId: itemId,
				startPositions: Object.fromEntries(
					selectedRootItems.map((item) => [
						item.id,
						{ x: item.position.x, y: item.position.y },
					])
				),
				delta: { dx: 0, dy: 0 },
			};
			groupDragStateRef.current = next;
			setGroupDragState(next);
		},
		[items, selected, setIsDraggingIcon]
	);

	const handleDrag = useCallback(
		(itemId: string, x: number, y: number) => {
			const prev = groupDragStateRef.current;
			if (!prev || prev.anchorId !== itemId) {
				return;
			}
			const anchorStart = prev.startPositions[itemId];
			if (!anchorStart) {
				return;
			}
			const clampedDelta = clampGroupDragDelta(
				prev.startPositions,
				x - anchorStart.x,
				y - anchorStart.y
			);
			if (
				prev.delta.dx === clampedDelta.dx &&
				prev.delta.dy === clampedDelta.dy
			) {
				return;
			}
			const next: DesktopWorkspaceGroupDragState = {
				...prev,
				delta: clampedDelta,
			};
			groupDragStateRef.current = next;
			applyGroupSiblingDragPreview(next, clampedDelta.dx, clampedDelta.dy);
			// No setGroupDragState here — React remap of every icon each frame was the drag lag.
		},
		[clampGroupDragDelta]
	);

	const handleUpdatePosition = useCallback(
		(itemId: string, x: number, y: number) => {
			const current = items.find((i) => i.id === itemId);
			if (!current) {
				return;
			}

			// Коллизии считаем только по видимым root-элементам рабочего стола,
			// чтобы элементы внутри папок и невидимые приложения не блокировали сетку.
			const collisionItems = items.filter(
				(i) => !i.parentId && (i.type !== 'app' || installedAppIds.has(i.id))
			);

			const gridStepPx = DESKTOP_GRID_STEPS[gridStepKey];
			const layoutMax = getIconLayoutMax();
			const snapped = snapToGridPosition(
				x,
				y,
				gridStepPx,
				DESKTOP_GRID.OFFSET,
				layoutMax
			);
			const final = findNearestFreePosition(
				collisionItems,
				itemId,
				snapped.x,
				snapped.y,
				gridStepPx,
				DESKTOP_GRID.OFFSET,
				layoutMax
			);
			void updateItemPosition(itemId, final);
		},
		[getIconLayoutMax, gridStepKey, installedAppIds, items, updateItemPosition]
	);

	const handleDragEnd = useCallback(
		(
			itemId: string,
			x: number,
			y: number,
			opts?: { droppedOnFolder?: boolean; cancelled?: boolean }
		) => {
			if (opts?.droppedOnFolder) {
				const active = groupDragStateRef.current;
				if (active) clearGroupSiblingDragPreview(active);
				groupDragStateRef.current = null;
				setGroupDragState(null);
				return;
			}
			if (opts?.cancelled) {
				const active = groupDragStateRef.current;
				if (active) clearGroupSiblingDragPreview(active);
				groupDragStateRef.current = null;
				setGroupDragState(null);
				return;
			}
			const activeGroupDragState =
				groupDragStateRef.current?.anchorId === itemId
					? groupDragStateRef.current
					: null;
			if (activeGroupDragState) {
				clearGroupSiblingDragPreview(activeGroupDragState);
			}
			groupDragStateRef.current = null;
			setGroupDragState(null);
			if (!activeGroupDragState) {
				handleUpdatePosition(itemId, x, y);
				return;
			}

			const anchorStart = activeGroupDragState.startPositions[itemId];
			if (!anchorStart) {
				handleUpdatePosition(itemId, x, y);
				return;
			}

			const gridStepPx = DESKTOP_GRID_STEPS[gridStepKey];
			const collisionItems = items.filter(
				(item) =>
					!item.parentId &&
					!activeGroupDragState.startPositions[item.id] &&
					(item.type !== 'app' || installedAppIds.has(item.id))
			);
			const boundedPreviewDelta = clampGroupDragDelta(
				activeGroupDragState.startPositions,
				x - anchorStart.x,
				y - anchorStart.y
			);
			const bounds = getGroupDragBounds(activeGroupDragState.startPositions);
			const resolvedGroupDelta = findNearestFreeGroupDelta(
				activeGroupDragState.startPositions,
				collisionItems,
				boundedPreviewDelta.dx,
				boundedPreviewDelta.dy,
				{
					gridSize: gridStepPx,
					offset: DESKTOP_GRID.OFFSET,
					minDx: bounds.minDx,
					maxDx: bounds.maxDx,
					minDy: bounds.minDy,
					maxDy: bounds.maxDy,
				}
			);
			const dx = resolvedGroupDelta.dx;
			const dy = resolvedGroupDelta.dy;
			const nextItems = items.map((item) => {
				const startPosition = activeGroupDragState.startPositions[item.id];
				if (!startPosition) {
					return item;
				}
				return {
					...item,
					position: {
						x: startPosition.x + dx,
						y: startPosition.y + dy,
					},
				};
			});
			commitItems(nextItems);
		},
		[
			clampGroupDragDelta,
			commitItems,
			gridStepKey,
			getGroupDragBounds,
			handleUpdatePosition,
			installedAppIds,
			items,
		]
	);

	const handleDesktopIconSelect = useCallback(
		(e: React.MouseEvent, item: DesktopItem) => {
			const sel = coerceDesktopSelectionSet(selectedSyncRef.current);
			if (e.ctrlKey || e.metaKey) {
				setSelected((prev) => {
					const next = new Set(coerceDesktopSelectionSet(prev));
					if (next.has(item.id)) next.delete(item.id);
					else next.add(item.id);
					return next;
				});
			} else if (e.shiftKey && sel.size > 0) {
				const itemIds = displayItems.map((i) => i.id);
				const lastSelected = Array.from(sel).pop();
				const lastIdx = itemIds.indexOf(lastSelected || '');
				const currentIdx = itemIds.indexOf(item.id);
				const [start, end] =
					lastIdx < currentIdx ? [lastIdx, currentIdx] : [currentIdx, lastIdx];
				const range = itemIds.slice(start, end + 1);
				setSelected(new Set([...sel, ...range]));
			} else {
				setSelected(new Set([item.id]));
			}
		},
		[displayItems, selectedSyncRef, setSelected]
	);

	const handleDesktopIconDragEnd = useCallback(
		(
			itemId: string,
			x: number,
			y: number,
			opts?: { droppedOnFolder?: boolean; cancelled?: boolean }
		) => {
			setIsDraggingIcon(false);
			handleDragEnd(itemId, x, y, opts);
		},
		[setIsDraggingIcon, handleDragEnd]
	);

	const handleDesktopIconRename = useCallback(
		(itemId: string, newName: string) => {
			const updated = items.map((i) =>
				i.id === itemId ? { ...i, name: newName } : i
			);
			commitItems(updated);
			setRenamingId(null);
		},
		[items, commitItems, setRenamingId]
	);

	const handleRubberBandSelection = useCallback(
		(ids: Set<string> | null) => setSelected(ids ?? new Set()),
		[setSelected]
	);

	const handleStartIconRename = useCallback(
		(itemId: string) => setRenamingId(itemId),
		[setRenamingId]
	);

	const handleCancelIconRename = useCallback(
		() => setRenamingId(null),
		[setRenamingId]
	);

	const iconIsCut = useCallback(
		(itemId: string) =>
			clipboardAction === 'cut' && clipboard.some((c) => c.id === itemId),
		[clipboardAction, clipboard]
	);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent, item?: DesktopItem) => {
			e.preventDefault();

			const menuType = item
				? item.type === 'folder'
					? 'folder'
					: item.type === 'app'
						? 'app'
						: 'file'
				: 'desktop';
			const nextSelected = item
				? selected.has(item.id)
					? new Set(selected)
					: new Set([item.id])
				: new Set<string>();
			setCtx((prev) => ({
				...prev,
				isOpen: false,
				targetItem: item ?? undefined,
				targetType: item ? 'item' : 'desktop',
			}));
			setContextMenuType(menuType);
			setContextMenuPosition(
				getContextMenuPositionFromCursor({
					clientX: e.clientX,
					clientY: e.clientY,
					menuWidth: 250,
					menuHeight: 400,
				})
			);
			setSelected(nextSelected);
			setShowEnhancedContextMenu(true);
		},
		[
			selected,
			setContextMenuPosition,
			setContextMenuType,
			setCtx,
			setSelected,
			setShowEnhancedContextMenu,
		]
	);

	const handleDropToFolder = useCallback(
		(itemId: string, folderId: string) => {
			const item = items.find((i) => i.id === itemId);
			const folder = items.find((i) => i.id === folderId);

			if (!item || !folder || folder.type !== 'folder') return;

			const movedIds = collectDesktopMoveIntoFolderIds(
				items,
				selected,
				itemId,
				folderId
			);
			if (movedIds.length === 0) return;

			const newItems = items.map((i) =>
				movedIds.includes(i.id) ? { ...i, parentId: folderId } : i
			);

			commitItems(newItems);
			setSelected(new Set());

			log('Desktop', `Moved "${item.name}" to "${folder.name}"`);
		},
		[commitItems, items, selected, setSelected]
	);

	return {
		groupDragState,
		displayItems,
		handleDragStart,
		handleDrag,
		handleUpdatePosition,
		handleDragEnd,
		handleDesktopIconSelect,
		handleDesktopIconDragEnd,
		handleDesktopIconRename,
		handleRubberBandSelection,
		handleStartIconRename,
		handleCancelIconRename,
		iconIsCut,
		handleContextMenu,
		handleDropToFolder,
	};
}
