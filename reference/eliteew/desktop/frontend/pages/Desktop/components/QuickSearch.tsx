/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Лаунчер быстрого поиска (Win+S / таскбар): приложения, недавние файлы, быстрые действия.
 *
 * Invariants:
 * - Автофокус поля ввода только там, где это не вызывает виртуальную клавиатуру на touch-primary устройствах.
 * - Arrow/Home/End навигация; Enter активирует строку по актуальному индексу (ref).
 * - Escape: контекстное меню → очистка query → закрытие (`consumeEscapeForSearchClear`).
 *
 * Related:
 * - `desktopShellSearchAutofocus.ts`, `useDesktopShellSearchFocusOnVisible.ts`
 * - hooks/useShellCaptureKeyboard.ts
 * - DesktopChromeTooltip.tsx
 */

import { AnimatePresence, m } from 'framer-motion';
import { useDesktopShellMotionPrefs } from '../context/DesktopShellMotionPrefsContext';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { safeCopyToClipboard } from '@/utils/clipboard';
import { notify } from '@/notifications';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
	DESKTOP_OVERLAY,
	DESKTOP_PORTAL_STACK_BUMP,
	DESKTOP_TYPOGRAPHY,
} from '@/pages/Desktop/constants';
import {
	useDesktopWindowPortalStackBase,
	useEmbeddedPortaledModalZIndex,
} from '@/pages/Desktop/context/DesktopWindowPortalStackContext';
import { cn } from '@/utils/cn';
import {
	DesktopAppBadge,
	getDesktopShellPanelClassName,
} from '../utils/desktopVisualSystem';
import { isSystemDesktopApp } from '../utils/desktopAppRegistry';
import {
	buildDesktopLibraryDiscoverySlices,
	buildQuickSearchRecentFilePool,
	rankRecentFilesForQuery,
} from '../utils/desktopDiscoveryModel';
import { rankDesktopAppsForQuery } from '../utils/desktopLauncherFuzzySearch';
import {
	DESKTOP_LIBRARY_FEED_CARD_QUICK_SEARCH,
	DESKTOP_LIBRARY_FEED_ICON_WRAP_QUICK_SEARCH,
	DESKTOP_QUICK_SEARCH_FEED_STATUS_STRIP,
	DESKTOP_QUICK_SEARCH_ROLE_PANEL,
} from '../utils/desktopLibraryFeedCard';
import { useDesktopShellSearchFocusOnVisible } from '../hooks/useDesktopShellSearchFocusOnVisible';
import { useDismissibleFloatingMenu } from '../hooks/useDismissibleFloatingMenu';
import {
	consumeEscapeForSearchClear,
	useShellCaptureEscape,
	useShellCaptureKeyboard,
} from '../hooks/useShellCaptureKeyboard';
import {
	getDesktopPortalShellProps,
	getFloatingMenuPosition,
} from '../utils/desktopUi';
import {
	DesktopAppButton,
	DesktopAppEmptyState,
	DesktopAppMenuDivider,
	DesktopAppMenuItem,
	DesktopAppMenuSurface,
	DesktopAppSectionLabel,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import type { DesktopItem, RecentFile } from '../types/desktop.types';
import {
	ArrowPathIcon,
	ArrowUpTrayIcon,
	BoltIcon,
	ChevronRightIcon,
	ClockIcon,
	DocumentDuplicateIcon,
	DocumentTextIcon,
	FolderIcon,
	MagnifyingGlassIcon,
	MapPinIcon,
	PlayIcon,
	PlusIcon,
	SparklesIcon,
	StarIcon,
	TrashIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';
import {
	desktopItemFromAppRowData,
	itemVariantsForMotion,
	matchActionQuery,
	qsLauncherRowClass,
	quickSearchLauncherTooltipLabel,
	searchVariantsForMotion,
} from './quickSearch/helpers';
import { QuickSearchLauncherRow } from './quickSearch/QuickSearchLauncherRow';
import type {
	LauncherRow,
	QuickAction,
	QuickSearchCtxMenu,
	QuickSearchProps,
	SearchResult,
} from './quickSearch/types';

export type { QuickAction };

export const QuickSearch: React.FC<QuickSearchProps> = ({
	isOpen,
	onClose,
	items,
	onOpenItem,
	recentItems = [],
	recentFiles = [],
	recentLibraryOpened = [],
	recentLibraryAdded = [],
	recentLibraryGenerated = [],
	recentLibraryUploaded = [],
	recentLibraryProjects = [],
	recentContentFeedLoading = false,
	recentContentFeedError = null,
	onRefetchRecentContentFeed,
	onOpenRecentFile,
	removeRecentFile,
	onPinAppToDesktop,
	quickActions = [],
	onQuickAction,
	iconStyle = 'glass',
	shellWindowStyle = 'glass',
}) => {
	const { t } = useTranslation('desktopUi');
	const portalStackBase = useDesktopWindowPortalStackBase();
	const embeddedModalZ = useEmbeddedPortaledModalZIndex();
	const { reduceMotion, speed } = useDesktopShellMotionPrefs();
	const searchVariants = searchVariantsForMotion(reduceMotion, speed);
	const itemVariants = itemVariantsForMotion(reduceMotion, speed);
	const [query, setQuery] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const selectedIndexRef = useRef(0);
	selectedIndexRef.current = selectedIndex;
	const flatRowsRef = useRef<LauncherRow[]>([]);
	const [results, setResults] = useState<SearchResult[]>([]);
	const [ctxMenu, setCtxMenu] = useState<QuickSearchCtxMenu>(null);
	const ctxMenuRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

	const copyLauncherText = useCallback(
		async (text: string) => {
			const copied = await safeCopyToClipboard(text);
			if (copied) {
				notify.success(t('quickSearch.copyDone'));
			} else {
				notify.error(t('quickSearch.copyFailed'));
			}
			closeCtxMenu();
		},
		[t, closeCtxMenu]
	);

	useEffect(() => {
		if (!isOpen) setCtxMenu(null);
	}, [isOpen]);

	useDismissibleFloatingMenu({
		isOpen: ctxMenu != null,
		menuRef: ctxMenuRef,
		onClose: closeCtxMenu,
		escapeCapture: true,
	});

	const openAppCtx = useCallback(
		(e: React.MouseEvent, data: SearchResult | DesktopItem) => {
			e.preventDefault();
			e.stopPropagation();
			setCtxMenu({
				kind: 'app',
				item: desktopItemFromAppRowData(data),
				x: e.clientX,
				y: e.clientY,
			});
		},
		[]
	);

	const openFileCtx = useCallback((e: React.MouseEvent, file: RecentFile) => {
		e.preventDefault();
		e.stopPropagation();
		setCtxMenu({ kind: 'file', file, x: e.clientX, y: e.clientY });
	}, []);

	const openActionCtx = useCallback(
		(e: React.MouseEvent, action: QuickAction) => {
			e.preventDefault();
			e.stopPropagation();
			setCtxMenu({ kind: 'action', action, x: e.clientX, y: e.clientY });
		},
		[]
	);

	const fuzzySearch = useCallback(
		(
			searchQuery: string,
			searchItems: DesktopItem[],
			recent: DesktopItem[]
		): SearchResult[] =>
			rankDesktopAppsForQuery(searchQuery, searchItems, recent),
		[]
	);

	useEffect(() => {
		if (query) {
			const searchResults = fuzzySearch(query, items, recentItems);
			setResults(searchResults);
			setSelectedIndex(0);
		} else {
			setResults([]);
		}
	}, [query, items, recentItems, fuzzySearch]);

	// Flat list: при запросе — приложения, файлы, действия; без запроса — действия, недавние приложения, недавние файлы, закреплённые
	const fileResultsForQuery = useMemo(() => {
		if (!query.trim()) return [];
		return rankRecentFilesForQuery(
			buildQuickSearchRecentFilePool({
				recentFiles,
				recentLibraryOpened,
				recentLibraryAdded,
				recentLibraryGenerated,
				recentLibraryUploaded,
				recentLibraryProjects,
			}),
			query,
			8
		);
	}, [
		query,
		recentFiles,
		recentLibraryOpened,
		recentLibraryAdded,
		recentLibraryGenerated,
		recentLibraryUploaded,
		recentLibraryProjects,
	]);

	const qsBrowseDiscovery = useMemo(
		() =>
			buildDesktopLibraryDiscoverySlices({
				recentFiles,
				recentLibraryOpened,
				recentLibraryAdded,
				recentLibraryGenerated,
				recentLibraryUploaded,
				recentLibraryProjects,
				limits: {
					recentDocuments: 8,
					projects: 6,
					generated: 4,
					uploaded: 4,
					added: 4,
				},
			}),
		[
			recentFiles,
			recentLibraryOpened,
			recentLibraryAdded,
			recentLibraryGenerated,
			recentLibraryUploaded,
			recentLibraryProjects,
		]
	);

	const libraryRecentProjectsLimited = useMemo(
		() => (query ? [] : qsBrowseDiscovery.projects),
		[query, qsBrowseDiscovery.projects]
	);
	const actionResultsForQuery = useMemo(() => {
		if (!query.trim()) return quickActions;
		const q = query.toLowerCase();
		return quickActions.filter((a) => matchActionQuery(a, q)).slice(0, 5);
	}, [query, quickActions]);

	const recentAppsLimited = useMemo(
		() => (query ? [] : recentItems.slice(0, 5)),
		[query, recentItems]
	);
	const recentDocumentsUnifiedLimited = useMemo(
		() => (query.trim() ? [] : qsBrowseDiscovery.recentDocumentsUnified),
		[query, qsBrowseDiscovery.recentDocumentsUnified]
	);
	const libraryRecentGeneratedLimited = useMemo(
		() => (query ? [] : qsBrowseDiscovery.generated),
		[query, qsBrowseDiscovery.generated]
	);
	const libraryRecentUploadedLimited = useMemo(
		() => (query ? [] : qsBrowseDiscovery.uploaded),
		[query, qsBrowseDiscovery.uploaded]
	);
	const libraryRecentAddedLimited = useMemo(
		() => (query ? [] : qsBrowseDiscovery.added),
		[query, qsBrowseDiscovery.added]
	);
	const pinnedItems = useMemo(
		() => items.filter((i) => i.isPinned && i.type === 'app').slice(0, 5),
		[items]
	);
	const contentManagerItem = useMemo(
		() =>
			items.find(
				(i) =>
					i.type === 'app' &&
					(i.appComponent === 'ContentManagerPro' ||
						i.name.toLowerCase().includes('content manager'))
			) ?? null,
		[items]
	);

	const flatRows = useMemo((): LauncherRow[] => {
		if (query) {
			const appRows: LauncherRow[] = results.map((r) => ({
				type: 'app',
				data: r,
			}));
			const fileRows: LauncherRow[] = fileResultsForQuery.map((f) => ({
				type: 'file',
				data: f,
			}));
			const actionRows: LauncherRow[] = actionResultsForQuery.map((a) => ({
				type: 'action',
				data: a,
			}));
			return [...appRows, ...fileRows, ...actionRows];
		}
		const actionRows: LauncherRow[] = quickActions.map((a) => ({
			type: 'action',
			data: a,
		}));
		const recentAppRows: LauncherRow[] = recentAppsLimited.map((i) => ({
			type: 'app',
			data: i,
		}));
		const recentUnifiedFileRows: LauncherRow[] =
			recentDocumentsUnifiedLimited.map((f) => ({
				type: 'file',
				data: f,
			}));
		const libraryProjectFileRows: LauncherRow[] =
			libraryRecentProjectsLimited.map((f) => ({
				type: 'file',
				data: f,
			}));
		const libraryGeneratedFileRows: LauncherRow[] =
			libraryRecentGeneratedLimited.map((f) => ({
				type: 'file',
				data: f,
			}));
		const libraryUploadedFileRows: LauncherRow[] =
			libraryRecentUploadedLimited.map((f) => ({
				type: 'file',
				data: f,
			}));
		const libraryAddedFileRows: LauncherRow[] = libraryRecentAddedLimited.map(
			(f) => ({
				type: 'file',
				data: f,
			})
		);
		const pinnedRows: LauncherRow[] = pinnedItems.map((i) => ({
			type: 'app',
			data: i,
		}));
		return [
			...actionRows,
			...recentAppRows,
			...recentUnifiedFileRows,
			...libraryProjectFileRows,
			...libraryGeneratedFileRows,
			...libraryUploadedFileRows,
			...libraryAddedFileRows,
			...pinnedRows,
		];
	}, [
		query,
		results,
		fileResultsForQuery,
		actionResultsForQuery,
		quickActions,
		recentAppsLimited,
		recentDocumentsUnifiedLimited,
		libraryRecentProjectsLimited,
		libraryRecentGeneratedLimited,
		libraryRecentUploadedLimited,
		libraryRecentAddedLimited,
		pinnedItems,
	]);

	flatRowsRef.current = flatRows;

	const browseSectionStarts = useMemo(() => {
		let n = quickActions.length;
		const recentAppsStart = n;
		n += recentAppsLimited.length;
		const unifiedDocsStart = n;
		n += recentDocumentsUnifiedLimited.length;
		const projectsStart = n;
		n += libraryRecentProjectsLimited.length;
		const libGenStart = n;
		n += libraryRecentGeneratedLimited.length;
		const libUpStart = n;
		n += libraryRecentUploadedLimited.length;
		const libAddedStart = n;
		n += libraryRecentAddedLimited.length;
		const pinnedStart = n;
		return {
			recentAppsStart,
			unifiedDocsStart,
			projectsStart,
			libGenStart,
			libUpStart,
			libAddedStart,
			pinnedStart,
		};
	}, [
		quickActions.length,
		recentAppsLimited.length,
		recentDocumentsUnifiedLimited.length,
		libraryRecentProjectsLimited.length,
		libraryRecentGeneratedLimited.length,
		libraryRecentUploadedLimited.length,
		libraryRecentAddedLimited.length,
	]);

	const maxIndex = Math.max(0, flatRows.length - 1);
	useEffect(() => {
		setSelectedIndex((i) => (i > maxIndex ? maxIndex : i));
	}, [maxIndex]);

	useEffect(() => {
		if (isOpen) {
			setQuery('');
			setResults([]);
			setSelectedIndex(0);
		}
	}, [isOpen]);

	useDesktopShellSearchFocusOnVisible(inputRef, isOpen);

	const activateRow = useCallback(
		(row: LauncherRow) => {
			if (row.type === 'app') {
				const item =
					'item' in row.data
						? (row.data as SearchResult).item
						: (row.data as DesktopItem);
				onOpenItem(item);
			} else if (row.type === 'file' && onOpenRecentFile) {
				onOpenRecentFile(row.data);
			} else if (row.type === 'action' && onQuickAction) {
				onQuickAction(row.data.id);
			}
			onClose();
		},
		[onOpenItem, onOpenRecentFile, onQuickAction, onClose]
	);

	useShellCaptureKeyboard(isOpen, (e) => {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				e.stopPropagation();
				setSelectedIndex((i) => Math.min(i + 1, maxIndex));
				break;
			case 'ArrowUp':
				e.preventDefault();
				e.stopPropagation();
				setSelectedIndex((i) => Math.max(i - 1, 0));
				break;
			case 'Home':
				e.preventDefault();
				e.stopPropagation();
				setSelectedIndex(0);
				break;
			case 'End':
				e.preventDefault();
				e.stopPropagation();
				setSelectedIndex(maxIndex);
				break;
			case 'Enter':
				e.preventDefault();
				e.stopPropagation();
				{
					const row = flatRowsRef.current[selectedIndexRef.current];
					if (row) activateRow(row);
				}
				break;
		}
	});

	useShellCaptureEscape(isOpen && ctxMenu == null, onClose, {
		onLayer: () => consumeEscapeForSearchClear(query, () => setQuery('')),
	});

	// Focus trap: Tab / Shift+Tab cycle inside dialog
	const handleContainerKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key !== 'Tab') return;
		const el = containerRef.current;
		if (!el) return;
		const focusables = el.querySelectorAll<HTMLElement>(
			'input, button, a[href], [tabindex]:not([tabindex="-1"])'
		);
		const arr = Array.from(focusables);
		if (arr.length === 0) return;
		const currentIndex = arr.indexOf(document.activeElement as HTMLElement);
		if (currentIndex === -1) return;
		if (e.shiftKey) {
			if (currentIndex === 0) {
				e.preventDefault();
				arr[arr.length - 1].focus();
			}
		} else {
			if (currentIndex === arr.length - 1) {
				e.preventDefault();
				arr[0].focus();
			}
		}
	}, []);

	// Get icon for item (папки/файлы; приложения — через DesktopAppBadge)
	const getItemIcon = (item: DesktopItem) => {
		if (item.icon) return item.icon;
		if (item.type === 'folder') return <FolderIcon className="w-full h-full" />;
		if (item.type === 'file')
			return <DocumentTextIcon className="w-full h-full" />;
		return null;
	};

	const renderLauncherLeadingIcon = (item: DesktopItem) => {
		if (item.type === 'app') {
			return (
				<DesktopAppBadge
					appComponent={item.appComponent}
					icon={item.icon ?? undefined}
					variant="list"
					iconStyle={iconStyle}
					className="h-10 w-10 shrink-0"
				/>
			);
		}
		return (
			<div
				className={`w-10 h-10 rounded-lg shrink-0 bg-linear-to-br ${item.gradient || 'from-[rgb(var(--desktop-bg-secondary-rgb))] to-[rgb(var(--desktop-border-rgb))]'} p-2 flex items-center justify-center`}
			>
				{getItemIcon(item)}
			</div>
		);
	};

	const renderRecentFileLeadingIcon = (file: RecentFile) => (
		<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--desktop-surface-soft) p-2">
			{file.type === 'project' ? (
				<FolderIcon className="h-full w-full text-(--desktop-text-muted)" />
			) : (
				<DocumentTextIcon className="h-full w-full text-(--desktop-text-muted)" />
			)}
		</div>
	);

	// Highlight matching text
	const highlightMatch = (text: string, searchQuery: string) => {
		if (!searchQuery) return text;

		const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
		let sliceStart = 0;
		return (
			<>
				{parts.map((part) => {
					const key = `h-${sliceStart}`;
					sliceStart += part.length;
					return part.toLowerCase() === searchQuery.toLowerCase() ? (
						<span key={key} className={DESKTOP_TYPOGRAPHY.matchHighlight}>
							{part}
						</span>
					) : (
						<span key={key}>{part}</span>
					);
				})}
			</>
		);
	};

	const { style: portalShellStyle, theme: portalTheme } =
		getDesktopPortalShellProps();

	const qsMenuPortal =
		ctxMenu && typeof document !== 'undefined'
			? createPortal(
					<div
						style={portalShellStyle}
						className={portalTheme === 'dark' ? 'dark' : ''}
					>
						<div
							ref={ctxMenuRef}
							role="menu"
							aria-label={t('quickSearch.ctxMenuAria')}
							className="fixed text-(--desktop-text-primary)"
							style={{
								...(() => {
									const h =
										ctxMenu.kind === 'app'
											? 220
											: ctxMenu.kind === 'file'
												? 180
												: 56;
									const p = getFloatingMenuPosition(
										{ x: ctxMenu.x, y: ctxMenu.y },
										{
											menuWidth: 228,
											menuHeight: h,
											viewportHeight:
												typeof window !== 'undefined'
													? window.innerHeight
													: undefined,
										}
									);
									return { left: p.x, top: p.y };
								})(),
								zIndex:
									portalStackBase +
									DESKTOP_PORTAL_STACK_BUMP.QUICK_SEARCH_CTX_MENU,
							}}
							onPointerDown={(e) => e.stopPropagation()}
						>
							<DesktopAppMenuSurface
								className={cn(
									'min-w-[200px] border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.45)] ring-1 ring-(--desktop-border-menu)'
								)}
							>
								{ctxMenu.kind === 'app' ? (
									<>
										<DesktopAppMenuItem
											type="button"
											icon={
												<PlayIcon
													className="h-4 w-4"
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											}
											onClick={() => {
												onOpenItem(ctxMenu.item);
												closeCtxMenu();
												onClose();
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{t('quickSearch.ctxOpen')}
										</DesktopAppMenuItem>
										{onPinAppToDesktop &&
										ctxMenu.item.type === 'app' &&
										!isSystemDesktopApp(ctxMenu.item) ? (
											<DesktopAppMenuItem
												type="button"
												icon={
													<MapPinIcon
														className="h-4 w-4"
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												}
												onClick={() => {
													onPinAppToDesktop(ctxMenu.item);
													closeCtxMenu();
												}}
												className={DESKTOP_INTERACTIVE.focusRing}
											>
												{t('quickSearch.ctxPin')}
											</DesktopAppMenuItem>
										) : null}
										<DesktopAppMenuDivider />
										<DesktopAppMenuItem
											type="button"
											icon={
												<DocumentDuplicateIcon
													className="h-4 w-4"
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											}
											onClick={() => {
												void copyLauncherText(ctxMenu.item.name);
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{t('quickSearch.ctxCopyName')}
										</DesktopAppMenuItem>
									</>
								) : ctxMenu.kind === 'file' ? (
									<>
										{onOpenRecentFile ? (
											<DesktopAppMenuItem
												type="button"
												icon={
													<PlayIcon
														className="h-4 w-4"
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												}
												onClick={() => {
													onOpenRecentFile(ctxMenu.file);
													closeCtxMenu();
													onClose();
												}}
												className={DESKTOP_INTERACTIVE.focusRing}
											>
												{t('quickSearch.ctxOpen')}
											</DesktopAppMenuItem>
										) : null}
										<DesktopAppMenuItem
											type="button"
											icon={
												<DocumentDuplicateIcon
													className="h-4 w-4"
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											}
											onClick={() => {
												void copyLauncherText(ctxMenu.file.path);
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{t('quickSearch.ctxCopyPath')}
										</DesktopAppMenuItem>
										{removeRecentFile && ctxMenu.file.type !== 'project' ? (
											<DesktopAppMenuItem
												type="button"
												tone="danger"
												icon={
													<TrashIcon
														className="h-4 w-4"
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												}
												onClick={() => {
													removeRecentFile(ctxMenu.file.id);
													closeCtxMenu();
												}}
												className={DESKTOP_INTERACTIVE.focusRing}
											>
												{t('quickSearch.ctxRemoveRecent')}
											</DesktopAppMenuItem>
										) : null}
									</>
								) : onQuickAction ? (
									<DesktopAppMenuItem
										type="button"
										icon={
											<BoltIcon
												className="h-4 w-4"
												strokeWidth={DESKTOP_LUCIDE.stroke}
											/>
										}
										onClick={() => {
											onQuickAction(ctxMenu.action.id);
											closeCtxMenu();
											onClose();
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{t('quickSearch.ctxRun')}
									</DesktopAppMenuItem>
								) : null}
							</DesktopAppMenuSurface>
						</div>
					</div>,
					document.body
				)
			: null;

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					{/* Backdrop */}
					<m.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className={`fixed inset-0 ${DESKTOP_OVERLAY.backdrop}`}
						style={{ zIndex: embeddedModalZ.backdrop }}
						onClick={onClose}
						aria-hidden
					/>

					{/* MagnifyingGlassIcon Dialog */}
					<m.div
						ref={containerRef}
						role="dialog"
						aria-modal="true"
						aria-label={t('quickSearch.dialogLabel')}
						data-desktop-shell-keyboard-surface=""
						variants={searchVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						className={cn(
							'fixed top-24 left-1/2 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden',
							getDesktopShellPanelClassName(shellWindowStyle, 'strong')
						)}
						style={{ zIndex: embeddedModalZ.content }}
						onKeyDown={handleContainerKeyDown}
					>
						{/* MagnifyingGlassIcon Input */}
						<div
							className={cn(
								'relative flex items-center border-b border-(--desktop-border-subtle) px-4 py-3.5',
								'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_32%,transparent)]'
							)}
						>
							<div
								className="pointer-events-none absolute left-4 flex h-9 w-9 items-center justify-center rounded-lg bg-(--desktop-surface-soft) text-(--desktop-text-muted) [&_svg]:stroke-[1.35]"
								aria-hidden
							>
								<MagnifyingGlassIcon
									className="h-4 w-4"
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							</div>
							<input
								ref={inputRef}
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder={t('quickSearch.searchPlaceholder')}
								aria-label={t('quickSearch.searchAria')}
								className={cn(
									'w-full border-0 bg-transparent py-2 pl-11 pr-10 outline-none focus:ring-0',
									DESKTOP_TYPOGRAPHY.quickSearchInput
								)}
								autoComplete="off"
							/>
							{query && (
								<DesktopChromeTooltip
									content={t('quickSearch.clearAria')}
									placement="bottom"
									offsetExtra={6}
								>
									<DesktopAppButton
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setQuery('')}
										aria-label={t('quickSearch.clearAria')}
										className="absolute! right-4! min-w-0! rounded-lg! p-1!"
									>
										<XMarkIcon className="h-4 w-4 text-(--desktop-text-muted)" />
									</DesktopAppButton>
								</DesktopChromeTooltip>
							)}
						</div>
						<div className={cn(DESKTOP_QUICK_SEARCH_ROLE_PANEL)}>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<DesktopAppSectionLabel className="tracking-[0.16em]">
										{t('quickSearch.roleTitle')}
									</DesktopAppSectionLabel>
									<p
										className={cn(
											DESKTOP_TYPOGRAPHY.meta,
											'mt-1 leading-relaxed'
										)}
									>
										{t('quickSearch.roleDescription')}
									</p>
								</div>
								<span
									className={cn(
										DESKTOP_TYPOGRAPHY.sectionPill,
										'shrink-0 rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1'
									)}
									aria-hidden
								>
									{t('quickSearch.roleBadge')}
								</span>
							</div>
						</div>
						{onRefetchRecentContentFeed ||
						recentContentFeedLoading ||
						recentContentFeedError ? (
							<div className={DESKTOP_QUICK_SEARCH_FEED_STATUS_STRIP}>
								<div className="flex flex-wrap items-center gap-2">
									{recentContentFeedLoading ? (
										<span
											className={cn(
												DESKTOP_TYPOGRAPHY.caption,
												'text-(--desktop-text-muted) animate-pulse'
											)}
										>
											{t('quickSearch.libraryFeedLoading')}
										</span>
									) : null}
									{recentContentFeedError ? (
										<p
											className={cn(
												'rounded-md border px-2 py-1.5 text-sm',
												'border-red-500/25 bg-red-500/6 text-(--desktop-text-primary)'
											)}
											role="alert"
										>
											{recentContentFeedError}
										</p>
									) : null}
									{onRefetchRecentContentFeed ? (
										<DesktopAppButton
											type="button"
											variant="ghost"
											size="sm"
											disabled={recentContentFeedLoading}
											onClick={() => void onRefetchRecentContentFeed()}
											className="ms-auto"
										>
											<ArrowPathIcon
												className={cn(
													'h-3.5 w-3.5',
													recentContentFeedLoading && 'animate-spin'
												)}
												strokeWidth={DESKTOP_LUCIDE.stroke}
												aria-hidden
											/>
											<span className="ms-1.5">
												{t('quickSearch.refreshLibrary')}
											</span>
										</DesktopAppButton>
									) : null}
								</div>
							</div>
						) : null}

						{/* Results: grouped (Приложения / Недавние файлы / Быстрые действия), flat keyboard nav */}
						<div className="max-h-[min(60vh,calc(100dvh-13rem),520px)] overflow-y-auto overscroll-y-contain">
							{flatRows.length === 0 && query ? (
								<DesktopAppEmptyState
									className="py-10"
									icon={
										<MagnifyingGlassIcon
											className="h-8 w-8 text-(--desktop-text-muted)"
											strokeWidth={1.75}
											aria-hidden
										/>
									}
									title={t('quickSearch.emptyTitle')}
									description={t('quickSearch.emptyDescription')}
								/>
							) : (
								<div className="p-2 space-y-4">
									{query && results.length > 0 && (
										<section>
											<div
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'uppercase tracking-wider px-3 py-2 flex items-center gap-2'
												)}
											>
												<StarIcon className="w-3 h-3" />
												{t('quickSearch.appsHeading')}
											</div>
											{results.map((result, idx) => {
												const flatIdx = idx;
												const item = result.item;
												return (
													<QuickSearchLauncherRow
														key={item.id}
														tooltip={quickSearchLauncherTooltipLabel(
															item.name,
															item.description
														)}
														variants={itemVariants}
														onClick={() =>
															activateRow({ type: 'app', data: result })
														}
														onContextMenu={(e) => openAppCtx(e, result)}
														onMouseEnter={() => setSelectedIndex(flatIdx)}
														className={qsLauncherRowClass(
															selectedIndex === flatIdx
														)}
													>
														{renderLauncherLeadingIcon(item)}
														<div className="flex-1 min-w-0">
															<div className="font-medium truncate">
																{highlightMatch(item.name, query)}
															</div>
															{item.description && (
																<div
																	className={cn(
																		DESKTOP_TYPOGRAPHY.meta,
																		'truncate'
																	)}
																>
																	{item.description}
																</div>
															)}
														</div>
														<span
															className={cn(
																DESKTOP_TYPOGRAPHY.meta,
																'capitalize shrink-0'
															)}
														>
															{item.type === 'app'
																? t('quickSearch.appKind')
																: item.type === 'folder'
																	? t('quickSearch.folderKind')
																	: t('quickSearch.fileKind')}
														</span>
														<ChevronRightIcon className="w-4 h-4 text-(--desktop-text-muted) shrink-0" />
													</QuickSearchLauncherRow>
												);
											})}
										</section>
									)}
									{query &&
										fileResultsForQuery.length > 0 &&
										onOpenRecentFile && (
											<section>
												<div
													className={cn(
														DESKTOP_TYPOGRAPHY.meta,
														'uppercase tracking-wider px-3 py-2 flex items-center gap-2'
													)}
												>
													<ClockIcon className="w-3 h-3" />
													{t('quickSearch.recentFilesHeading')}
												</div>
												{fileResultsForQuery.map((file, idx) => {
													const flatIdx = results.length + idx;
													return (
														<QuickSearchLauncherRow
															key={file.id}
															tooltip={quickSearchLauncherTooltipLabel(
																file.name,
																file.path
															)}
															variants={itemVariants}
															onClick={() =>
																activateRow({ type: 'file', data: file })
															}
															onContextMenu={(e) => openFileCtx(e, file)}
															onMouseEnter={() => setSelectedIndex(flatIdx)}
															className={qsLauncherRowClass(
																selectedIndex === flatIdx
															)}
														>
															{renderRecentFileLeadingIcon(file)}
															<div className="flex-1 min-w-0">
																<div className="font-medium truncate">
																	{file.name}
																</div>
																<div
																	className={cn(
																		DESKTOP_TYPOGRAPHY.meta,
																		'truncate'
																	)}
																>
																	{file.path}
																</div>
															</div>
															<ChevronRightIcon className="w-4 h-4 text-(--desktop-text-muted) shrink-0" />
														</QuickSearchLauncherRow>
													);
												})}
											</section>
										)}
									{query &&
										actionResultsForQuery.length > 0 &&
										onQuickAction && (
											<section>
												<div
													className={cn(
														DESKTOP_TYPOGRAPHY.meta,
														'uppercase tracking-wider px-3 py-2 flex items-center gap-2'
													)}
												>
													<BoltIcon className="w-3 h-3" />
													{t('quickSearch.quickActionsHeading')}
												</div>
												{actionResultsForQuery.map((action, idx) => {
													const flatIdx =
														results.length + fileResultsForQuery.length + idx;
													return (
														<QuickSearchLauncherRow
															key={action.id}
															tooltip={quickSearchLauncherTooltipLabel(
																action.label,
																action.description
															)}
															variants={itemVariants}
															onClick={() =>
																activateRow({ type: 'action', data: action })
															}
															onContextMenu={(e) => openActionCtx(e, action)}
															onMouseEnter={() => setSelectedIndex(flatIdx)}
															className={qsLauncherRowClass(
																selectedIndex === flatIdx
															)}
														>
															<div
																className={cn(
																	'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--desktop-accent-rgb)/0.18)] p-2',
																	DESKTOP_TYPOGRAPHY.matchHighlight
																)}
															>
																{action.icon ?? (
																	<BoltIcon className="h-5 w-5" />
																)}
															</div>
															<div className="flex-1 min-w-0">
																<div className="font-medium truncate">
																	{action.label}
																</div>
																{action.description && (
																	<div
																		className={cn(
																			DESKTOP_TYPOGRAPHY.meta,
																			'truncate'
																		)}
																	>
																		{action.description}
																	</div>
																)}
															</div>
															<ChevronRightIcon className="w-4 h-4 text-(--desktop-text-muted) shrink-0" />
														</QuickSearchLauncherRow>
													);
												})}
											</section>
										)}
									{!query && quickActions.length > 0 && onQuickAction && (
										<section>
											<div
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'uppercase tracking-wider px-3 py-2 flex items-center gap-2'
												)}
											>
												<BoltIcon className="w-3 h-3" />
												{t('quickSearch.quickActionsHeading')}
											</div>
											{quickActions.map((action, idx) => (
												<QuickSearchLauncherRow
													key={action.id}
													tooltip={quickSearchLauncherTooltipLabel(
														action.label,
														action.description
													)}
													variants={itemVariants}
													onClick={() =>
														activateRow({ type: 'action', data: action })
													}
													onContextMenu={(e) => openActionCtx(e, action)}
													onMouseEnter={() => setSelectedIndex(idx)}
													className={qsLauncherRowClass(selectedIndex === idx)}
												>
													<div
														className={cn(
															'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--desktop-accent-rgb)/0.18)] p-2',
															DESKTOP_TYPOGRAPHY.matchHighlight
														)}
													>
														{action.icon ?? <BoltIcon className="h-5 w-5" />}
													</div>
													<div className="flex-1 min-w-0">
														<div className="font-medium truncate">
															{action.label}
														</div>
														{action.description && (
															<div
																className={cn(
																	DESKTOP_TYPOGRAPHY.meta,
																	'truncate'
																)}
															>
																{action.description}
															</div>
														)}
													</div>
													<ChevronRightIcon className="w-4 h-4 text-(--desktop-text-muted) shrink-0" />
												</QuickSearchLauncherRow>
											))}
										</section>
									)}
									{!query && recentAppsLimited.length > 0 && (
										<section>
											<div
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'uppercase tracking-wider px-3 py-2 flex items-center gap-2'
												)}
											>
												<StarIcon className="w-3 h-3" />
												{t('quickSearch.recentAppsHeading')}
											</div>
											{recentAppsLimited.map((item, idx) => {
												const flatIdx =
													browseSectionStarts.recentAppsStart + idx;
												return (
													<QuickSearchLauncherRow
														key={item.id}
														tooltip={item.name}
														variants={itemVariants}
														onClick={() =>
															activateRow({ type: 'app', data: item })
														}
														onContextMenu={(e) => openAppCtx(e, item)}
														onMouseEnter={() => setSelectedIndex(flatIdx)}
														className={qsLauncherRowClass(
															selectedIndex === flatIdx
														)}
													>
														{renderLauncherLeadingIcon(item)}
														<div className="flex-1 min-w-0">
															<div className="font-medium truncate">
																{item.name}
															</div>
														</div>
														<ChevronRightIcon className="w-4 h-4 text-(--desktop-text-muted) shrink-0" />
													</QuickSearchLauncherRow>
												);
											})}
										</section>
									)}
									{!query &&
										recentDocumentsUnifiedLimited.length === 0 &&
										onOpenRecentFile &&
										contentManagerItem && (
											<section className="px-3 py-4">
												<DesktopAppEmptyState
													className="py-6"
													title={t('quickSearch.recentFilesHeading')}
													description={t('quickSearch.noRecentFilesHelpDesc')}
												>
													<DesktopAppButton
														type="button"
														variant="neutral"
														size="sm"
														onClick={() => onOpenItem(contentManagerItem)}
													>
														{t('quickSearch.noRecentFilesHelp')}
													</DesktopAppButton>
												</DesktopAppEmptyState>
											</section>
										)}
									{!query &&
										recentDocumentsUnifiedLimited.length > 0 &&
										onOpenRecentFile && (
											<section
												className={DESKTOP_LIBRARY_FEED_CARD_QUICK_SEARCH}
											>
												<div className="flex gap-2.5">
													<div
														className={
															DESKTOP_LIBRARY_FEED_ICON_WRAP_QUICK_SEARCH
														}
														aria-hidden
													>
														<ClockIcon
															className="h-3.5 w-3.5"
															strokeWidth={DESKTOP_LUCIDE.stroke}
															aria-hidden
														/>
													</div>
													<div className="min-w-0 flex-1">
														<div
															className={cn(
																DESKTOP_TYPOGRAPHY.meta,
																'flex items-center gap-2 py-1.5 uppercase tracking-wider'
															)}
														>
															{t('quickSearch.recentDocumentsUnifiedHeading')}
														</div>
														{recentDocumentsUnifiedLimited.map((file, idx) => {
															const flatIdx =
																browseSectionStarts.unifiedDocsStart + idx;
															return (
																<QuickSearchLauncherRow
																	key={`doc-uni-${file.id}`}
																	tooltip={quickSearchLauncherTooltipLabel(
																		file.name,
																		file.path
																	)}
																	variants={itemVariants}
																	onClick={() =>
																		activateRow({ type: 'file', data: file })
																	}
																	onContextMenu={(e) => openFileCtx(e, file)}
																	onMouseEnter={() => setSelectedIndex(flatIdx)}
																	className={qsLauncherRowClass(
																		selectedIndex === flatIdx,
																		true
																	)}
																>
																	{renderRecentFileLeadingIcon(file)}
																	<div className="min-w-0 flex-1">
																		<div className="truncate font-medium">
																			{file.name}
																		</div>
																		<div
																			className={cn(
																				DESKTOP_TYPOGRAPHY.meta,
																				'truncate'
																			)}
																		>
																			{file.path}
																		</div>
																	</div>
																	<ChevronRightIcon className="h-4 w-4 shrink-0 text-(--desktop-text-muted)" />
																</QuickSearchLauncherRow>
															);
														})}
													</div>
												</div>
											</section>
										)}
									{!query &&
										libraryRecentProjectsLimited.length > 0 &&
										onOpenRecentFile && (
											<section
												className={DESKTOP_LIBRARY_FEED_CARD_QUICK_SEARCH}
											>
												<div className="flex gap-2.5">
													<div
														className={
															DESKTOP_LIBRARY_FEED_ICON_WRAP_QUICK_SEARCH
														}
														aria-hidden
													>
														<FolderIcon
															className="h-3.5 w-3.5"
															strokeWidth={DESKTOP_LUCIDE.stroke}
															aria-hidden
														/>
													</div>
													<div className="min-w-0 flex-1">
														<div
															className={cn(
																DESKTOP_TYPOGRAPHY.meta,
																'flex items-center gap-2 py-1.5 uppercase tracking-wider'
															)}
														>
															{t('quickSearch.recentProjectsHeading')}
														</div>
														{libraryRecentProjectsLimited.map((file, idx) => {
															const flatIdx =
																browseSectionStarts.projectsStart + idx;
															return (
																<QuickSearchLauncherRow
																	key={`lib-proj-${file.id}`}
																	tooltip={quickSearchLauncherTooltipLabel(
																		file.name,
																		file.path
																	)}
																	variants={itemVariants}
																	onClick={() =>
																		activateRow({ type: 'file', data: file })
																	}
																	onContextMenu={(e) => openFileCtx(e, file)}
																	onMouseEnter={() => setSelectedIndex(flatIdx)}
																	className={qsLauncherRowClass(
																		selectedIndex === flatIdx,
																		true
																	)}
																>
																	{renderRecentFileLeadingIcon(file)}
																	<div className="min-w-0 flex-1">
																		<div className="truncate font-medium">
																			{file.name}
																		</div>
																		<div
																			className={cn(
																				DESKTOP_TYPOGRAPHY.meta,
																				'truncate'
																			)}
																		>
																			{file.path}
																		</div>
																	</div>
																	<ChevronRightIcon className="h-4 w-4 shrink-0 text-(--desktop-text-muted)" />
																</QuickSearchLauncherRow>
															);
														})}
													</div>
												</div>
											</section>
										)}
									{!query &&
										libraryRecentGeneratedLimited.length > 0 &&
										onOpenRecentFile && (
											<section
												className={DESKTOP_LIBRARY_FEED_CARD_QUICK_SEARCH}
											>
												<div className="flex gap-2.5">
													<div
														className={
															DESKTOP_LIBRARY_FEED_ICON_WRAP_QUICK_SEARCH
														}
														aria-hidden
													>
														<SparklesIcon
															className="h-3.5 w-3.5"
															strokeWidth={DESKTOP_LUCIDE.stroke}
															aria-hidden
														/>
													</div>
													<div className="min-w-0 flex-1">
														<div
															className={cn(
																DESKTOP_TYPOGRAPHY.meta,
																'flex items-center gap-2 py-1.5 uppercase tracking-wider'
															)}
														>
															{t('quickSearch.libraryGeneratedHeading')}
														</div>
														{libraryRecentGeneratedLimited.map((file, idx) => {
															const flatIdx =
																browseSectionStarts.libGenStart + idx;
															return (
																<QuickSearchLauncherRow
																	key={`lib-gen-${file.id}`}
																	tooltip={quickSearchLauncherTooltipLabel(
																		file.name,
																		file.path
																	)}
																	variants={itemVariants}
																	onClick={() =>
																		activateRow({ type: 'file', data: file })
																	}
																	onContextMenu={(e) => openFileCtx(e, file)}
																	onMouseEnter={() => setSelectedIndex(flatIdx)}
																	className={qsLauncherRowClass(
																		selectedIndex === flatIdx,
																		true
																	)}
																>
																	{renderRecentFileLeadingIcon(file)}
																	<div className="min-w-0 flex-1">
																		<div className="truncate font-medium">
																			{file.name}
																		</div>
																		<div
																			className={cn(
																				DESKTOP_TYPOGRAPHY.meta,
																				'truncate'
																			)}
																		>
																			{file.path}
																		</div>
																	</div>
																	<ChevronRightIcon className="h-4 w-4 shrink-0 text-(--desktop-text-muted)" />
																</QuickSearchLauncherRow>
															);
														})}
													</div>
												</div>
											</section>
										)}
									{!query &&
										libraryRecentUploadedLimited.length > 0 &&
										onOpenRecentFile && (
											<section
												className={DESKTOP_LIBRARY_FEED_CARD_QUICK_SEARCH}
											>
												<div className="flex gap-2.5">
													<div
														className={
															DESKTOP_LIBRARY_FEED_ICON_WRAP_QUICK_SEARCH
														}
														aria-hidden
													>
														<ArrowUpTrayIcon
															className="h-3.5 w-3.5"
															strokeWidth={DESKTOP_LUCIDE.stroke}
															aria-hidden
														/>
													</div>
													<div className="min-w-0 flex-1">
														<div
															className={cn(
																DESKTOP_TYPOGRAPHY.meta,
																'flex items-center gap-2 py-1.5 uppercase tracking-wider'
															)}
														>
															{t('quickSearch.libraryUploadedHeading')}
														</div>
														{libraryRecentUploadedLimited.map((file, idx) => {
															const flatIdx =
																browseSectionStarts.libUpStart + idx;
															return (
																<QuickSearchLauncherRow
																	key={`lib-up-${file.id}`}
																	tooltip={quickSearchLauncherTooltipLabel(
																		file.name,
																		file.path
																	)}
																	variants={itemVariants}
																	onClick={() =>
																		activateRow({ type: 'file', data: file })
																	}
																	onContextMenu={(e) => openFileCtx(e, file)}
																	onMouseEnter={() => setSelectedIndex(flatIdx)}
																	className={qsLauncherRowClass(
																		selectedIndex === flatIdx,
																		true
																	)}
																>
																	{renderRecentFileLeadingIcon(file)}
																	<div className="min-w-0 flex-1">
																		<div className="truncate font-medium">
																			{file.name}
																		</div>
																		<div
																			className={cn(
																				DESKTOP_TYPOGRAPHY.meta,
																				'truncate'
																			)}
																		>
																			{file.path}
																		</div>
																	</div>
																	<ChevronRightIcon className="h-4 w-4 shrink-0 text-(--desktop-text-muted)" />
																</QuickSearchLauncherRow>
															);
														})}
													</div>
												</div>
											</section>
										)}
									{!query &&
										libraryRecentAddedLimited.length > 0 &&
										onOpenRecentFile && (
											<section
												className={DESKTOP_LIBRARY_FEED_CARD_QUICK_SEARCH}
											>
												<div className="flex gap-2.5">
													<div
														className={
															DESKTOP_LIBRARY_FEED_ICON_WRAP_QUICK_SEARCH
														}
														aria-hidden
													>
														<PlusIcon
															className="h-3.5 w-3.5"
															strokeWidth={DESKTOP_LUCIDE.stroke}
															aria-hidden
														/>
													</div>
													<div className="min-w-0 flex-1">
														<div
															className={cn(
																DESKTOP_TYPOGRAPHY.meta,
																'flex items-center gap-2 py-1.5 uppercase tracking-wider'
															)}
														>
															{t('quickSearch.libraryAddedHeading')}
														</div>
														{libraryRecentAddedLimited.map((file, idx) => {
															const flatIdx =
																browseSectionStarts.libAddedStart + idx;
															return (
																<QuickSearchLauncherRow
																	key={`lib-added-${file.id}`}
																	tooltip={quickSearchLauncherTooltipLabel(
																		file.name,
																		file.path
																	)}
																	variants={itemVariants}
																	onClick={() =>
																		activateRow({ type: 'file', data: file })
																	}
																	onContextMenu={(e) => openFileCtx(e, file)}
																	onMouseEnter={() => setSelectedIndex(flatIdx)}
																	className={qsLauncherRowClass(
																		selectedIndex === flatIdx,
																		true
																	)}
																>
																	{renderRecentFileLeadingIcon(file)}
																	<div className="min-w-0 flex-1">
																		<div className="truncate font-medium">
																			{file.name}
																		</div>
																		<div
																			className={cn(
																				DESKTOP_TYPOGRAPHY.meta,
																				'truncate'
																			)}
																		>
																			{file.path}
																		</div>
																	</div>
																	<ChevronRightIcon className="h-4 w-4 shrink-0 text-(--desktop-text-muted)" />
																</QuickSearchLauncherRow>
															);
														})}
													</div>
												</div>
											</section>
										)}
									{!query && pinnedItems.length > 0 && (
										<section className="border-t border-(--desktop-border-subtle) pt-2">
											<div
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'uppercase tracking-wider px-3 py-2 flex items-center gap-2'
												)}
											>
												<StarIcon className="w-3 h-3" />
												{t('quickSearch.pinnedHeading')}
											</div>
											{pinnedItems.map((item, idx) => {
												const flatIdx = browseSectionStarts.pinnedStart + idx;
												return (
													<QuickSearchLauncherRow
														key={item.id}
														tooltip={item.name}
														variants={itemVariants}
														onClick={() =>
															activateRow({ type: 'app', data: item })
														}
														onContextMenu={(e) => openAppCtx(e, item)}
														onMouseEnter={() => setSelectedIndex(flatIdx)}
														className={qsLauncherRowClass(
															selectedIndex === flatIdx
														)}
													>
														{renderLauncherLeadingIcon(item)}
														<div className="flex-1 min-w-0">
															<div className="font-medium truncate">
																{item.name}
															</div>
														</div>
														<ChevronRightIcon className="w-4 h-4 text-(--desktop-text-muted) shrink-0" />
													</QuickSearchLauncherRow>
												);
											})}
										</section>
									)}
								</div>
							)}
						</div>

						{/* Footer Tips */}
						<div
							className={cn(
								DESKTOP_TYPOGRAPHY.meta,
								'px-5 py-3 border-t border-(--desktop-border-subtle) flex items-center justify-between'
							)}
						>
							<div className="flex items-center gap-4">
								<span>{t('quickSearch.footerNav')}</span>
								<span>{t('quickSearch.footerOpen')}</span>
								<span>{t('quickSearch.footerClose')}</span>
							</div>
							<div className="text-end">
								{!query ? (
									<span data-testid="quick-search-empty-browse-hint">
										{t('quickSearch.emptyBrowseHint')}
									</span>
								) : (
									t('quickSearch.footerWinS')
								)}
							</div>
						</div>
					</m.div>
					{qsMenuPortal}
				</>
			)}
		</AnimatePresence>
	);
};
