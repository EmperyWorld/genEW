/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Draggable desktop icon (native mouse drag). File shortcuts use HTML5 drag to Content Manager only while Alt is held.
 *
 * Invariants:
 * - Reposition drag uses mouse events + rAF `translate3d` preview; no Framer scale/opacity during drag.
 * - File icons are not `draggable` unless Alt arms CM export drag.
 * - Wrapper exposes `data-desktop-icon-id` for multi-select sibling preview (DOM-only).
 *
 * Related:
 * - hooks/useDesktopWorkspaceIconInteractions.ts
 * - utils/desktopVisualSystem.ts (`DESKTOP_ICON_SURFACE_STYLES`)
 * - utils/contentManagerDrag.ts · DesktopChromeTooltip.tsx
 */

import { cn } from '@/utils/cn';
import * as React from 'react';
import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopIconStyle } from '@/types/profile';
import { canMoveDesktopItemIntoFolder } from '../utils/desktopItemTree';
import {
	isProjectDesktopFolderItemId,
	projectDesktopFolderInitialGlyph,
} from '@/pages/ContentManager/projectDesktopFolder';
import {
	DESKTOP_APP_ICON,
	DESKTOP_GRID,
	DESKTOP_ICON_SIZES,
	DESKTOP_ICON_SVG_QUALITY,
	DESKTOP_LUCIDE,
	DESKTOP_TOOLTIP,
	DESKTOP_TYPOGRAPHY,
	DESKTOP_Z_INDEX,
	type IconSizePreference,
} from '../constants';
import type {
	DesktopFolderPreviewEntry,
	DesktopItem,
} from '../types/desktop.types';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';
import { resolveDesktopFolderDisplayName } from '../utils/desktopSystemFolderLabels';
import { formatDesktopLabel } from '../utils/desktopUi';
import { preloadDesktopApp } from '../utils/preloadDesktopApp';
import {
	DesktopAppSymbol,
	DesktopFolderSymbol,
	DESKTOP_ICON_SURFACE_STYLES,
} from '../utils/desktopVisualSystem';
import { DesktopFolderIconPreviewMosaic } from './DesktopFolderIconPreviewMosaic';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import {
	resolveDesktopChromeNativeTitle,
	useDesktopStyledTooltipsEnabled,
} from '../hooks/useDesktopStyledTooltipsEnabled';
import {
	ArchiveBoxIcon,
	CodeBracketIcon,
	DocumentTextIcon,
	FilmIcon,
	MapPinIcon,
	MusicalNoteIcon,
	PhotoIcon,
} from '@heroicons/react/24/outline';

import {
	CM_CONTENT_DRAG_MIME,
	dataTransferHasContentDrag,
	setContentManagerDragGhost,
	stringifyContentDragPayload,
	type ContentDragPayload,
} from '@/pages/ContentManager/utils/contentManagerDrag';
import { dataTransferHasDesktopNestedItemDrag } from '../utils/desktopNestedItemDrag';

interface DesktopIconProps {
	item: DesktopItem;
	isSelected: boolean;
	onSelect: (e: React.MouseEvent) => void;
	onDoubleClick: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
	onDragStart?: () => void;
	onDragEnd: (
		x: number,
		y: number,
		opts?: { droppedOnFolder?: boolean; cancelled?: boolean }
	) => void;
	/** During drag, report position (for group drag delta) */
	onDrag?: (x: number, y: number) => void;
	onDropToFolder?: (itemId: string, folderId: string) => void;
	/** HTML5: drop library content from Content Manager onto this folder icon. */
	onExternalContentDropToFolder?: (
		e: React.DragEvent,
		folderId: string
	) => void;
	allItems?: DesktopItem[];
	isRenaming?: boolean;
	onRename?: (newName: string) => void;
	onCancelRename?: () => void;
	isCut?: boolean;
	/** Keyboard nav: tabIndex 0 for focused icon, -1 otherwise */
	tabIndex?: number;
	/** Ref for the focusable wrapper (roving tabindex) */
	iconRef?:
		| React.RefCallback<HTMLDivElement>
		| React.RefObject<HTMLDivElement | null>;
	/** Keydown handler for Arrow/Enter/F2/Menu (handled by layer) */
	onKeyDown?: (e: React.KeyboardEvent) => void;
	/** From config.icon_size */
	iconSize?: IconSizePreference;
	/** Server-backed visual chrome preset for desktop icons. */
	visualStyle?: DesktopIconStyle;
	/** When dragging, report folder under cursor so that folder can show drop target highlight */
	onDropTargetChange?: (folderId: string | null) => void;
	/** Folder id that is currently the drop target (this icon shows highlight when item is folder and id matches) */
	activeDropTargetFolderId?: string | null;
	/** Optional unread badge count for app icons (e.g. chat). */
	badgeCount?: number;
	/** Number of direct child items when this icon is a folder (`parentId` chain). */
	folderChildCount?: number;
	/** Direct children to show as a small mosaic on folder icons. */
	folderPreviewEntries?: readonly DesktopFolderPreviewEntry[];
	/** Multi-select: used when starting HTML5 drag (Alt+drag) of file shortcuts toward Content Manager. */
	selectedIds?: ReadonlySet<string>;
}

function isFriendsAppBadge(appComponent?: string | null): boolean {
	return appComponent === 'FriendsApp' || appComponent === 'SocialHubApp';
}

function isGafChatAppBadge(appComponent?: string | null): boolean {
	return appComponent === 'GAFChatApp';
}

const ICON_LABEL_CLASS =
	'desktop-icon-label mt-2 text-center text-(--desktop-text-primary) font-semibold leading-[1.15] tracking-[0.01em]';

/** Сетка ярлыков — рамка/фон из {@link DESKTOP_ICON_SURFACE_STYLES} (согласовано с окнами). */
export const ICON_VISUAL_STYLES: Record<
	DesktopIconStyle,
	{
		idle: string;
		selected: string;
		halo: string;
		appBox: string;
		fileBox: string;
		label: string;
	}
> = {
	glass: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgb(var(--desktop-fg-primary-rgb)/0.09)] border border-(--desktop-border-subtle) shadow-(--desktop-shadow-panel) ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.28)]',
		halo: 'bg-[rgb(var(--desktop-accent-rgb)/0.1)]',
		...DESKTOP_ICON_SURFACE_STYLES.glass,
		label: ICON_LABEL_CLASS,
	},
	framed: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgb(var(--desktop-fg-primary-rgb)/0.08)] border border-(--desktop-border-strong) shadow-(--desktop-shadow-panel) ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.22)]',
		halo: 'bg-[rgb(var(--desktop-fg-primary-rgb)/0.06)]',
		...DESKTOP_ICON_SURFACE_STYLES.framed,
		label: ICON_LABEL_CLASS,
	},
	minimal: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgb(var(--desktop-fg-primary-rgb)/0.08)] border border-(--desktop-border-subtle) shadow-(--desktop-shadow-soft) ring-1 ring-(--desktop-border-strong)',
		halo: 'bg-[rgb(var(--desktop-fg-primary-rgb)/0.05)]',
		...DESKTOP_ICON_SURFACE_STYLES.minimal,
		label: ICON_LABEL_CLASS,
	},
	noir: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.2)] shadow-[0_16px_40px_rgba(0,0,0,0.55)] ring-1 ring-[rgba(255,255,255,0.18)]',
		halo: 'bg-[rgba(255,255,255,0.04)]',
		...DESKTOP_ICON_SURFACE_STYLES.noir,
		label: ICON_LABEL_CLASS,
	},
	neon: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgb(var(--desktop-accent-rgb)/0.12)] border border-[rgb(var(--desktop-accent-rgb)/0.42)] shadow-[0_0_28px_rgb(var(--desktop-accent-rgb)/0.28)] ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.38)]',
		halo: 'bg-[rgb(var(--desktop-accent-rgb)/0.18)]',
		...DESKTOP_ICON_SURFACE_STYLES.neon,
		label: ICON_LABEL_CLASS,
	},
	paper: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[color-mix(in_srgb,var(--desktop-paper-cream)_35%,rgb(var(--desktop-bg-primary-rgb))_65%)] border-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_58%,transparent)] shadow-[6px_6px_0_0_rgba(80,48,20,0.16)] ring-2 ring-[color-mix(in_srgb,var(--desktop-paper-ring)_42%,transparent)]',
		halo: 'bg-[color-mix(in_srgb,var(--desktop-paper-cream-soft)_40%,transparent)]',
		...DESKTOP_ICON_SURFACE_STYLES.paper,
		label: ICON_LABEL_CLASS,
	},
	aurora: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgba(168,85,247,0.12)] border-2 border-[rgba(168,85,247,0.4)] shadow-[0_0_32px_rgba(168,85,247,0.28)] ring-2 ring-[rgba(192,132,252,0.42)]',
		halo: 'bg-[rgba(34,211,238,0.1)]',
		...DESKTOP_ICON_SURFACE_STYLES.aurora,
		label: ICON_LABEL_CLASS,
	},
	chameleon: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgb(var(--desktop-fg-primary-rgb)/0.09)] border border-[var(--glass-border)] shadow-(--desktop-shadow-panel) ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.26)]',
		halo: 'bg-[rgb(var(--desktop-accent-rgb)/0.08)]',
		...DESKTOP_ICON_SURFACE_STYLES.chameleon,
		label: ICON_LABEL_CLASS,
	},
	premium: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgba(212,175,106,0.1)] border border-[rgba(212,175,106,0.36)] shadow-[0_20px_48px_rgba(0,0,0,0.45)] ring-1 ring-[rgba(212,175,106,0.32)]',
		halo: 'bg-[rgba(212,175,106,0.08)]',
		...DESKTOP_ICON_SURFACE_STYLES.premium,
		label: ICON_LABEL_CLASS,
	},
	prism: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgba(167,139,250,0.1)] border-2 border-[rgba(56,189,248,0.38)] shadow-[0_0_32px_rgba(167,139,250,0.32)] ring-2 ring-[rgba(244,114,182,0.28)]',
		halo: 'bg-[rgba(34,211,238,0.08)]',
		...DESKTOP_ICON_SURFACE_STYLES.prism,
		label: ICON_LABEL_CLASS,
	},
	mercury: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.28)] shadow-[0_16px_42px_rgba(0,0,0,0.48)] ring-1 ring-[rgba(255,255,255,0.2)]',
		halo: 'bg-[rgba(255,255,255,0.05)]',
		...DESKTOP_ICON_SURFACE_STYLES.mercury,
		label: ICON_LABEL_CLASS,
	},
	vhs: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgba(236,72,153,0.12)] border border-[rgba(34,211,238,0.42)] shadow-[0_0_28px_rgba(236,72,153,0.24)] ring-1 ring-[rgba(34,211,238,0.28)]',
		halo: 'bg-[rgba(34,211,238,0.09)]',
		...DESKTOP_ICON_SURFACE_STYLES.vhs,
		label: ICON_LABEL_CLASS,
	},
	slate: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgba(148,163,184,0.12)] border border-[rgba(148,163,184,0.4)] shadow-[0_12px_28px_rgba(0,0,0,0.36)] ring-1 ring-[rgba(148,163,184,0.28)]',
		halo: 'bg-[rgba(148,163,184,0.08)]',
		...DESKTOP_ICON_SURFACE_STYLES.slate,
		label: ICON_LABEL_CLASS,
	},
	clay: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgba(196,140,100,0.14)] border border-[rgba(196,140,100,0.42)] shadow-[0_12px_28px_rgba(0,0,0,0.38)] ring-1 ring-[rgba(196,140,100,0.3)]',
		halo: 'bg-[rgba(196,140,100,0.1)]',
		...DESKTOP_ICON_SURFACE_STYLES.clay,
		label: ICON_LABEL_CLASS,
	},
	ember: {
		idle: 'border border-transparent bg-transparent shadow-none',
		selected:
			'bg-[rgba(245,158,11,0.12)] border border-[rgba(245,158,11,0.42)] shadow-[0_12px_28px_rgba(0,0,0,0.4)] ring-1 ring-[rgba(245,158,11,0.28)]',
		halo: 'bg-[rgba(245,158,11,0.1)]',
		...DESKTOP_ICON_SURFACE_STYLES.ember,
		label: ICON_LABEL_CLASS,
	},
};

/**
 * Примеры `appComponent` для карточек «Стиль иконок» в настройках (разные мотивы и палитры).
 */
export const ICON_STYLE_CARD_SAMPLE_APPS = [
	'AppStore',
	'SocialHubApp',
	'MusicPlayer',
	'ImageStudio',
] as const;

// Get file icon based on file type
const getFileIcon = (fileType?: string) => {
	switch (fileType) {
		case 'document':
		case 'pdf':
		case 'doc':
		case 'docx':
			return (
				<DocumentTextIcon
					className="h-full w-full text-(--desktop-text-secondary)"
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			);
		case 'image':
		case 'png':
		case 'jpg':
		case 'jpeg':
			return (
				<PhotoIcon
					className="h-full w-full text-(--desktop-text-secondary)"
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			);
		case 'video':
		case 'mp4':
		case 'mov':
			return (
				<FilmIcon
					className="h-full w-full text-(--desktop-text-secondary)"
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			);
		case 'audio':
		case 'mp3':
		case 'wav':
			return (
				<MusicalNoteIcon
					className="h-full w-full text-(--desktop-text-secondary)"
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			);
		case 'archive':
		case 'zip':
		case 'rar':
			return (
				<ArchiveBoxIcon
					className="h-full w-full text-(--desktop-text-secondary)"
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			);
		case 'code':
		case 'js':
		case 'ts':
		case 'py':
			return (
				<CodeBracketIcon
					className="h-full w-full text-(--desktop-text-secondary)"
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			);
		default:
			return (
				<DocumentTextIcon
					className="h-full w-full text-(--desktop-text-secondary)"
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			);
	}
};

export const DesktopIcon: React.FC<DesktopIconProps> = memo(
	({
		item,
		isSelected,
		onSelect,
		onDoubleClick,
		onContextMenu,
		onDragStart,
		onDragEnd,
		onDrag,
		onDropToFolder,
		onExternalContentDropToFolder,
		allItems = [],
		isRenaming = false,
		onRename,
		onCancelRename,
		isCut = false,
		tabIndex = -1,
		iconRef,
		onKeyDown,
		iconSize = 'medium',
		visualStyle = 'glass',
		onDropTargetChange,
		activeDropTargetFolderId = null,
		badgeCount,
		folderChildCount,
		folderPreviewEntries,
		selectedIds,
	}) => {
		const { t } = useTranslation('desktopUi');
		const [isDragging, setIsDragging] = useState(false);
		const [isDropTarget, setIsDropTarget] = useState(false);
		const [externalContentOver, setExternalContentOver] = useState(false);
		const [contentManagerDragArmed, setContentManagerDragArmed] =
			useState(false);

		useEffect(() => {
			if (item.type !== 'file') {
				setContentManagerDragArmed(false);
				return;
			}
			const syncAlt = (e: KeyboardEvent) => {
				setContentManagerDragArmed(e.altKey);
			};
			const clearAlt = () => setContentManagerDragArmed(false);
			window.addEventListener('keydown', syncAlt);
			window.addEventListener('keyup', syncAlt);
			window.addEventListener('blur', clearAlt);
			return () => {
				window.removeEventListener('keydown', syncAlt);
				window.removeEventListener('keyup', syncAlt);
				window.removeEventListener('blur', clearAlt);
			};
		}, [item.type]);
		const isFolderDropTarget =
			item.type === 'folder' && activeDropTargetFolderId === item.id;
		const [showTooltip, setShowTooltip] = useState(false);
		const [renameValue, setRenameValue] = useState(item.name);
		const wrapperRef = useRef<HTMLDivElement>(null);
		const didDragRef = useRef(false);
		const dragStateRef = useRef<{
			startClientX: number;
			startClientY: number;
			startLeft: number;
			startTop: number;
			parentLeft: number;
			parentTop: number;
			/** layout px (`clientWidth` / `clientHeight` offsetParent), не визуальный bbox */
			parentLayoutWidth: number;
			parentLayoutHeight: number;
			layoutScale: number;
			clickOffsetX: number;
			clickOffsetY: number;
			lastX: number;
			lastY: number;
		} | null>(null);
		const inputRef = useRef<HTMLInputElement>(null);
		const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
		const dragMoveFrameRef = useRef<number | null>(null);
		const dragResetFrameRef = useRef<number | null>(null);
		const pendingDragPositionRef = useRef<{ x: number; y: number } | null>(
			null
		);
		const activeDropTargetRef = useRef<string | null>(null);
		const sizes = DESKTOP_ICON_SIZES[iconSize] ?? DESKTOP_ICON_SIZES.medium;
		const visual = ICON_VISUAL_STYLES[visualStyle] ?? ICON_VISUAL_STYLES.glass;
		const displayName = useMemo(
			() => resolveDesktopFolderDisplayName(item, t),
			[item, t]
		);
		const labelText = formatDesktopLabel(displayName);
		const styledTooltipsEnabled = useDesktopStyledTooltipsEnabled();
		const iconTooltipContent = useMemo(() => {
			if (item.type === 'file') {
				return [
					item.description
						? `${displayName} — ${item.description}`
						: displayName,
					t('workspace.fileAltDragToContentManagerHint'),
				].join(' · ');
			}
			return item.description
				? `${displayName} — ${item.description}`
				: displayName;
		}, [displayName, item.description, item.type, t]);
		const iconNativeTitle = resolveDesktopChromeNativeTitle(
			iconTooltipContent,
			styledTooltipsEnabled
		);

		const resolveFileContentDragIds = useCallback((): string[] => {
			if (item.type !== 'file') return [];
			if (!selectedIds?.has(item.id)) return [item.id];
			const ids = allItems
				.filter((i) => selectedIds.has(i.id) && i.type === 'file')
				.map((i) => i.id);
			return ids.length > 0 ? ids : [item.id];
		}, [allItems, item.id, item.type, selectedIds]);

		const handleHtml5DragStart = useCallback(
			(e: React.DragEvent) => {
				if (item.type !== 'file' || !e.altKey) {
					e.preventDefault();
					return;
				}
				const ids = resolveFileContentDragIds();
				if (ids.length === 0) return;
				const dragItems = ids.map((id) => {
					const it = allItems.find((i) => i.id === id && i.type === 'file');
					return {
						id,
						name: it?.name ?? id,
						content_type: it?.fileType ?? null,
					};
				});
				const payload: ContentDragPayload = { ids, items: dragItems };
				e.dataTransfer.setData(
					CM_CONTENT_DRAG_MIME,
					stringifyContentDragPayload(payload)
				);
				e.dataTransfer.effectAllowed = 'move';
				setContentManagerDragGhost(e, {
					title: item.name,
					count: ids.length,
				});
				const el = e.currentTarget as HTMLElement;
				el.style.opacity = '0.42';
			},
			[allItems, item.name, item.type, resolveFileContentDragIds]
		);

		const handleHtml5DragEnd = useCallback((e: React.DragEvent) => {
			const el = e.currentTarget as HTMLElement;
			el.style.opacity = '';
		}, []);

		const handleFolderExternalDragOver = useCallback(
			(e: React.DragEvent) => {
				if (item.type !== 'folder' || !onExternalContentDropToFolder) {
					return;
				}
				const hasContent = dataTransferHasContentDrag(e.dataTransfer);
				const hasNested = dataTransferHasDesktopNestedItemDrag(e.dataTransfer);
				if (!hasContent && !hasNested) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				e.dataTransfer.dropEffect = hasNested ? 'move' : 'copy';
				setExternalContentOver(true);
			},
			[item.type, onExternalContentDropToFolder]
		);

		const handleFolderExternalDragLeave = useCallback(
			(e: React.DragEvent) => {
				if (item.type !== 'folder') return;
				const related = e.relatedTarget as Node | null;
				if (related && (e.currentTarget as Node).contains(related)) return;
				setExternalContentOver(false);
			},
			[item.type]
		);

		const handleFolderExternalDrop = useCallback(
			(e: React.DragEvent) => {
				if (item.type !== 'folder' || !onExternalContentDropToFolder) {
					return;
				}
				setExternalContentOver(false);
				if (
					!dataTransferHasContentDrag(e.dataTransfer) &&
					!dataTransferHasDesktopNestedItemDrag(e.dataTransfer)
				) {
					return;
				}
				onExternalContentDropToFolder(e, item.id);
			},
			[item.id, item.type, onExternalContentDropToFolder]
		);

		const isProjectFolder =
			item.type === 'folder' && isProjectDesktopFolderItemId(item.id);
		const projectInitialGlyph = isProjectFolder
			? projectDesktopFolderInitialGlyph(item.name)
			: '';
		const projectFolderLetterClass =
			iconSize === 'small'
				? cn(DESKTOP_TYPOGRAPHY.captionInherit, 'leading-none')
				: iconSize === 'large'
					? 'text-base leading-none'
					: 'text-sm leading-none';
		const projectFolderLetterOffset =
			iconSize === 'small'
				? 'pt-[3px]'
				: iconSize === 'large'
					? 'pt-1.5'
					: 'pt-1';
		const showPriorityGlow = item.isSystem || item.appComponent === 'AppStore';
		const accentGlowVisual =
			visualStyle === 'aurora' ||
			visualStyle === 'neon' ||
			visualStyle === 'premium' ||
			visualStyle === 'chameleon' ||
			visualStyle === 'prism' ||
			visualStyle === 'mercury' ||
			visualStyle === 'vhs';
		const priorityGlowClass =
			showPriorityGlow && accentGlowVisual
				? 'shadow-[0_0_24px_rgb(var(--desktop-accent-rgb)/0.18),var(--desktop-shadow-soft)]'
				: showPriorityGlow
					? 'shadow-[var(--desktop-shadow-soft)]'
					: undefined;

		const scheduleTooltip = () => {
			tooltipTimerRef.current = setTimeout(
				() => setShowTooltip(true),
				DESKTOP_TOOLTIP.delayMs
			);
		};
		const cancelTooltip = () => {
			if (tooltipTimerRef.current) {
				clearTimeout(tooltipTimerRef.current);
				tooltipTimerRef.current = null;
			}
			setShowTooltip(false);
		};
		useEffect(
			() => () => {
				if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
			},
			[]
		);

		// Focus input when renaming; reset draft when entering rename mode.
		useEffect(() => {
			if (isRenaming) {
				setRenameValue(item.name);
				inputRef.current?.focus();
				inputRef.current?.select();
			}
		}, [isRenaming, item.name]);

		// Commit rename or exit edit mode when name unchanged / empty.
		const handleRenameSubmit = () => {
			const trimmed = renameValue.trim();
			if (trimmed && trimmed !== item.name) {
				onRename?.(trimmed);
				return;
			}
			setRenameValue(item.name);
			onCancelRename?.();
		};

		const folderDropTargets = useMemo(
			() =>
				allItems.filter(
					(candidate) =>
						candidate.type === 'folder' &&
						candidate.id !== item.id &&
						canMoveDesktopItemIntoFolder(allItems, item, candidate)
				),
			[allItems, item]
		);

		const checkDropTarget = useCallback(
			(x: number, y: number) => {
				const { width: iconW, height: iconH } = sizes;
				for (const folder of folderDropTargets) {
					const fx = folder.position.x;
					const fy = folder.position.y;
					if (x >= fx && x <= fx + iconW && y >= fy && y <= fy + iconH)
						return folder;
				}
				return null;
			},
			[folderDropTargets, sizes]
		);

		useLayoutEffect(() => {
			const el = wrapperRef.current;
			if (!el) return;
			el.style.left = `${item.position.x}px`;
			el.style.top = `${item.position.y}px`;
			el.style.width = `${sizes.width}px`;
			el.style.height = `${sizes.height}px`;
		}, [item.position.x, item.position.y, sizes.width, sizes.height]);

		const resetDragPreview = useCallback(() => {
			const wrapper = wrapperRef.current;
			if (!wrapper) return;
			wrapper.style.transform = '';
			wrapper.style.willChange = '';
		}, []);

		const applyDragPreview = useCallback((x: number, y: number) => {
			const wrapper = wrapperRef.current;
			const st = dragStateRef.current;
			if (!wrapper || !st) return;
			wrapper.style.willChange = 'transform';
			wrapper.style.transform = `translate3d(${x - st.startLeft}px, ${y - st.startTop}px, 0)`;
		}, []);

		useEffect(() => {
			if (isDragging) return;
			resetDragPreview();
		}, [isDragging, resetDragPreview]);

		useEffect(() => {
			return () => {
				if (dragMoveFrameRef.current != null) {
					cancelAnimationFrame(dragMoveFrameRef.current);
				}
				if (dragResetFrameRef.current != null) {
					cancelAnimationFrame(dragResetFrameRef.current);
				}
				resetDragPreview();
			};
		}, [resetDragPreview]);

		const handleMouseMove = useCallback(
			(e: MouseEvent) => {
				const st = dragStateRef.current;
				if (!st) return;
				const s = st.layoutScale > 0 ? st.layoutScale : 1;
				const parentX = (e.clientX - st.parentLeft) / s - st.clickOffsetX;
				const parentY = (e.clientY - st.parentTop) / s - st.clickOffsetY;
				const minX = DESKTOP_GRID.OFFSET;
				const minY = DESKTOP_GRID.OFFSET;
				const maxX = Math.max(minX, st.parentLayoutWidth - sizes.width);
				const maxY = Math.max(minY, st.parentLayoutHeight - sizes.height);
				const x = Math.max(minX, Math.min(maxX, parentX));
				const y = Math.max(minY, Math.min(maxY, parentY));
				st.lastX = x;
				st.lastY = y;
				didDragRef.current = true;
				pendingDragPositionRef.current = { x, y };

				if (dragMoveFrameRef.current != null) return;
				dragMoveFrameRef.current = requestAnimationFrame(() => {
					dragMoveFrameRef.current = null;
					const nextPosition = pendingDragPositionRef.current;
					if (!nextPosition) return;

					applyDragPreview(nextPosition.x, nextPosition.y);

					const target = checkDropTarget(
						nextPosition.x + sizes.width / 2,
						nextPosition.y + sizes.height / 2
					);
					const targetId = target?.id ?? null;

					if (activeDropTargetRef.current !== targetId) {
						activeDropTargetRef.current = targetId;
						setIsDropTarget(Boolean(targetId));
						onDropTargetChange?.(targetId);
					}

					onDrag?.(nextPosition.x, nextPosition.y);
				});
			},
			[applyDragPreview, checkDropTarget, onDrag, onDropTargetChange, sizes]
		);

		const handleMouseUp = useCallback(
			(e: MouseEvent) => {
				if (e.button !== 0) return;
				const st = dragStateRef.current;
				window.removeEventListener('mousemove', handleMouseMove);
				window.removeEventListener('mouseup', handleMouseUp);
				dragStateRef.current = null;
				setIsDragging(false);
				setIsDropTarget(false);
				activeDropTargetRef.current = null;
				onDropTargetChange?.(null);
				if (dragMoveFrameRef.current != null) {
					cancelAnimationFrame(dragMoveFrameRef.current);
					dragMoveFrameRef.current = null;
				}
				if (!st) return;
				const dropX = st.lastX;
				const dropY = st.lastY;
				const target = checkDropTarget(
					dropX + sizes.width / 2,
					dropY + sizes.height / 2
				);
				if (target && onDropToFolder) {
					resetDragPreview();
					onDropToFolder(item.id, target.id);
					onDragEnd(st.startLeft, st.startTop, { droppedOnFolder: true });
					return;
				}
				// Mousedown always arms drag listeners; without pointer motion this is a click
				// (select / double-click to open), not a layout change — avoid commit + server sync.
				if (!didDragRef.current) {
					resetDragPreview();
					onDragEnd(st.startLeft, st.startTop, { cancelled: true });
					if (dragResetFrameRef.current != null) {
						cancelAnimationFrame(dragResetFrameRef.current);
					}
					dragResetFrameRef.current = requestAnimationFrame(() => {
						dragResetFrameRef.current = null;
						resetDragPreview();
					});
					return;
				}
				onDragEnd(dropX, dropY);
				if (dragResetFrameRef.current != null) {
					cancelAnimationFrame(dragResetFrameRef.current);
				}
				dragResetFrameRef.current = requestAnimationFrame(() => {
					dragResetFrameRef.current = null;
					resetDragPreview();
				});
			},
			[
				checkDropTarget,
				handleMouseMove,
				item.id,
				onDragEnd,
				onDropTargetChange,
				onDropToFolder,
				resetDragPreview,
				sizes,
			]
		);

		const handleMouseDown = useCallback(
			(e: React.MouseEvent) => {
				if (e.button !== 0 || isRenaming) return;
				// Alt+drag: HTML5 drag to Content Manager (same MIME as CM rows). Skip icon reposition.
				if (item.type === 'file' && e.altKey) return;
				const wrapper = wrapperRef.current;
				const parent = wrapper?.offsetParent as HTMLElement | null;
				if (!wrapper || !parent) return;
				const parentRect = parent.getBoundingClientRect();
				const layoutScale =
					typeof document !== 'undefined'
						? readDesktopWorkArea().layoutScale
						: 1;
				const s = layoutScale > 0 ? layoutScale : 1;
				const startLeft = item.position.x;
				const startTop = item.position.y;
				const clickOffsetX = (e.clientX - parentRect.left) / s - startLeft;
				const clickOffsetY = (e.clientY - parentRect.top) / s - startTop;
				didDragRef.current = false;
				dragStateRef.current = {
					startClientX: e.clientX,
					startClientY: e.clientY,
					startLeft,
					startTop,
					parentLeft: parentRect.left,
					parentTop: parentRect.top,
					parentLayoutWidth: parent.clientWidth,
					parentLayoutHeight: parent.clientHeight,
					layoutScale: s,
					clickOffsetX,
					clickOffsetY,
					lastX: startLeft,
					lastY: startTop,
				};
				pendingDragPositionRef.current = { x: startLeft, y: startTop };
				activeDropTargetRef.current = null;
				applyDragPreview(startLeft, startTop);
				setIsDragging(true);
				onDragStart?.();
				window.addEventListener('mousemove', handleMouseMove);
				window.addEventListener('mouseup', handleMouseUp);
			},
			[
				applyDragPreview,
				handleMouseMove,
				handleMouseUp,
				isRenaming,
				item.position,
				item.type,
				onDragStart,
			]
		);

		// role=button: выбор ярлыков через aria-pressed (aria-selected только у tab/option/gridcell).
		const iconSurface = (
			// biome-ignore lint/a11y/noStaticElementInteractions: interactive when not renaming (role=button); rename mode drops role while keeping surface layout.
			// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-* applied only with role=button (ternary); rename mode omits both.
			<div
				ref={iconRef as React.Ref<HTMLDivElement>}
				role={isRenaming ? undefined : 'button'}
				tabIndex={isRenaming ? -1 : tabIndex}
				aria-label={isRenaming ? undefined : displayName}
				aria-pressed={isRenaming ? undefined : isSelected}
				title={iconNativeTitle}
				style={{
					width: sizes.width,
					height: sizes.height,
					zIndex: isDragging ? 100 : undefined,
				}}
				onMouseDown={handleMouseDown}
				className={`
          group flex h-full w-full flex-col items-center px-1.5 pt-1.5 pb-1 rounded-2xl cursor-pointer select-none
          transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb))] focus-visible:ring-inset
          ${visual.idle}
          ${isSelected ? visual.selected : ''}
          ${isDropTarget || externalContentOver ? 'border-[rgb(var(--desktop-accent-rgb))] bg-[rgb(var(--desktop-accent-rgb)/0.16)]' : ''}
          ${isFolderDropTarget ? 'border-[rgb(var(--desktop-accent-rgb))] bg-[rgb(var(--desktop-accent-rgb)/0.2)]' : ''}
          ${isCut ? 'opacity-60 border-dashed border-[rgb(var(--desktop-accent-rgb)/0.7)]' : ''}
        `}
				onPointerEnter={() => {
					if (item.type === 'app' && item.appComponent) {
						void preloadDesktopApp(item.appComponent);
					}
					if (!styledTooltipsEnabled && !isDragging) scheduleTooltip();
				}}
				onFocus={() => {
					if (item.type === 'app' && item.appComponent) {
						preloadDesktopApp(item.appComponent);
					}
					if (!styledTooltipsEnabled) scheduleTooltip();
				}}
				onClick={(e) => {
					if (didDragRef.current) {
						e.preventDefault();
						e.stopPropagation();
						didDragRef.current = false;
						return;
					}
					onSelect(e);
				}}
				onDoubleClick={onDoubleClick}
				onContextMenu={onContextMenu}
				onKeyDown={onKeyDown}
				onMouseLeave={cancelTooltip}
				onBlur={cancelTooltip}
			>
				{/* Legacy description tooltip (native title mode only) */}
				{!styledTooltipsEnabled &&
					showTooltip &&
					(item.description || item.name) && (
						<div
							className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-(--desktop-surface-panel-strong) rounded-lg text-xs text-(--desktop-text-primary) whitespace-nowrap shadow-xl border border-(--desktop-border-subtle) max-w-[min(280px,90vw)] overflow-hidden text-ellipsis"
							style={{ zIndex: DESKTOP_Z_INDEX.TOAST }}
						>
							{DESKTOP_TOOLTIP.truncate(item.description ?? item.name)}
							<div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-(--desktop-surface-panel-strong) rotate-45 border-r border-b border-(--desktop-border-subtle)" />
						</div>
					)}

				{/* Icon container */}
				<div className="relative">
					{/* Icon based on type */}
					{item.type === 'app' ? (
						<div
							className={cn(
								`relative ${sizes.iconBox} ${visual.appBox}`,
								priorityGlowClass
							)}
						>
							<div className={DESKTOP_APP_ICON.inner}>
								<DesktopAppSymbol
									appComponent={item.appComponent}
									fallback={item.icon}
									iconStyle={visualStyle}
								/>
							</div>
							{typeof badgeCount === 'number' && badgeCount > 0 && (
								<span className="pointer-events-none absolute -top-1 -right-1">
									{isFriendsAppBadge(item.appComponent) ||
									isGafChatAppBadge(item.appComponent) ? (
										<span
											aria-hidden
											className={`absolute inset-0 rounded-full blur-[1px] ${
												isFriendsAppBadge(item.appComponent)
													? 'bg-fuchsia-400/35'
													: 'bg-rose-400/35'
											}`}
										/>
									) : null}
									<span
										role="status"
										aria-label={
											badgeCount > 99
												? t('desktopIcon.unreadBadgeOverflow')
												: t('desktopIcon.unreadBadge', { count: badgeCount })
										}
										className={cn(
											'relative flex min-w-[18px] h-[18px] items-center justify-center rounded-full px-1',
											DESKTOP_TYPOGRAPHY.iconBadgeNumeric,
											isFriendsAppBadge(item.appComponent)
												? 'border border-fuchsia-200/70 bg-linear-to-br from-fuchsia-500 via-rose-500 to-orange-400 shadow-[0_0_18px_rgba(236,72,153,0.48)]'
												: isGafChatAppBadge(item.appComponent)
													? 'border border-rose-200/60 bg-linear-to-br from-rose-500 via-red-500 to-orange-500 shadow-[0_0_18px_rgba(244,63,94,0.45)]'
													: 'bg-red-500 shadow-lg'
										)}
									>
										{badgeCount > 99 ? '99+' : badgeCount}
									</span>
								</span>
							)}
						</div>
					) : item.type === 'file' ? (
						<div
							className={cn(
								`relative ${sizes.iconBox} ${visual.fileBox} ${DESKTOP_ICON_SVG_QUALITY}`,
								priorityGlowClass
							)}
						>
							{getFileIcon(item.fileType)}
						</div>
					) : (
						<div
							className={cn(
								`relative ${sizes.iconBox} ${visual.appBox}`,
								priorityGlowClass
							)}
						>
							<div className={DESKTOP_APP_ICON.inner}>
								<div
									className={cn(
										'relative h-full w-full overflow-hidden rounded-[1.05rem]',
										isProjectFolder &&
											'shadow-[0_0_0_2px_rgb(var(--desktop-accent-rgb)/0.48),0_10px_26px_rgba(var(--desktop-accent-rgb)/0.2)]',
										(isDropTarget ||
											isFolderDropTarget ||
											externalContentOver) &&
											'ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.8)]'
									)}
								>
									<DesktopFolderSymbol
										iconStyle={visualStyle}
										isProjectFolder={isProjectFolder}
										systemKey={item.systemKey}
									/>

									{folderPreviewEntries &&
										folderPreviewEntries.length > 0 &&
										!isProjectFolder &&
										!item.icon &&
										!(
											isDropTarget ||
											isFolderDropTarget ||
											externalContentOver
										) && (
											<DesktopFolderIconPreviewMosaic
												entries={folderPreviewEntries}
												iconSize={iconSize}
												visualStyle={visualStyle}
											/>
										)}

									{/* Project folder: first letter of title (project name) inside icon */}
									{isProjectFolder &&
										!item.icon &&
										!(
											isDropTarget ||
											isFolderDropTarget ||
											externalContentOver
										) && (
											<div
												className={cn(
													'pointer-events-none absolute inset-0 flex items-center justify-center',
													projectFolderLetterOffset
												)}
												aria-hidden
											>
												<span
													className={cn(
														projectFolderLetterClass,
														'font-bold tracking-tight text-[rgb(var(--desktop-accent-rgb))]',
														'drop-shadow-[0_2px_3px_rgb(var(--desktop-fg-primary-rgb)/0.85)]'
													)}
												>
													{projectInitialGlyph}
												</span>
											</div>
										)}

									{/* Optional semantic overlay for system/default folders */}
									{item.icon && (
										<div className="absolute inset-0 flex items-center justify-center [&>svg]:h-[42%] [&>svg]:w-[42%]">
											{item.icon}
										</div>
									)}

									{/* Folder open indicator when this folder is drop target */}
									{(isDropTarget ||
										isFolderDropTarget ||
										externalContentOver) && (
										<div className="absolute inset-0 flex items-center justify-center">
											<div className="w-6 h-6 bg-[rgb(var(--desktop-accent-rgb))] rounded-full flex items-center justify-center">
												<span className="text-white text-lg font-bold">+</span>
											</div>
										</div>
									)}
								</div>
							</div>
						</div>
					)}

					{/* Pinned indicator */}
					{item.isPinned && (
						<div className="absolute -top-1 -right-1">
							<MapPinIcon
								className="h-4 w-4 rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-panel-strong) p-0.5 text-(--desktop-text-primary) shadow-lg"
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						</div>
					)}

					{/* Folder: child item count (neutral; bottom-left — avoids pin and file-size corners) */}
					{item.type === 'folder' &&
						typeof folderChildCount === 'number' &&
						folderChildCount > 0 && (
							<div
								className="pointer-events-none absolute -bottom-1 -left-1"
								role="img"
								aria-label={
									folderChildCount > 99
										? t('workspace.folderItemCountAriaOverflow')
										: t('workspace.folderItemCountAria', {
												count: folderChildCount,
											})
								}
							>
								<span
									className={cn(
										'flex min-w-[18px] h-[18px] items-center justify-center rounded-full px-1',
										DESKTOP_TYPOGRAPHY.shellMeta10,
										'border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary) shadow-(--desktop-shadow-soft)'
									)}
								>
									{folderChildCount > 99 ? '99+' : folderChildCount}
								</span>
							</div>
						)}

					{/* File size badge */}
					{item.type === 'file' && item.size && (
						<div
							className={cn(
								'absolute -bottom-1 -right-1 rounded px-1.5 py-0.5 bg-(--desktop-surface-soft) border border-(--desktop-border-subtle)',
								DESKTOP_TYPOGRAPHY.shellMeta10
							)}
						>
							{item.size < 1024
								? `${item.size}B`
								: item.size < 1048576
									? `${(item.size / 1024).toFixed(1)}KB`
									: `${(item.size / 1048576).toFixed(1)}MB`}
						</div>
					)}
				</div>

				{/* Label / Rename Input */}
				{isRenaming ? (
					<input
						ref={inputRef}
						type="text"
						value={renameValue}
						onChange={(e) => setRenameValue(e.target.value)}
						onBlur={handleRenameSubmit}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								handleRenameSubmit();
							}
							if (e.key === 'Escape') {
								e.preventDefault();
								setRenameValue(item.name);
								onCancelRename?.();
							}
						}}
						aria-label={t('desktopIcon.renameAria', { name: item.name })}
						className={`${sizes.label} mt-2 rounded-lg border border-[rgb(var(--desktop-accent-rgb))] bg-(--desktop-surface-panel-strong) px-2 py-1 text-center text-(--desktop-text-primary) outline-none`}
						onClick={(e) => e.stopPropagation()}
					/>
				) : (
					<span
						className={`${sizes.label} ${visual.label}`}
						style={{
							display: '-webkit-box',
							WebkitBoxOrient: 'vertical',
							WebkitLineClamp: 2,
							overflow: 'hidden',
							overflowWrap: 'anywhere',
							wordBreak: 'break-word',
						}}
					>
						{labelText}
					</span>
				)}
			</div>
		);

		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: wrapper for HTML5 drag/drop + folder drop zone; interactive semantics are on the inner role=button.
			<div
				ref={wrapperRef}
				data-desktop-icon
				data-desktop-icon-id={item.id}
				className="pointer-events-auto absolute cursor-grab active:cursor-grabbing"
				draggable={item.type === 'file' && contentManagerDragArmed}
				onDragStart={handleHtml5DragStart}
				onDragEnd={handleHtml5DragEnd}
				onDragOver={
					item.type === 'folder' && onExternalContentDropToFolder
						? handleFolderExternalDragOver
						: undefined
				}
				onDragLeave={
					item.type === 'folder' && onExternalContentDropToFolder
						? handleFolderExternalDragLeave
						: undefined
				}
				onDrop={
					item.type === 'folder' && onExternalContentDropToFolder
						? handleFolderExternalDrop
						: undefined
				}
			>
				{styledTooltipsEnabled ? (
					<DesktopChromeTooltip
						content={iconTooltipContent}
						placement="top"
						offsetExtra={8}
					>
						{iconSurface}
					</DesktopChromeTooltip>
				) : (
					iconSurface
				)}
			</div>
		);
	}
);

DesktopIcon.displayName = 'DesktopIcon';

export default DesktopIcon;
