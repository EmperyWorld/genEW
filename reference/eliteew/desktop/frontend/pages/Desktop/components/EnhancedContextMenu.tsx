/**
 * Enhanced Context Menu with Advanced Features
 */

import { AnimatePresence, m } from 'framer-motion';
import * as React from 'react';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useReducer,
	useRef,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import {
	DESKTOP_ICON_SIZES_PANEL,
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
	DESKTOP_PORTAL_STACK_BUMP,
	DESKTOP_TYPOGRAPHY,
} from '../constants';
import { useDesktopWindowPortalStackBase } from '../context/DesktopWindowPortalStackContext';
import type { DesktopItem } from '../types/desktop.types';
import type { DesktopWindowStyle } from '../../../types/profile';
import { isSystemDesktopApp } from '../utils/desktopAppRegistry';
import { isDesktopSystemFolder } from '../utils/desktopItemTree';
import { isUnifiedContentAudioLike } from '../utils/desktopAudioContent';
import { DESKTOP_UI_SCALE_PRESETS } from '../utils/desktopUiScale';
import {
	clampFixedBoxToViewport,
	getDesktopPortalShellProps,
} from '../utils/desktopUi';
import { cn } from '@/utils/cn';
import {
	ArrowPathIcon,
	ArrowTopRightOnSquareIcon,
	ArrowUpTrayIcon,
	BarsArrowUpIcon,
	BriefcaseIcon,
	BuildingStorefrontIcon,
	ChatBubbleLeftRightIcon,
	Cog6ToothIcon,
	ComputerDesktopIcon,
	CpuChipIcon,
	DocumentDuplicateIcon,
	DocumentTextIcon,
	EyeIcon,
	FolderIcon,
	FolderOpenIcon,
	InformationCircleIcon,
	ListBulletIcon,
	MapPinIcon,
	MinusIcon,
	PencilSquareIcon,
	PercentBadgeIcon,
	PlayIcon,
	PlusIcon,
	RectangleStackIcon,
	ScissorsIcon,
	SparklesIcon,
	Squares2X2Icon,
	StarIcon,
	SwatchIcon,
	TrashIcon,
	UserIcon,
} from '@heroicons/react/24/outline';

import {
	DesktopAppMenuDivider,
	DesktopAppMenuItem,
	DesktopAppMenuSurface,
} from './DesktopAppChrome';

type ContextMenuPosition = { x: number; y: number };
type ContextMenuItem = {
	id: string;
	label: string;
	icon?: React.ReactNode;
	action?: () => void;
	submenu?: ContextMenuItem[];
	separator?: boolean;
	disabled?: boolean;
	shortcut?: string;
	badge?: string;
	checked?: boolean;
};

/** Поиск пункта с подменю по id во всём дереве (глобально уникальные id пунктов меню). */
function findEnhancedContextBranchById(
	items: ContextMenuItem[],
	id: string
): ContextMenuItem | null {
	for (const it of items) {
		if (it.separator) continue;
		if (it.id === id) return it;
		if (it.submenu?.length) {
			const nested = findEnhancedContextBranchById(it.submenu, id);
			if (nested) return nested;
		}
	}
	return null;
}

interface EnhancedContextMenuProps {
	isVisible: boolean;
	position: ContextMenuPosition;
	onClose: () => void;
	selectedItems: DesktopItem[];
	contextType: 'desktop' | 'folder' | 'file' | 'app' | 'window';
	onAction?: (actionId: string) => void;
	/** For desktop context: paste is enabled when clipboard has items */
	hasClipboard?: boolean;
	/** Current icon size (for desktop View submenu checkmark) */
	iconSize?: 'small' | 'medium' | 'large';
	/** Current snap-to-grid (for desktop View submenu checkmark) */
	snapToGrid?: boolean;
	/** Текущий масштаб стола (для подменю пресетов 50–150%). */
	desktopUiScale?: number;
	/** Item that was right-clicked (folder for "move selected here") */
	targetItem?: DesktopItem | null;
	/** Active window is pinned above others (window context menu checkmark). */
	activeWindowAlwaysOnTop?: boolean;
	/** Пресет «Стиль окон» оболочки — ПКМ совпадает с рамкой/фоном панелей. */
	shellWindowStyle?: DesktopWindowStyle;
}

/** Внешняя оболочка: акцент, без overflow-hidden — выпады рендерятся соседним слоем ниже скролла. */
const ENHANCED_CTX_MENU_OUTER_SHELL_CLASS = cn(
	'relative border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.45)] ring-1 ring-(--desktop-border-menu) text-(--desktop-text-primary)'
);

/** Скролл только здесь — подменю не внутри, иначе absolute/fixed flyout обрезается overflow-y-auto. */
const ENHANCED_CTX_MENU_INNER_SCROLL_CLASS = cn(
	'max-h-[min(85vh,calc(100dvh-1rem))] overflow-y-auto overscroll-y-contain'
);

const ENHANCED_CTX_MENU_FLYOUT_SURFACE_CLASS = cn(
	'max-h-[min(70vh,calc(100dvh-24px))] overflow-x-hidden overflow-y-auto overscroll-y-contain py-1',
	'border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.45)] ring-1 ring-(--desktop-border-menu)'
);

export function EnhancedContextMenu({
	isVisible,
	position,
	onClose,
	selectedItems,
	contextType,
	onAction,
	hasClipboard = false,
	iconSize = 'medium',
	snapToGrid = true,
	desktopUiScale = 1,
	targetItem = null,
	activeWindowAlwaysOnTop = false,
	shellWindowStyle = 'glass',
}: EnhancedContextMenuProps) {
	const { t } = useTranslation('desktopUi');
	const portalStackBase = useDesktopWindowPortalStackBase();
	const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
	/** viewport position:fixed координаты flyout; null — ещё не измерено (скрыт до раскладки). */
	const [flyoutViewportPos, setFlyoutViewportPos] = useState<{
		top: number;
		left: number;
	} | null>(null);
	const [_submenuMeasureTick, bumpSubmenuMeasure] = useReducer(
		(x: number) => x + 1,
		0
	);
	const [menuPos, setMenuPos] = useState(() => position);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isVisible) {
			setActiveSubmenu(null);
			setFlyoutViewportPos(null);
		}
	}, [isVisible]);

	/** Якорь и поджатие по вьюпорту: размеры из DOM, точка — `position` от родителя. */
	useLayoutEffect(() => {
		if (!isVisible || !menuRef.current) return;
		const el = menuRef.current;
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		if (w <= 0 || h <= 0) return;
		const vh = typeof window !== 'undefined' ? window.innerHeight : undefined;
		const next = clampFixedBoxToViewport(position.x, position.y, w, h, {
			padding: 12,
			viewportHeight: vh,
		});
		setMenuPos((prev) =>
			prev.x === next.x && prev.y === next.y ? prev : next
		);
	}, [isVisible, position.x, position.y]);

	const repositionRootMenu = useCallback(() => {
		const el = menuRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		setMenuPos(
			clampFixedBoxToViewport(r.left, r.top, r.width, r.height, {
				padding: 12,
				viewportHeight:
					typeof window !== 'undefined' ? window.innerHeight : undefined,
			})
		);
	}, []);

	useEffect(() => {
		if (!isVisible) return;
		const onResize = () => {
			repositionRootMenu();
			bumpSubmenuMeasure();
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [isVisible, repositionRootMenu]);

	/** Flyout: position:fixed пиксели + отражение горизонтали/вертикали при нехватке места во вьюпорте. */
	// biome-ignore lint/correctness/useExhaustiveDependencies: якорь смещается при поджатии корня меню по menuPos
	useLayoutEffect(() => {
		if (!isVisible || !activeSubmenu || !menuRef.current) {
			setFlyoutViewportPos(null);
			return;
		}

		let rafId = 0;
		let attempts = 0;
		const run = () => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				const root = menuRef.current;
				if (!root) {
					setFlyoutViewportPos(null);
					return;
				}
				const parent = root.querySelector(
					`[data-submenu-parent="${CSS.escape(activeSubmenu)}"]`
				);
				const fly = root.querySelector(
					`[data-submenu-flyout="${CSS.escape(activeSubmenu)}"]`
				);
				if (!(parent instanceof HTMLElement) || !(fly instanceof HTMLElement)) {
					setFlyoutViewportPos(null);
					return;
				}
				let fw = fly.offsetWidth;
				let fh = fly.offsetHeight;
				if ((fw < 8 || fh < 8) && attempts < 6) {
					attempts += 1;
					run();
					return;
				}
				if (fw < 8) fw = 220;
				if (fh < 8) fh = 120;

				const pad = 12;
				const gap = 6;
				const vw = window.innerWidth;
				const vh = window.innerHeight;
				const pr = parent.getBoundingClientRect();
				const spaceRight = vw - pad - pr.right - gap;
				const spaceLeft = pr.left - pad - gap;
				const openLeft =
					fw > spaceRight && (spaceLeft >= fw || spaceLeft > spaceRight);
				const left = openLeft ? pr.left - fw - gap : pr.right + gap;

				const overflowDown = pr.top + fh > vh - pad;
				const fitsOpeningUp = pr.bottom - fh >= pad;
				let openAbove = false;
				if (overflowDown && fitsOpeningUp) openAbove = true;
				else if (overflowDown && !fitsOpeningUp) {
					const roomBelow = vh - pad - pr.top;
					const roomAbove = pr.bottom - pad;
					openAbove = roomAbove > roomBelow;
				}
				const top = openAbove ? pr.bottom - fh : pr.top;

				const clampedLeft = Math.min(
					Math.max(left, pad),
					Math.max(pad, vw - fw - pad)
				);
				const clampedTop = Math.min(
					Math.max(top, pad),
					Math.max(pad, vh - fh - pad)
				);
				setFlyoutViewportPos({ top: clampedTop, left: clampedLeft });
			});
		};
		run();
		return () => cancelAnimationFrame(rafId);
	}, [activeSubmenu, isVisible, _submenuMeasureTick, menuPos.x, menuPos.y]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			if (activeSubmenu !== null) {
				setActiveSubmenu(null);
			} else {
				onClose();
			}
		};

		if (isVisible) {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleEscape);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleEscape);
		};
	}, [isVisible, onClose, activeSubmenu]);

	/** Клик по другому пункту корня меню или по разделителю — закрыть открытый flyout (не только всё меню). */
	useEffect(() => {
		if (!isVisible || activeSubmenu === null) return;

		const handlePointerDownCapture = (event: PointerEvent) => {
			const t = event.target as Node | null;
			if (!t || !menuRef.current?.contains(t)) return;
			const parent = menuRef.current.querySelector(
				`[data-submenu-parent="${CSS.escape(activeSubmenu)}"]`
			);
			const fly = menuRef.current.querySelector(
				`[data-submenu-flyout="${CSS.escape(activeSubmenu)}"]`
			);
			if (parent?.contains(t) || fly?.contains(t)) return;
			setActiveSubmenu(null);
		};

		document.addEventListener('pointerdown', handlePointerDownCapture, true);
		return () => {
			document.removeEventListener(
				'pointerdown',
				handlePointerDownCapture,
				true
			);
		};
	}, [isVisible, activeSubmenu]);

	const fireAction = (id: string) => {
		onAction?.(id);
		onClose();
	};

	const createMenuItems = (): ContextMenuItem[] => {
		const baseItems: ContextMenuItem[] = [];

		switch (contextType) {
			case 'desktop':
				baseItems.push(
					{
						id: 'refresh',
						label: t('enhancedContextMenu.desktop.refresh'),
						icon: (
							<ArrowPathIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'F5',
						action: () => fireAction('refresh'),
					},
					{
						id: 'create',
						label: t('enhancedContextMenu.desktop.create'),
						icon: (
							<PlusIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						submenu: [
							{
								id: 'new-folder',
								label: t('enhancedContextMenu.desktop.newFolder'),
								icon: (
									<FolderOpenIcon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								shortcut: 'Ctrl+Shift+N',
								action: () => fireAction('new-folder'),
							},
							{
								id: 'new-markdown-file',
								label: t('enhancedContextMenu.desktop.newMarkdownFile'),
								icon: (
									<DocumentTextIcon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('new-markdown-file'),
							},
						],
					},
					{ id: 'separator1', label: '', separator: true },
					{
						id: 'paste',
						label: t('enhancedContextMenu.desktop.paste'),
						icon: (
							<PlusIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'Ctrl+V',
						disabled: !hasClipboard,
						action: () => fireAction('paste'),
					},
					{ id: 'separator2-desktop', label: '', separator: true },
					{
						id: 'view',
						label: t('enhancedContextMenu.desktop.view'),
						icon: (
							<EyeIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						submenu: [
							{
								id: 'view-icon-large',
								label: t('enhancedContextMenu.desktop.viewIconLarge'),
								icon: (
									<Squares2X2Icon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('view-icon-large'),
								checked: iconSize === 'large',
							},
							{
								id: 'view-icon-medium',
								label: t('enhancedContextMenu.desktop.viewIconMedium'),
								icon: (
									<Squares2X2Icon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('view-icon-medium'),
								checked: iconSize === 'medium',
							},
							{
								id: 'view-icon-small',
								label: t('enhancedContextMenu.desktop.viewIconSmall'),
								icon: (
									<ListBulletIcon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('view-icon-small'),
								checked: iconSize === 'small',
							},
							{ id: 'separator-view', label: '', separator: true },
							{
								id: 'view-snap-to-grid',
								label: t('enhancedContextMenu.desktop.viewSnapToGrid'),
								icon: (
									<Squares2X2Icon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('view-snap-to-grid'),
								checked: snapToGrid,
							},
						],
					},
					{
						id: 'ui-scale-submenu',
						label: t('enhancedContextMenu.desktop.uiScale'),
						icon: (
							<PercentBadgeIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						submenu: DESKTOP_UI_SCALE_PRESETS.map((scale) => {
							const pct = Math.round(scale * 100);
							return {
								id: `ui-scale-${pct}`,
								label: `${pct}%`,
								action: () => fireAction(`ui-scale-${pct}`),
								checked: Math.round(desktopUiScale * 100) === pct,
							};
						}),
					},
					{ id: 'separator-desktop-sort', label: '', separator: true },
					{
						id: 'desktop-sort',
						label: t('enhancedContextMenu.desktop.sort'),
						icon: (
							<BarsArrowUpIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						submenu: [
							{
								id: 'sort-name',
								label: t('enhancedContextMenu.desktop.sortByName'),
								icon: (
									<BarsArrowUpIcon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('sort-name'),
							},
							{
								id: 'sort-by-type',
								label: t('enhancedContextMenu.desktop.sortByType'),
								icon: (
									<FolderIcon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('sort-by-type'),
							},
							{
								id: 'sort-by-pinned',
								label: t('enhancedContextMenu.desktop.sortByPinned'),
								icon: (
									<MapPinIcon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('sort-by-pinned'),
							},
						],
					},
					{ id: 'separator-desktop-reflow', label: '', separator: true },
					{
						id: 'reflow-icons-to-grid',
						label: t('enhancedContextMenu.desktop.reflowIconsToGrid'),
						icon: (
							<Squares2X2Icon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('reflow-icons-to-grid'),
					},
					{ id: 'separator-desktop-extras', label: '', separator: true },
					{
						id: 'app-store',
						label: t('enhancedContextMenu.desktop.appStore'),
						icon: (
							<BuildingStorefrontIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('app-store'),
					},
					{
						id: 'session-info',
						label: t('enhancedContextMenu.desktop.sessionInfo'),
						icon: (
							<ComputerDesktopIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('session-info'),
					},
					{
						id: 'profile',
						label: t('enhancedContextMenu.desktop.profile'),
						icon: (
							<UserIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('profile'),
					},
					{
						id: 'desktop-control-center',
						label: t('enhancedContextMenu.desktop.controlCenter'),
						icon: (
							<Cog6ToothIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						submenu: [
							{
								id: 'settings-personalize',
								label: t('enhancedContextMenu.desktop.settingsPersonalize'),
								icon: (
									<SwatchIcon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('settings-personalize'),
							},
							{
								id: 'settings-icons',
								label: t('enhancedContextMenu.desktop.settingsIcons'),
								icon: (
									<Squares2X2Icon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('settings-icons'),
							},
							{
								id: 'settings-chrome',
								label: t('enhancedContextMenu.desktop.settingsChrome'),
								icon: (
									<ComputerDesktopIcon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('settings-chrome'),
							},
							{
								id: 'settings-shell',
								label: t('enhancedContextMenu.desktop.settingsShell'),
								icon: (
									<RectangleStackIcon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('settings-shell'),
							},
							{
								id: 'settings-performance',
								label: t('enhancedContextMenu.desktop.settingsPerformance'),
								icon: (
									<CpuChipIcon
										className={DESKTOP_LUCIDE.md}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								),
								action: () => fireAction('settings-performance'),
							},
						],
					}
				);
				break;

			case 'app': {
				const appItem = targetItem ?? selectedItems[0];
				const systemApp = appItem ? isSystemDesktopApp(appItem) : false;
				baseItems.push(
					{
						id: 'open',
						label: t('enhancedContextMenu.itemOpen'),
						icon: (
							<PlayIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'Enter',
						action: () => fireAction('open'),
					},
					{
						id: 'open-new',
						label: t('enhancedContextMenu.app.openNewWindow'),
						icon: (
							<ArrowTopRightOnSquareIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('open-new'),
					},
					{ id: 'separator-app-1', label: '', separator: true },
					{
						id: 'pin',
						label: appItem?.isPinned
							? t('enhancedContextMenu.app.unpinFromTaskbar')
							: t('enhancedContextMenu.app.pinToTaskbar'),
						icon: (
							<MapPinIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('pin'),
					},
					{ id: 'separator-app-clipboard', label: '', separator: true },
					{
						id: 'copy',
						label: t('enhancedContextMenu.itemCopy'),
						icon: (
							<DocumentDuplicateIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'Ctrl+C',
						action: () => fireAction('copy'),
					},
					{
						id: 'cut',
						label: t('enhancedContextMenu.itemCut'),
						icon: (
							<ScissorsIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'Ctrl+X',
						action: () => fireAction('cut'),
					},
					{
						id: 'properties',
						label: t('enhancedContextMenu.app.properties'),
						icon: (
							<InformationCircleIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('properties'),
					}
				);
				if (!systemApp) {
					baseItems.push(
						{ id: 'separator-app-remove', label: '', separator: true },
						{
							id: 'delete',
							label: t('enhancedContextMenu.app.removeFromDesktop'),
							icon: (
								<TrashIcon
									className={DESKTOP_LUCIDE.md}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							),
							action: () => fireAction('delete'),
						}
					);
				}
				break;
			}

			case 'folder':
			case 'file': {
				const isSystemFolder =
					contextType === 'folder' &&
					selectedItems[0] != null &&
					isDesktopSystemFolder(selectedItems[0] as DesktopItem);
				const canMoveSelectedHere =
					contextType === 'folder' &&
					targetItem &&
					selectedItems.length > 0 &&
					(selectedItems.length > 1 || selectedItems[0]?.id !== targetItem.id);
				const canMoveToDesktopRoot =
					selectedItems.some((row) => Boolean((row as DesktopItem).parentId)) ||
					Boolean(targetItem && (targetItem as DesktopItem).parentId);
				const fileSel = selectedItems[0] as DesktopItem | undefined;
				const showPlayInMusicPlayer =
					contextType === 'file' &&
					fileSel?.type === 'file' &&
					isUnifiedContentAudioLike({
						content_type: fileSel.fileType,
						name: fileSel.name,
					});
				const openWithSubmenuItems: ContextMenuItem[] = [];
				if (contextType === 'file') {
					openWithSubmenuItems.push({
						id: 'open-in-doc-editor',
						label: t('enhancedContextMenu.openInDocEditor'),
						icon: (
							<DocumentTextIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('open-in-doc-editor'),
					});
				}
				if (contextType === 'file' || contextType === 'folder') {
					openWithSubmenuItems.push({
						id: 'open-in-content-manager',
						label: t('enhancedContextMenu.openInContentManager'),
						icon: (
							<Squares2X2Icon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('open-in-content-manager'),
					});
				}
				if (showPlayInMusicPlayer) {
					openWithSubmenuItems.push({
						id: 'play-in-music-player',
						label: t('enhancedContextMenu.playInMusicPlayer'),
						icon: (
							<PlayIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('play-in-music-player'),
					});
				}
				if (contextType === 'file') {
					openWithSubmenuItems.push(
						{
							id: 'send-to-gaf-chat',
							label: t('enhancedContextMenu.sendToGafChat'),
							icon: (
								<ChatBubbleLeftRightIcon
									className={DESKTOP_LUCIDE.md}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							),
							action: () => fireAction('send-to-gaf-chat'),
						},
						{
							id: 'send-to-desktop-ai',
							label: t('enhancedContextMenu.sendToDesktopAi'),
							icon: (
								<SparklesIcon
									className={DESKTOP_LUCIDE.md}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							),
							action: () => fireAction('send-to-desktop-ai'),
						}
					);
				}
				baseItems.push(
					...(canMoveToDesktopRoot
						? [
								{
									id: 'move-to-desktop-root',
									label: t('enhancedContextMenu.moveToDesktopRoot'),
									icon: (
										<ArrowUpTrayIcon
											className={DESKTOP_LUCIDE.md}
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
									),
									action: () => fireAction('move-to-desktop-root'),
								},
								{ id: 'separator-move-root', label: '', separator: true },
							]
						: []),
					...(contextType === 'folder' && canMoveSelectedHere
						? [
								{
									id: 'move-selected-here',
									label: t('enhancedContextMenu.moveSelectedHere'),
									icon: (
										<FolderOpenIcon
											className={DESKTOP_LUCIDE.md}
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
									),
									action: () => fireAction('move-selected-here'),
								},
								{ id: 'separator-move', label: '', separator: true },
							]
						: []),
					{
						id: 'open',
						label: t('enhancedContextMenu.itemOpen'),
						icon: (
							<FolderOpenIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'Enter',
						action: () => fireAction('open'),
					},
					...(openWithSubmenuItems.length > 0
						? [
								{
									id: 'open-with',
									label: t('enhancedContextMenu.openWith'),
									icon: (
										<ComputerDesktopIcon
											className={DESKTOP_LUCIDE.md}
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
									),
									submenu: openWithSubmenuItems,
								},
							]
						: []),
					{
						id: 'edit',
						label: t('enhancedContextMenu.itemRename'),
						icon: (
							<PencilSquareIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'F2',
						disabled: isSystemFolder,
						action: () => fireAction('edit'),
					},
					...(contextType === 'folder'
						? [
								{
									id: 'change-icon',
									label: t('enhancedContextMenu.changeFolderIcon'),
									icon: (
										<SwatchIcon
											className={DESKTOP_LUCIDE.md}
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
									),
									disabled: isSystemFolder,
									action: () => fireAction('change-icon'),
								},
							]
						: []),
					{ id: 'separator1', label: '', separator: true },
					{
						id: 'copy',
						label: t('enhancedContextMenu.itemCopy'),
						icon: (
							<DocumentDuplicateIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'Ctrl+C',
						action: () => fireAction('copy'),
					},
					{
						id: 'cut',
						label: t('enhancedContextMenu.itemCut'),
						icon: (
							<ScissorsIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'Ctrl+X',
						action: () => fireAction('cut'),
					},
					{
						id: 'paste',
						label: t('enhancedContextMenu.itemPaste'),
						icon: (
							<PlusIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'Ctrl+V',
						action: () => fireAction('paste'),
					},
					{
						id: 'properties',
						label: t('enhancedContextMenu.itemProperties'),
						icon: (
							<InformationCircleIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						disabled: isSystemFolder,
						action: () => fireAction('properties'),
					},
					...(contextType === 'file'
						? [
								{
									id: 'assign-to-project',
									label: t('enhancedContextMenu.assignToProject'),
									icon: (
										<BriefcaseIcon
											className={DESKTOP_LUCIDE.md}
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
									),
									action: () => fireAction('assign-content-to-project'),
								} satisfies ContextMenuItem,
							]
						: []),
					{ id: 'separator2', label: '', separator: true },
					{
						id: 'delete',
						label: t('enhancedContextMenu.itemDelete'),
						icon: (
							<TrashIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'Del',
						disabled: isSystemFolder,
						action: () => fireAction('delete'),
					}
				);
				break;
			}

			case 'window':
				baseItems.push(
					{
						id: 'minimize',
						label: t('enhancedContextMenu.window.minimize'),
						icon: (
							<MinusIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('minimize'),
					},
					{
						id: 'maximize',
						label: t('enhancedContextMenu.window.maximize'),
						icon: (
							<Squares2X2Icon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('maximize'),
					},
					{
						id: 'close',
						label: t('enhancedContextMenu.window.close'),
						icon: (
							<MinusIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						shortcut: 'Alt+F4',
						action: () => fireAction('close'),
					},
					{ id: 'separator1', label: '', separator: true },
					{
						id: 'always-on-top',
						label: t('enhancedContextMenu.window.alwaysOnTop'),
						checked: activeWindowAlwaysOnTop,
						icon: (
							<StarIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('always-on-top'),
					},
					{
						id: 'duplicate',
						label: t('enhancedContextMenu.window.duplicate'),
						icon: (
							<DocumentDuplicateIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						),
						action: () => fireAction('duplicate'),
					}
				);
				break;
		}

		/** Сортировка и размер значков — только из меню пустого стола (`contextType === 'desktop'`), не дублируем как «Вид» на одном файле/папке. */
		const commonItems: ContextMenuItem[] = [];

		return [...baseItems, ...commonItems];
	};

	const renderMenuItem = (item: ContextMenuItem) => {
		if (item.separator) {
			return <DesktopAppMenuDivider key={item.id} />;
		}

		const hasSubmenu = item.submenu && item.submenu.length > 0;
		const submenuOpenHere = activeSubmenu === item.id;

		return (
			<div
				key={item.id}
				className="relative"
				data-submenu-parent={hasSubmenu ? item.id : undefined}
			>
				<m.div
					whileTap={{ scale: 0.99 }}
					onMouseEnter={() => hasSubmenu && setActiveSubmenu(item.id)}
				>
					<DesktopAppMenuItem
						type="button"
						onClick={(ev) => {
							if (item.action) {
								item.action();
								onClose();
							} else if (hasSubmenu) {
								ev.preventDefault();
								setActiveSubmenu(submenuOpenHere ? null : item.id);
							}
						}}
						disabled={item.disabled}
						icon={
							item.icon ? (
								<span className={DESKTOP_ICON_SIZES_PANEL.menu}>
									{item.icon}
								</span>
							) : undefined
						}
						badge={item.badge}
						shortcut={
							item.checked ? (
								<span className="text-[rgb(var(--desktop-accent-rgb))]">✓</span>
							) : (
								item.shortcut
							)
						}
						hasSubmenu={hasSubmenu}
						className={DESKTOP_INTERACTIVE.focusRing}
					>
						{item.label}
					</DesktopAppMenuItem>
				</m.div>
			</div>
		);
	};

	if (!isVisible) return null;

	const menuItems = createMenuItems();
	const activeFlyoutOwner = activeSubmenu
		? findEnhancedContextBranchById(menuItems, activeSubmenu)
		: null;
	const activeFlyoutBranch =
		activeFlyoutOwner?.submenu && activeFlyoutOwner.submenu.length > 0
			? activeFlyoutOwner
			: null;
	const { style: portalShellStyle, theme: portalTheme } =
		getDesktopPortalShellProps();

	const menuTree = (
		<AnimatePresence>
			{/*
			 Корневая оболочка без transform scale/y: иначе position:fixed у flyout
			 привязывается к motion-слою и координаты из getBoundingClientRect «уезжают» вправо.
			*/}
			<div
				ref={menuRef}
				data-desktop-enhanced-context-menu
				className="fixed text-(--desktop-text-primary)"
				style={{
					left: menuPos.x,
					top: menuPos.y,
					zIndex: portalStackBase,
				}}
			>
				<m.div
					initial={{ opacity: 0, scale: 0.95, y: -10 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.95, y: -10 }}
					transition={{ duration: 0.15 }}
				>
					<DesktopAppMenuSurface
						clipOverflow={false}
						windowStyle={shellWindowStyle}
						className={ENHANCED_CTX_MENU_OUTER_SHELL_CLASS}
					>
						<div className={ENHANCED_CTX_MENU_INNER_SCROLL_CLASS}>
							{menuItems.map((item) => renderMenuItem(item))}

							{selectedItems.length > 1 && (
								<div className="mx-3 my-2 border-t border-[color-mix(in_srgb,var(--desktop-border-menu)_35%,transparent)] pt-2">
									<div className={DESKTOP_TYPOGRAPHY.meta}>
										{t('enhancedContextMenu.multiSelectLabel', {
											count: selectedItems.length,
										})}
									</div>
								</div>
							)}
						</div>
					</DesktopAppMenuSurface>
				</m.div>

				<AnimatePresence>
					{activeSubmenu && activeFlyoutBranch ? (
						<m.div
							key={activeSubmenu}
							initial={{ opacity: 0 }}
							animate={{ opacity: flyoutViewportPos ? 1 : 0 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.1 }}
							data-submenu-flyout={activeSubmenu}
							style={{
								position: 'fixed',
								top: flyoutViewportPos?.top ?? -9999,
								left: flyoutViewportPos?.left ?? -9999,
								zIndex:
									portalStackBase +
									DESKTOP_PORTAL_STACK_BUMP.ENHANCED_CONTEXT_SUBMENU,
								visibility: flyoutViewportPos ? 'visible' : 'hidden',
								pointerEvents: flyoutViewportPos ? 'auto' : 'none',
							}}
						>
							<DesktopAppMenuSurface
								windowStyle={shellWindowStyle}
								className={ENHANCED_CTX_MENU_FLYOUT_SURFACE_CLASS}
							>
								{(activeFlyoutBranch.submenu ?? []).map((subItem) =>
									renderMenuItem(subItem)
								)}
							</DesktopAppMenuSurface>
						</m.div>
					) : null}
				</AnimatePresence>
			</div>
		</AnimatePresence>
	);

	if (typeof document === 'undefined') {
		return menuTree;
	}

	return createPortal(
		<div
			style={portalShellStyle}
			className={portalTheme === 'dark' ? 'dark' : ''}
		>
			{menuTree}
		</div>,
		document.body
	);
}
