/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop icon grid: selection, drag, rename, context menu, and keyboard nav (Tab/Arrows/Enter/F2/Menu).
 *
 * Invariants:
 * - No per-icon Framer enter/exit (RDP paint); grid stays interactive without mount animations.
 * - Layout coordinates stay in desktop work-area space; bounds follow `readDesktopWorkArea`.
 *
 * Related:
 * - `components/DesktopIcon.tsx`
 * - `constants/index.ts` (`DESKTOP_PERFORMANCE_TARGETS`)
 */

import * as React from 'react';
import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopIconStyle } from '@/types/profile';
import {
	DESKTOP_GRID_STEPS,
	type GridStepPreference,
	type IconSizePreference,
} from '../constants';
import type {
	DesktopFolderPreviewEntry,
	DesktopItem,
} from '../types/desktop.types';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';
import { DesktopIcon } from './DesktopIcon';

function useDesktopIconLayerBounds(): { width: number; height: number } {
	const [bounds, setBounds] = useState(() =>
		typeof document !== 'undefined'
			? (() => {
					const wa = readDesktopWorkArea();
					return { width: wa.width, height: wa.height };
				})()
			: { width: 1280, height: 720 }
	);

	useLayoutEffect(() => {
		const update = () => {
			const wa = readDesktopWorkArea();
			setBounds({ width: wa.width, height: wa.height });
		};
		const ro = new ResizeObserver(update);
		const main = document.getElementById('desktop-main');
		const zoom = main?.querySelector<HTMLElement>('[data-desktop-ui-scale]');
		const taskbar = main?.querySelector<HTMLElement>(
			'[data-desktop-taskbar-strip]'
		);
		if (zoom) ro.observe(zoom);
		if (taskbar) ro.observe(taskbar);
		window.addEventListener('resize', update);
		update();
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', update);
		};
	}, []);

	return bounds;
}

export interface DesktopIconLayerProps {
	items: DesktopItem[];
	selected: Set<string>;
	onSelect: (e: React.MouseEvent, item: DesktopItem) => void;
	onDoubleClick: (item: DesktopItem) => void;
	onContextMenu: (e: React.MouseEvent, item?: DesktopItem) => void;
	onDragStart: (itemId: string) => void;
	onDragEnd: (
		itemId: string,
		x: number,
		y: number,
		opts?: { droppedOnFolder?: boolean; cancelled?: boolean }
	) => void;
	/** During drag, report position for the dragged icon (for group drag) */
	onDrag?: (itemId: string, x: number, y: number) => void;
	onDropToFolder: (itemId: string, folderId: string) => void;
	/** HTML5 drop: unified content from Content Manager onto a desktop folder icon. */
	onExternalContentDropToFolder?: (
		e: React.DragEvent,
		folderId: string
	) => void;
	onRename: (itemId: string, newName: string) => void;
	onStartRename?: (itemId: string) => void;
	onCancelRename?: () => void;
	renamingId: string | null;
	isCut: (itemId: string) => boolean;
	/** From config.icon_size; affects icon and label size */
	iconSize?: IconSizePreference;
	/** Server-backed visual chrome preset for desktop icons. */
	visualStyle?: DesktopIconStyle;
	/** Folder id under drag cursor (that folder shows drop target highlight) */
	activeDropTargetFolderId?: string | null;
	/** Called during drag when folder under cursor changes */
	onDropTargetChange?: (folderId: string | null) => void;
	/** Grid step for layout (small/medium/large); kept for future layout-aware keyboard nav */
	gridStep?: GridStepPreference;
	/** Optional badge counts per desktop item id (e.g. unread messages for chat). */
	itemBadgeCounts?: Record<string, number>;
	/** Direct children count per folder id (items with parentId === folder id). */
	folderChildCounts?: Record<string, number>;
	/** Up to four direct children per folder id for icon mosaic preview. */
	folderPreviewByFolderId?: Record<string, DesktopFolderPreviewEntry[]>;
}

const DesktopIconLayerInner: React.FC<DesktopIconLayerProps> = ({
	items,
	selected,
	onSelect,
	onDoubleClick,
	onContextMenu,
	onDragStart,
	onDragEnd,
	onDropToFolder,
	onExternalContentDropToFolder,
	onRename,
	onStartRename,
	onCancelRename,
	renamingId,
	isCut,
	iconSize = 'medium',
	visualStyle = 'glass',
	activeDropTargetFolderId = null,
	onDropTargetChange,
	gridStep = 'medium',
	onDrag,
	itemBadgeCounts,
	folderChildCounts,
	folderPreviewByFolderId,
}) => {
	const { t } = useTranslation('desktopUi');
	const workBounds = useDesktopIconLayerBounds();
	const [focusedIndex, setFocusedIndex] = useState<number>(0);
	const iconRefs = useRef<(HTMLDivElement | null)[]>([]);
	const draggingIconIdRef = useRef<string | null>(null);
	const pendingFocusIndexRef = useRef<number | null>(null);

	useEffect(() => {
		if (items.length > 0 && focusedIndex >= items.length) {
			setFocusedIndex(items.length - 1);
		}
	}, [items.length, focusedIndex]);

	const focusIcon = useCallback(
		(index: number) => {
			const i = Math.max(0, Math.min(index, items.length - 1));
			pendingFocusIndexRef.current = i;
			setFocusedIndex(i);
			iconRefs.current[i]?.focus();
		},
		[items.length]
	);

	useEffect(() => {
		if (pendingFocusIndexRef.current !== focusedIndex) {
			return;
		}
		iconRefs.current[focusedIndex]?.focus();
		pendingFocusIndexRef.current = null;
	}, [focusedIndex]);

	const getDirectionalIndex = useCallback(
		(index: number, direction: 'left' | 'right' | 'up' | 'down'): number => {
			const current = items[index];
			if (!current) {
				return index;
			}

			const laneTolerance = DESKTOP_GRID_STEPS[gridStep] * 0.7;
			const candidates = items
				.map((item, candidateIndex) => ({
					item,
					candidateIndex,
					dx: item.position.x - current.position.x,
					dy: item.position.y - current.position.y,
				}))
				.filter(({ candidateIndex }) => candidateIndex !== index)
				.filter(({ dx, dy }) => {
					switch (direction) {
						case 'left':
							return dx < 0;
						case 'right':
							return dx > 0;
						case 'up':
							return dy < 0;
						case 'down':
							return dy > 0;
						default:
							return false;
					}
				})
				.sort((left, right) => {
					const leftPrimary =
						direction === 'left' || direction === 'right'
							? Math.abs(left.dx)
							: Math.abs(left.dy);
					const rightPrimary =
						direction === 'left' || direction === 'right'
							? Math.abs(right.dx)
							: Math.abs(right.dy);
					const leftSecondary =
						direction === 'left' || direction === 'right'
							? Math.abs(left.dy)
							: Math.abs(left.dx);
					const rightSecondary =
						direction === 'left' || direction === 'right'
							? Math.abs(right.dy)
							: Math.abs(right.dx);
					const leftInLane = leftSecondary <= laneTolerance ? 0 : 1;
					const rightInLane = rightSecondary <= laneTolerance ? 0 : 1;
					return (
						leftInLane - rightInLane ||
						leftPrimary - rightPrimary ||
						leftSecondary - rightSecondary
					);
				});

			return candidates[0]?.candidateIndex ?? index;
		},
		[gridStep, items]
	);

	const handleIconKeyDown = useCallback(
		(index: number, e: React.KeyboardEvent) => {
			if (renamingId != null) return;
			const key = e.key;
			if (
				[
					'ArrowRight',
					'ArrowDown',
					'ArrowLeft',
					'ArrowUp',
					'Enter',
					'F2',
					'ContextMenu',
				].includes(key)
			) {
				e.preventDefault();
			}
			if (key === 'ArrowRight') {
				focusIcon(getDirectionalIndex(index, 'right'));
			} else if (key === 'ArrowDown') {
				focusIcon(getDirectionalIndex(index, 'down'));
			} else if (key === 'ArrowLeft') {
				focusIcon(getDirectionalIndex(index, 'left'));
			} else if (key === 'ArrowUp') {
				focusIcon(getDirectionalIndex(index, 'up'));
			} else if (key === 'Enter') {
				onDoubleClick(items[index]);
			} else if (key === 'F2') {
				onStartRename?.(items[index].id);
			} else if (key === 'ContextMenu') {
				const el = iconRefs.current[index];
				const rect = el?.getBoundingClientRect();
				if (rect) {
					const syntheticEvent = {
						preventDefault: () => {},
						clientX: rect.left + rect.width / 2,
						clientY: rect.top + rect.height / 2,
					} as React.MouseEvent;
					onContextMenu(syntheticEvent, items[index]);
				}
			}
		},
		[
			items,
			renamingId,
			focusIcon,
			getDirectionalIndex,
			onDoubleClick,
			onStartRename,
			onContextMenu,
		]
	);

	const renderDesktopIcon = (item: DesktopItem, index: number) => (
		<DesktopIcon
			item={item}
			isSelected={selected.has(item.id)}
			onSelect={(e) => {
				setFocusedIndex(index);
				onSelect(e, item);
			}}
			onDoubleClick={() => onDoubleClick(item)}
			onContextMenu={(e) => {
				setFocusedIndex(index);
				onContextMenu(e, item);
			}}
			onDragStart={() => {
				draggingIconIdRef.current = item.id;
				onDragStart(item.id);
			}}
			onDragEnd={(x, y, opts) => {
				onDragEnd(item.id, x, y, opts);
				draggingIconIdRef.current = null;
			}}
			onDrag={
				onDrag
					? (x, y) => {
							if (draggingIconIdRef.current === item.id) onDrag(item.id, x, y);
						}
					: undefined
			}
			onDropToFolder={onDropToFolder}
			onExternalContentDropToFolder={onExternalContentDropToFolder}
			allItems={items}
			isRenaming={renamingId === item.id}
			onRename={(newName) => onRename(item.id, newName)}
			onCancelRename={onCancelRename}
			isCut={isCut(item.id)}
			tabIndex={focusedIndex === index ? 0 : -1}
			iconRef={(el) => {
				iconRefs.current[index] = el;
				if (el && pendingFocusIndexRef.current === index) {
					el.focus();
					pendingFocusIndexRef.current = null;
				}
			}}
			onKeyDown={(e) => handleIconKeyDown(index, e)}
			iconSize={iconSize}
			visualStyle={visualStyle}
			onDropTargetChange={onDropTargetChange}
			activeDropTargetFolderId={activeDropTargetFolderId}
			badgeCount={itemBadgeCounts?.[item.id]}
			folderChildCount={folderChildCounts?.[item.id]}
			folderPreviewEntries={folderPreviewByFolderId?.[item.id]}
			selectedIds={selected}
		/>
	);

	return (
		<fieldset
			data-desktop-welcome-guide="icons"
			className="absolute top-0 left-0 z-1 min-w-0 border-0 p-0 m-0 pointer-events-none"
			style={{
				width: workBounds.width,
				height: workBounds.height,
			}}
			aria-label={t('workspace.iconsLayerAria')}
		>
			{items.map((item, index) => {
				iconRefs.current[index] = null;
				return (
					<React.Fragment key={item.id}>
						{renderDesktopIcon(item, index)}
					</React.Fragment>
				);
			})}
		</fieldset>
	);
};

export const DesktopIconLayer = memo<DesktopIconLayerProps>(
	DesktopIconLayerInner
);
DesktopIconLayer.displayName = 'DesktopIconLayer';
