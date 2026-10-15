/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop app: company news feed (EWDesk) — list, reading pane, filters, server-synced state, and
 * operator-visible draft suggestions handed off from Professional Worlds.
 *
 * Invariants:
 * - List loads without post body; full Markdown fetched per selected id only.
 * - Text search and list filters (pinned/unread/starred/sort) use server GET /news query params.
 * - Search `q` matches title/body (FTS) and post id prefix when query looks like a UUID fragment.
 * - Feed pages load via limit/offset infinite query + scroll sentinel auto load-more.
 * - Read/starred merge localStorage with GET/PATCH /news/my-state when authenticated.
 *
 * Related:
 * - components/ewDesk/*, services/productDesktopApi.ts, documentation/product/desktop/EWDESK-NEWS.md
 * - DesktopChromeTooltip.tsx
 */
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MOBILE_EMBEDDED_APP_ROOT_CLASS } from '@/components/mobileEmbedded/mobileEmbeddedLayoutTokens';
import { isMobileEwDeskEmbeddedRoute } from '@/utils/mobileEmbeddedSpaRoute';
import { cn } from '@/utils/cn';
import { safeCopyToClipboard } from '@/utils/clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'framer-motion';
import * as React from 'react';
import remarkBreaks from 'remark-breaks';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPreferencesApp } from '../../../contexts/UserPreferencesAppContext';
import {
	DEFAULT_UI_PREFERENCES,
	normalizeDesktopIconStyle,
} from '../../../types/profile';
import { useDesktopShellFrame } from '../context/DesktopShellFrameContext';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
	DESKTOP_SURFACE,
	DESKTOP_TYPOGRAPHY,
} from '../constants';
import { useDesktopWindowPortalStackBase } from '../context/DesktopWindowPortalStackContext';
import { getFloatingMenuPosition } from '../utils/desktopUi';
import {
	DesktopAppSymbol,
	DESKTOP_WINDOW_FRAME_STYLES,
	getDesktopShellContentPanelClassName,
	getDesktopShellHeaderStripClassName,
	getDesktopShellNavRailClassName,
	getDesktopShellToolbarClusterClassName,
	getDesktopShellToolbarClusterInsetControlClassName,
} from '../utils/desktopVisualSystem';
import type { CompanyNewsPost } from '../services/productDesktopApi';
import { ewDeskNewsPostQueryOptions } from './ewDesk/ewDeskNewsQueryOptions';
import {
	DesktopAppButton,
	DesktopAppContentWrapper,
	DesktopAppEmptyState,
	DesktopAppInput,
	DesktopAppMenuDivider,
	DesktopAppMenuItem,
	DesktopAppMenuSurface,
	DesktopAppSectionLabel,
	DesktopAppSkeleton,
	DESKTOP_APP_STYLE_CONTRACT,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { ProductAssistantMarkdown } from './ProductAssistantMarkdown';
import {
	ArrowPathIcon,
	ArrowsUpDownIcon,
	CalendarIcon,
	ChevronLeftIcon,
	ClipboardDocumentIcon,
	ExclamationCircleIcon,
	InboxIcon,
	LinkIcon,
	MagnifyingGlassIcon,
	MapPinIcon,
	NewspaperIcon,
	StarIcon,
} from '@heroicons/react/24/outline';
import {
	EW_DESK_DETAIL_PANEL_ID,
	EW_DESK_LISTBOX_ID,
	EW_DESK_LIST_SKELETON_STAGGER,
	EWDESK_MARK_ALL_READ_CONFIRM_MIN,
	ewDeskListOptionDomId,
	type EwDeskReadingWidth,
} from './ewDesk/ewDeskConstants';
import {
	formatEwDeskNewsDate,
	formatEwDeskRelativeNewsDate,
} from './ewDesk/ewDeskFormatting';
import {
	loadEwDeskReadingWidth,
	persistEwDeskReadingWidth,
} from './ewDesk/ewDeskLocalState';
import { EwDeskNewsListRow } from './ewDesk/EwDeskNewsListRow';
import {
	EwDeskNewsAudio,
	EwDeskNewsImage,
	EwDeskNewsVideo,
} from './ewDesk/EwDeskNewsMedia';
import { useEwDeskUserStateSync } from './ewDesk/useEwDeskUserStateSync';
import { useEwDeskNewsCounts } from './ewDesk/useEwDeskNewsCounts';
import { useEwDeskNewsFeed } from './ewDesk/useEwDeskNewsFeed';
import { useEwDeskNewsAutoLoadMore } from './ewDesk/useEwDeskNewsAutoLoadMore';
import {
	buildEwDeskFeedFiltersFromListState,
	DEFAULT_EWDESK_LIST_FILTER_STATE,
	isEwDeskListFiltersActive,
} from './ewDesk/ewDeskListFilterState';
import { resolveEwDeskPostReadToggleAction } from './ewDesk/ewDeskPostReadToggle';
import { getEwDeskActiveFilterParts } from './ewDesk/ewDeskActiveFilterParts';
import { buildEwDeskNewsDeepLink } from './ewDesk/ewDeskDeepLink';
import type { ProfessionalWorldsEwDeskSuggestion } from '@/features/professional-worlds/desktop/professionalWorldsCrossAppDraft';
import { stashProfessionalWorldsEwDeskAdminDraft } from '@/features/professional-worlds/desktop/professionalWorldsEwDeskAdminBridge';
import { saveEmbeddedAdminSection } from '@/pages/Admin/shell/adminShellLastSection';
import { hasUgsAdminIdentity } from '@/utils/ugsAdminAccess';
import { requestOpenDesktopApp } from '../utils/desktopDeepLink';
import { guideTourLabelsFromI18n } from '@/components/guided-tour/guideTourLabelsFromI18n';
import { SpotlightGuideModal } from '@/components/guided-tour/SpotlightGuideModal';
import { useBuiltGuideSteps } from '@/components/guided-tour/useBuiltGuideSteps';
import { useDesktopGuideTourOpener } from '@/pages/Desktop/hooks/useDesktopGuideTourOpener';
import {
	EW_DESK_GUIDE_AUDIO_LS_KEY,
	EW_DESK_GUIDE_ROOT_ID,
	EW_DESK_GUIDE_STEP_DEFS,
	EW_DESK_GUIDE_TOUR_FOLDER,
} from './ewDeskGuideConstants';

type EWDeskAppProps = {
	/** Open a post by id (deep link `?ewdesk_news=` or window initialPayload). */
	initialNewsId?: string | null;
	/** Professional Worlds handoff suggestion; shown as operator draft, never auto-published. */
	initialProfessionalWorldsDraft?: ProfessionalWorldsEwDeskSuggestion | null;
	/** MobileAndroid embedded WebView — compact shell, native toolbar owns title. */
	embeddedMobile?: boolean;
};

export default function EWDeskApp({
	initialNewsId = null,
	initialProfessionalWorldsDraft = null,
	embeddedMobile,
}: EWDeskAppProps = {}): React.ReactElement {
	const embeddedMobileLayout = embeddedMobile ?? isMobileEwDeskEmbeddedRoute();
	const { t, i18n } = useTranslation('desktopUi', { keyPrefix: 'ewDesk' });
	const guideLabels = React.useMemo(
		() => guideTourLabelsFromI18n(t, 'guide'),
		[t]
	);
	const guideSteps = useBuiltGuideSteps(
		t,
		'guide.steps',
		EW_DESK_GUIDE_STEP_DEFS
	);
	const [guideOpen, setGuideOpen] = React.useState(false);
	const openGuideTour = React.useCallback(() => setGuideOpen(true), []);
	useDesktopGuideTourOpener(openGuideTour, { enabled: !embeddedMobileLayout });
	const queryClient = useQueryClient();
	const prefsCtx = useUserPreferencesApp();
	const desktopIconStyle = normalizeDesktopIconStyle(
		prefsCtx?.preferences?.ui.desktop_icon_style ??
			DEFAULT_UI_PREFERENCES.desktop_icon_style
	);
	const shellFrame = useDesktopShellFrame();
	const portalStackBase = useDesktopWindowPortalStackBase();
	const isMdUp = useMediaQuery('(min-width: 768px)');
	const splitPaneLayout = isMdUp && !embeddedMobileLayout;

	const headerStripClass = React.useMemo(
		() =>
			cn(
				getDesktopShellHeaderStripClassName(shellFrame),
				'text-(--desktop-text-primary)'
			),
		[shellFrame]
	);

	const listColumnClass = React.useMemo(
		() =>
			cn(
				'relative w-full md:w-[min(100%,22rem)] shrink-0 overflow-y-auto overscroll-y-contain scrollbar-gutter-stable border-(--desktop-border-subtle) md:border-r pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] md:pb-0',
				'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_18%,transparent)] md:bg-[color-mix(in_srgb,var(--desktop-surface-soft)_12%,transparent)]',
				DESKTOP_SURFACE.spacingMd,
				getDesktopShellNavRailClassName(shellFrame),
				'shadow-[inset_-1px_0_0_rgb(var(--desktop-fg-primary-rgb)/0.06)]',
				'md:after:pointer-events-none md:after:absolute md:after:right-0 md:after:top-[8%] md:after:z-10 md:after:h-[84%] md:after:w-px md:after:bg-linear-to-b md:after:from-transparent md:after:via-(--desktop-border-subtle) md:after:to-transparent md:after:opacity-80'
			),
		[shellFrame]
	);

	const detailCanvasClass = React.useMemo(
		() =>
			DESKTOP_WINDOW_FRAME_STYLES[shellFrame]?.content ??
			DESKTOP_WINDOW_FRAME_STYLES.glass.content,
		[shellFrame]
	);

	const listFeedStickyHeaderClass = React.useMemo(
		() =>
			cn(
				'sticky top-0 z-10 flex items-center justify-between gap-2 px-3 pb-2.5 pt-3 md:px-4',
				'mb-1 shadow-[0_8px_20px_-12px_rgb(0_0_0/0.12)]',
				getDesktopShellHeaderStripClassName(shellFrame)
			),
		[shellFrame]
	);

	const [selectedId, setSelectedId] = React.useState<string | null>(null);
	const [searchQuery, setSearchQuery] = React.useState('');
	const deferredSearchQuery = React.useDeferredValue(searchQuery);
	const [sortOrder, setSortOrder] = React.useState<'newest' | 'oldest'>(
		'newest'
	);
	const [pinnedOnly, setPinnedOnly] = React.useState(false);
	const [unreadOnly, setUnreadOnly] = React.useState(false);
	const [starredOnly, setStarredOnly] = React.useState(false);
	const { user } = useAuth();
	const canOpenEwDeskAdminPublish = React.useMemo(
		() => hasUgsAdminIdentity(user),
		[user]
	);
	const handleOpenEwDeskAdminPublish = React.useCallback(() => {
		const draft = initialProfessionalWorldsDraft;
		if (!draft?.crossAppLinkId || !canOpenEwDeskAdminPublish) return;
		const stashed = stashProfessionalWorldsEwDeskAdminDraft({
			title: draft.title,
			markdown: draft.markdown,
			crossAppLinkId: draft.crossAppLinkId,
		});
		if (!stashed) {
			toast.error(t('pwDraftOpenAdminFailed'));
			return;
		}
		saveEmbeddedAdminSection('ewdesk');
		requestOpenDesktopApp({ appComponent: 'UnifiedAdminApp' });
	}, [canOpenEwDeskAdminPublish, initialProfessionalWorldsDraft, t]);
	const [readingWidth, setReadingWidth] = React.useState<EwDeskReadingWidth>(
		() => loadEwDeskReadingWidth()
	);
	const [listRowContextMenu, setListRowContextMenu] = React.useState<{
		x: number;
		y: number;
		postId: string;
	} | null>(null);
	const [showKeyboardHints, setShowKeyboardHints] = React.useState(false);

	const setReadingWidthPersist = React.useCallback((w: EwDeskReadingWidth) => {
		setReadingWidth(w);
		persistEwDeskReadingWidth(w);
	}, []);

	const articleMaxWidthClass = React.useMemo(() => {
		switch (readingWidth) {
			case 'narrow':
				return 'max-w-[min(100%,28rem)]';
			case 'wide':
				return 'max-w-[min(100%,52rem)]';
			default:
				return 'max-w-[min(100%,40rem)]';
		}
	}, [readingWidth]);
	const heroImageClass = React.useMemo(
		() =>
			readingWidth === 'narrow'
				? 'max-h-[min(22rem,52vh)] w-full object-cover object-center'
				: 'max-h-[min(28rem,62vh)] w-full object-contain object-center',
		[readingWidth]
	);
	const appliedInitialNewsRef = React.useRef(false);
	const selectedIdRef = React.useRef<string | null>(null);
	selectedIdRef.current = selectedId;
	const ewDeskRootRef = React.useRef<HTMLDivElement | null>(null);
	const listColumnRef = React.useRef<HTMLDivElement | null>(null);
	const loadMoreSentinelRef = React.useRef<HTMLDivElement | null>(null);
	const searchInputRef = React.useRef<HTMLInputElement | null>(null);
	const optionRefsById = React.useRef<Map<string, HTMLButtonElement | null>>(
		new Map()
	);
	/** Stable ref callbacks per post id so memoized rows are not invalidated each render. */
	const optionRefCallbackById = React.useRef<
		Map<string, React.RefCallback<HTMLButtonElement>>
	>(new Map());
	const detailScrollRef = React.useRef<HTMLElement | null>(null);

	const getOptionButtonRef = React.useCallback((id: string) => {
		let cb = optionRefCallbackById.current.get(id);
		if (!cb) {
			cb = (el: HTMLButtonElement | null) => {
				if (el) {
					optionRefsById.current.set(id, el);
				} else {
					optionRefsById.current.delete(id);
				}
			};
			optionRefCallbackById.current.set(id, cb);
		}
		return cb;
	}, []);

	const deferredSearchNormalized = deferredSearchQuery.trim().toLowerCase();
	const isSearchFilterPending =
		searchQuery.trim() !== deferredSearchQuery.trim() &&
		searchQuery.trim().length > 0;

	const listFilterState = React.useMemo(
		() => ({
			searchQuery,
			sortOrder,
			pinnedOnly,
			unreadOnly,
			starredOnly,
		}),
		[searchQuery, sortOrder, pinnedOnly, unreadOnly, starredOnly]
	);

	const feedFilters = React.useMemo(
		() =>
			buildEwDeskFeedFiltersFromListState(
				listFilterState,
				deferredSearchNormalized
			),
		[listFilterState, deferredSearchNormalized]
	);

	const resetListFilters = React.useCallback(() => {
		setSearchQuery(DEFAULT_EWDESK_LIST_FILTER_STATE.searchQuery);
		setSortOrder(DEFAULT_EWDESK_LIST_FILTER_STATE.sortOrder);
		setPinnedOnly(DEFAULT_EWDESK_LIST_FILTER_STATE.pinnedOnly);
		setUnreadOnly(DEFAULT_EWDESK_LIST_FILTER_STATE.unreadOnly);
		setStarredOnly(DEFAULT_EWDESK_LIST_FILTER_STATE.starredOnly);
	}, []);

	const listFiltersActive = isEwDeskListFiltersActive(listFilterState);

	const activeFilterSummary = React.useMemo(() => {
		return getEwDeskActiveFilterParts(listFilterState)
			.map((part) => {
				switch (part.kind) {
					case 'search':
						return t('activeFilterSearch', { query: part.query });
					case 'pinned':
						return t('activeFilterPinned');
					case 'unread':
						return t('activeFilterUnread');
					case 'starred':
						return t('activeFilterStarred');
					case 'sortOldest':
						return t('activeFilterSortOldest');
					default:
						return '';
				}
			})
			.filter(Boolean)
			.join(' · ');
	}, [listFilterState, t]);

	const listFeed = useEwDeskNewsFeed(feedFilters);
	const posts = listFeed.posts;
	const filteredPosts = posts;
	const { unreadCount, starredCount } = useEwDeskNewsCounts(Boolean(user));
	const listReady = !listFeed.isLoading && !listFeed.isError;
	const showLoadedOfTotal =
		listFeed.hasNextPage || posts.length < listFeed.serverTotal;

	const {
		readIds,
		starredIds,
		setReadIds,
		setStarredIds,
		markPostRead,
		markPostUnread,
		markAllRead,
		markFeedSeen,
	} = useEwDeskUserStateSync({
		enabled: Boolean(user),
		posts,
		selectedId,
	});

	React.useEffect(() => {
		if (!listReady || posts.length === 0) return;
		markFeedSeen();
	}, [listReady, markFeedSeen, posts.length]);

	const detailQuery = useQuery({
		...ewDeskNewsPostQueryOptions(selectedId as string),
		enabled: Boolean(selectedId),
	});

	const listFeedRef = React.useRef(listFeed);
	listFeedRef.current = listFeed;

	const selected: CompanyNewsPost | undefined = selectedId
		? detailQuery.data
		: undefined;
	const selectedPublishedRelative = selected
		? formatEwDeskRelativeNewsDate(selected.published_at, i18n.language)
		: '';

	const searchInputShellClass = React.useMemo(
		() =>
			cn(
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'rounded-lg py-1.5 pl-8 pr-9 text-xs transition-opacity duration-150 motion-reduce:transition-none',
				isSearchFilterPending && 'opacity-[0.88]'
			),
		[shellFrame, isSearchFilterPending]
	);

	const listFiltersToolbarClass = React.useMemo(
		() =>
			cn(
				'flex flex-wrap items-center gap-1',
				getDesktopShellToolbarClusterClassName(shellFrame),
				'rounded-(--desktop-radius-lg) p-1'
			),
		[shellFrame]
	);

	const readingWidthClusterClass = React.useMemo(
		() =>
			cn(
				'flex items-center gap-0.5',
				getDesktopShellToolbarClusterClassName(shellFrame),
				'rounded-(--desktop-radius-lg) p-0.5'
			),
		[shellFrame]
	);

	const listContextPost = React.useMemo(() => {
		if (!listRowContextMenu) return undefined;
		return filteredPosts.find((p) => p.id === listRowContextMenu.postId);
	}, [listRowContextMenu, filteredPosts]);

	const listContextMenuPos = React.useMemo(() => {
		if (!listRowContextMenu) return null;
		return getFloatingMenuPosition(
			{ x: listRowContextMenu.x, y: listRowContextMenu.y },
			{ menuWidth: 220, menuHeight: 168 }
		);
	}, [listRowContextMenu]);

	const hasActiveFilters = listFiltersActive;

	const filteredPostsRef = React.useRef(filteredPosts);
	filteredPostsRef.current = filteredPosts;

	/** Warm cache for prev/next article while navigating (same stale window as queries). */
	React.useEffect(() => {
		if (!selectedId) return;
		const list = filteredPosts;
		const idx = list.findIndex((p) => p.id === selectedId);
		if (idx < 0) return;
		const prefetch = (id: string | undefined): void => {
			if (!id) return;
			void queryClient.prefetchQuery(ewDeskNewsPostQueryOptions(id));
		};
		prefetch(list[idx + 1]?.id);
		prefetch(list[idx - 1]?.id);
	}, [selectedId, filteredPosts, queryClient]);

	/** Drop read markers for posts removed from the server — keeps storage small and counts accurate. */
	React.useEffect(() => {
		if (posts.length === 0) return;
		const valid = new Set(posts.map((p) => p.id));
		setReadIds((prev) => {
			let changed = false;
			const next = new Set<string>();
			for (const id of prev) {
				if (valid.has(id)) next.add(id);
				else changed = true;
			}
			if (!changed && next.size === prev.size) return prev;
			return next;
		});
		setStarredIds((prev) => {
			let changed = false;
			const next = new Set<string>();
			for (const id of prev) {
				if (valid.has(id)) next.add(id);
				else changed = true;
			}
			if (!changed && next.size === prev.size) return prev;
			return next;
		});
	}, [posts, setReadIds, setStarredIds]);

	React.useEffect(() => {
		if (appliedInitialNewsRef.current) return;
		const raw = initialNewsId?.trim();
		if (!raw) return;
		if (!listReady) return;
		appliedInitialNewsRef.current = true;
		setSelectedId(raw);
	}, [initialNewsId, listReady]);

	const deepLinkNotFoundNotifiedRef = React.useRef(false);
	React.useEffect(() => {
		const raw = initialNewsId?.trim();
		if (!raw || selectedId !== raw || !detailQuery.isError) return;
		if (deepLinkNotFoundNotifiedRef.current) return;
		deepLinkNotFoundNotifiedRef.current = true;
		toast.error(t('deepLinkPostNotFound'));
	}, [initialNewsId, selectedId, detailQuery.isError, t]);

	React.useLayoutEffect(() => {
		const ids = new Set(posts.map((p) => p.id));
		for (const id of optionRefCallbackById.current.keys()) {
			if (!ids.has(id)) {
				optionRefCallbackById.current.delete(id);
			}
		}
	}, [posts]);

	React.useEffect(() => {
		if (splitPaneLayout || !selectedId) return;
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') {
				e.preventDefault();
				setSelectedId(null);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [splitPaneLayout, selectedId]);

	React.useEffect(() => {
		if (!listFiltersActive) return;
		const onKey = (e: KeyboardEvent): void => {
			if (e.key !== 'Escape') return;
			if (!splitPaneLayout && selectedIdRef.current) return;
			const target = e.target as HTMLElement | null;
			if (target?.closest('input, textarea, [contenteditable="true"]')) {
				return;
			}
			e.preventDefault();
			resetListFilters();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [listFiltersActive, resetListFilters, splitPaneLayout]);

	React.useEffect(() => {
		if (!selectedId) return;
		const el = detailScrollRef.current;
		if (el) {
			el.scrollTop = 0;
		}
	}, [selectedId]);

	const focusOptionAt = React.useCallback(
		(index: number): void => {
			const clamped = Math.max(
				0,
				Math.min(index, Math.max(0, filteredPosts.length - 1))
			);
			const id = filteredPosts[clamped]?.id;
			if (id) {
				optionRefsById.current.get(id)?.focus();
			}
		},
		[filteredPosts]
	);

	const focusOptionAtRef = React.useRef(focusOptionAt);
	focusOptionAtRef.current = focusOptionAt;

	React.useLayoutEffect(() => {
		if (!selectedId) return;
		const el = optionRefsById.current.get(selectedId);
		el?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
	}, [selectedId]);

	const handleOptionKeyDown = React.useCallback(
		(e: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
			const len = filteredPosts.length;
			if (len === 0) return;
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				const next = Math.min(index + 1, len - 1);
				if (filteredPosts[next]) {
					setSelectedId(filteredPosts[next].id);
					focusOptionAt(next);
				}
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				const prev = Math.max(index - 1, 0);
				if (filteredPosts[prev]) {
					setSelectedId(filteredPosts[prev].id);
					focusOptionAt(prev);
				}
			} else if (e.key === 'Home') {
				e.preventDefault();
				if (filteredPosts[0]) {
					setSelectedId(filteredPosts[0].id);
					focusOptionAt(0);
				}
			} else if (e.key === 'End') {
				e.preventDefault();
				const last = len - 1;
				if (last >= 0 && filteredPosts[last]) {
					setSelectedId(filteredPosts[last].id);
					focusOptionAt(last);
				}
			}
		},
		[filteredPosts, focusOptionAt]
	);

	const getOptionTabIndex = React.useCallback(
		(index: number): number => {
			if (filteredPosts[index]?.id === selectedId) return 0;
			if (!selectedId && index === 0) return 0;
			return -1;
		},
		[filteredPosts, selectedId]
	);

	const handleSelectPost = React.useCallback((id: string): void => {
		setSelectedId(id);
	}, []);

	const handleListRowContextMenu = React.useCallback(
		(e: React.MouseEvent, postId: string) => {
			e.preventDefault();
			e.stopPropagation();
			setListRowContextMenu({ x: e.clientX, y: e.clientY, postId });
		},
		[]
	);

	React.useEffect(() => {
		if (!listRowContextMenu) return;
		const close = () => setListRowContextMenu(null);
		window.addEventListener('click', close);
		return () => window.removeEventListener('click', close);
	}, [listRowContextMenu]);

	React.useEffect(() => {
		if (!listRowContextMenu) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setListRowContextMenu(null);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [listRowContextMenu]);

	const handleMarkAllRead = React.useCallback(() => {
		if (
			unreadCount >= EWDESK_MARK_ALL_READ_CONFIRM_MIN &&
			!window.confirm(t('markAllReadConfirm', { count: unreadCount }))
		) {
			return;
		}
		markAllRead();
	}, [markAllRead, t, unreadCount]);

	const readIdsRef = React.useRef(readIds);
	readIdsRef.current = readIds;
	const markPostReadRef = React.useRef(markPostRead);
	markPostReadRef.current = markPostRead;
	const markPostUnreadRef = React.useRef(markPostUnread);
	markPostUnreadRef.current = markPostUnread;

	const toggleSelectedReadState = React.useCallback(() => {
		const sid = selectedIdRef.current;
		if (!sid) return;
		const action = resolveEwDeskPostReadToggleAction(sid, readIdsRef.current);
		if (action === 'mark_unread') {
			markPostUnreadRef.current(sid);
		} else {
			markPostReadRef.current(sid);
		}
	}, []);

	const toggleSelectedReadStateRef = React.useRef(toggleSelectedReadState);
	toggleSelectedReadStateRef.current = toggleSelectedReadState;

	const handleToggleStarById = React.useCallback(
		(id: string) => {
			setStarredIds((prev) => {
				const next = new Set(prev);
				if (next.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}
				return next;
			});
		},
		[setStarredIds]
	);

	const handleToggleStarByIdRef = React.useRef(handleToggleStarById);
	handleToggleStarByIdRef.current = handleToggleStarById;

	const handleToggleStar = React.useCallback(() => {
		if (!selected) return;
		handleToggleStarById(selected.id);
	}, [selected, handleToggleStarById]);

	const copyPostId = React.useCallback(
		async (postId: string) => {
			const copied = await safeCopyToClipboard(postId);
			if (copied) {
				toast.success(t('postIdCopied'));
			} else {
				toast.error(t('postIdCopyError'));
			}
		},
		[t]
	);

	const copyPostLink = React.useCallback(
		async (postId: string) => {
			try {
				const link = buildEwDeskNewsDeepLink(postId, {
					origin: window.location.origin,
					pathname: window.location.pathname,
				});
				const copied = await safeCopyToClipboard(link);
				if (copied) {
					toast.success(t('postLinkCopied'));
				} else {
					toast.error(t('postLinkCopyError'));
				}
			} catch {
				toast.error(t('postLinkCopyError'));
			}
		},
		[t]
	);

	const copyPostLinkRef = React.useRef(copyPostLink);
	copyPostLinkRef.current = copyPostLink;

	const hoverPrefetchRef = React.useRef<{ id: string; at: number } | null>(
		null
	);
	const prefetchPostDetailOnHover = React.useCallback(
		(id: string) => {
			const now = Date.now();
			const last = hoverPrefetchRef.current;
			if (last?.id === id && now - last.at < 1200) {
				return;
			}
			hoverPrefetchRef.current = { id, at: now };
			void queryClient.prefetchQuery(ewDeskNewsPostQueryOptions(id));
		},
		[queryClient]
	);

	const selectedIsStarred = Boolean(selected && starredIds.has(selected.id));
	const selectedListTitle =
		filteredPosts.find((p) => p.id === selectedId)?.title ??
		selected?.title ??
		'';

	React.useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			const root = ewDeskRootRef.current;
			if (!root) return;
			if (!root.contains(document.activeElement)) return;

			const t = e.target as HTMLElement | null;
			const inTextField = Boolean(
				t?.closest('input, textarea, [contenteditable="true"]')
			);

			if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
				if (inTextField && t !== searchInputRef.current) {
					return;
				}
				e.preventDefault();
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
				return;
			}
			if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
				if (inTextField) {
					return;
				}
				e.preventDefault();
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
				return;
			}

			if (
				e.key === '?' &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey &&
				!e.shiftKey
			) {
				if (inTextField) return;
				e.preventDefault();
				setShowKeyboardHints((prev) => !prev);
				return;
			}

			/** Refresh feed (same as header button). */
			if (
				(e.key === 'r' || e.key === 'R') &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				if (inTextField) return;
				e.preventDefault();
				void listFeedRef.current.refetch();
				return;
			}

			/** Toggle starred for the currently selected post. */
			if (
				(e.key === 's' || e.key === 'S') &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				if (inTextField) return;
				const sid = selectedIdRef.current;
				if (!sid) return;
				e.preventDefault();
				handleToggleStarByIdRef.current(sid);
				return;
			}

			/** Toggle read/unread for the currently selected post. */
			if (
				(e.key === 'u' || e.key === 'U') &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				if (inTextField) return;
				if (!selectedIdRef.current) return;
				e.preventDefault();
				toggleSelectedReadStateRef.current();
				return;
			}

			/** Copy share link for the currently selected post. */
			if (
				(e.key === 'l' || e.key === 'L') &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				if (inTextField) return;
				const sid = selectedIdRef.current;
				if (!sid) return;
				e.preventDefault();
				void copyPostLinkRef.current(sid);
				return;
			}

			/** Next / previous in the current filtered list (vim-style), not in text fields. */
			if (
				(e.key === 'j' || e.key === 'J' || e.key === 'k' || e.key === 'K') &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				if (inTextField) return;
				const list = filteredPostsRef.current;
				if (list.length === 0) return;
				e.preventDefault();
				const down = e.key === 'j' || e.key === 'J';
				const cur = list.findIndex((p) => p.id === selectedIdRef.current);
				let nextIdx: number;
				if (down) {
					nextIdx = cur < 0 ? 0 : Math.min(cur + 1, list.length - 1);
				} else {
					nextIdx = cur < 0 ? list.length - 1 : Math.max(cur - 1, 0);
				}
				const nextPost = list[nextIdx];
				if (!nextPost) return;
				setSelectedId(nextPost.id);
				requestAnimationFrame(() => {
					focusOptionAtRef.current(nextIdx);
				});
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, []);

	const showListColumn = splitPaneLayout || !selectedId;
	/** Wide layout always shows the detail column (empty state until selection). */
	const showDetailPane = splitPaneLayout || Boolean(selectedId);

	useEwDeskNewsAutoLoadMore(listColumnRef, loadMoreSentinelRef, {
		enabled: listReady && showListColumn,
		hasNextPage: listFeed.hasNextPage,
		isFetchingNextPage: listFeed.isFetchingNextPage,
		fetchNextPage: listFeed.fetchNextPage,
	});

	const listSection = (
		<div
			ref={listColumnRef}
			data-ed-guide="feed-list"
			className={cn(listColumnClass, !showListColumn && 'hidden')}
		>
			{listFeed.isLoading && (
				<div
					className="space-y-2.5 p-3 md:p-4"
					role="status"
					aria-busy="true"
					aria-live="polite"
					aria-label={t('listLabel')}
				>
					{[
						['w-full', 'w-3/5'],
						['w-[96%]', 'w-1/2'],
						['w-[92%]', 'w-2/3'],
						['w-full', 'w-[55%]'],
					].map(([a, b], i) => (
						<div
							key={`sk-${a}-${b}`}
							className={cn(
								'space-y-2 rounded-(--desktop-radius-lg) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/30 p-2.5 ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.04)] motion-safe:animate-fade-in motion-reduce:animate-none',
								i % 2 === 1 && 'opacity-[0.92]',
								EW_DESK_LIST_SKELETON_STAGGER[i]
							)}
						>
							<DesktopAppSkeleton className={cn('h-2.5', a)} />
							<DesktopAppSkeleton className={cn('h-2', b)} />
						</div>
					))}
				</div>
			)}
			{listFeed.isError && (
				<div className="motion-safe:animate-fade-in motion-reduce:animate-none">
					<DesktopAppEmptyState
						className="mx-auto min-h-56 w-full max-w-sm px-4"
						icon={
							<ExclamationCircleIcon
								className="h-8 w-8 text-[color-mix(in_srgb,rgb(251_113_133)_75%,var(--desktop-text-dim))]"
								aria-hidden
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						}
						title={t('listLoadErrorTitle')}
						description={t('listLoadErrorDesc')}
					>
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="sm"
							aria-label={t('retryAria')}
							onClick={() => {
								void listFeed.refetch();
							}}
						>
							{t('retry')}
						</DesktopAppButton>
					</DesktopAppEmptyState>
				</div>
			)}
			{!listFeed.isLoading && !listFeed.isError && (
				<>
					<div className={listFeedStickyHeaderClass}>
						<div className="flex min-w-0 items-center gap-2.5">
							<span
								className="h-6 w-0.5 shrink-0 rounded-full bg-linear-to-b from-[rgb(var(--desktop-accent-rgb)/0.75)] via-[rgb(var(--desktop-accent-rgb)/0.35)] to-[rgb(var(--desktop-accent-rgb)/0.08)] shadow-[0_0_10px_rgb(var(--desktop-accent-rgb)/0.12)]"
								aria-hidden
							/>
							<DesktopAppSectionLabel className="mb-0 text-(--desktop-text-secondary)">
								{t('listHeading')}
							</DesktopAppSectionLabel>
							{unreadCount > 0 ? (
								<span
									role="img"
									className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.22)_100%,transparent)] px-1.5 text-[0.625rem] font-bold tabular-nums text-[rgb(var(--desktop-accent-rgb)/0.95)] ring-1 ring-inset ring-[rgb(var(--desktop-accent-rgb)/0.25)]"
									aria-label={t('unreadBadgeAria', { count: unreadCount })}
								>
									{unreadCount > 99 ? '99+' : unreadCount}
								</span>
							) : null}
							{listFeed.isFetching && !listFeed.isLoading ? (
								<span
									className="inline-flex h-5 items-center gap-1.5 rounded-full border border-(--desktop-border-subtle)/80 bg-[color-mix(in_srgb,var(--desktop-surface-soft)_85%,rgb(var(--desktop-accent-rgb)/0.06))] px-2 py-0.5"
									role="status"
									aria-label={t('listRefreshingAria')}
								>
									<span
										className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--desktop-accent-rgb)/0.85)] motion-safe:animate-pulse motion-reduce:animate-none"
										aria-hidden
									/>
								</span>
							) : null}
						</div>
						<DesktopChromeTooltip
							content={
								showLoadedOfTotal || hasActiveFilters
									? t('listCountFilteredAria', {
											shown: posts.length,
											total: listFeed.serverTotal,
										})
									: t('listCountAria', { count: posts.length })
							}
							placement="bottom"
							offsetExtra={4}
						>
							<span
								role="img"
								className={cn(
									'flex min-w-6.5 cursor-default items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--desktop-border-subtle)_88%,rgb(var(--desktop-accent-rgb)/0.12))] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_88%,rgb(var(--desktop-accent-rgb)/0.1))] px-2 py-0.5 text-[0.6875rem] font-semibold tabular-nums text-(--desktop-text-secondary) shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.06)]',
									filteredPosts.length === 0 &&
										posts.length === 0 &&
										'text-(--desktop-text-muted) opacity-[0.72]',
									listFeed.isFetching &&
										!listFeed.isLoading &&
										posts.length > 0 &&
										'motion-safe:animate-pulse'
								)}
								aria-label={
									showLoadedOfTotal || hasActiveFilters
										? t('listCountFilteredAria', {
												shown: posts.length,
												total: listFeed.serverTotal,
											})
										: t('listCountAria', { count: posts.length })
								}
							>
								{showLoadedOfTotal || hasActiveFilters
									? `${posts.length}/${listFeed.serverTotal}`
									: posts.length}
							</span>
						</DesktopChromeTooltip>
					</div>
					{listReady ? (
						<div className="mb-2 space-y-2 px-3 md:px-4">
							<DesktopChromeTooltip
								content={t('focusSearchHint')}
								placement="bottom"
								offsetExtra={4}
							>
								<div className="relative w-full">
									<MagnifyingGlassIcon
										className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--desktop-text-dim)"
										aria-hidden
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
									<DesktopAppInput
										ref={searchInputRef}
										type="search"
										value={searchQuery}
										onChange={(e) => {
											setSearchQuery(e.target.value);
										}}
										placeholder={t('searchPlaceholder')}
										aria-label={t('searchAria')}
										autoComplete="off"
										className={cn('w-full', searchInputShellClass)}
									/>
									{searchQuery ? (
										<DesktopAppButton
											type="button"
											variant="ghost"
											size="sm"
											className="absolute right-0.5 top-1/2 h-7 min-w-0 -translate-y-1/2 px-2 text-[0.6875rem] text-(--desktop-text-muted)"
											aria-label={t('clearSearchAria')}
											onClick={() => {
												setSearchQuery('');
											}}
										>
											{t('clearSearch')}
										</DesktopAppButton>
									) : null}
								</div>
							</DesktopChromeTooltip>
							<div className={listFiltersToolbarClass}>
								<DesktopAppButton
									type="button"
									variant={sortOrder === 'newest' ? 'neutral' : 'ghost'}
									size="sm"
									className="h-7 gap-1 px-2 text-[0.6875rem]"
									aria-pressed={sortOrder === 'newest'}
									aria-label={t('sortNewestAria')}
									onClick={() => {
										setSortOrder('newest');
									}}
								>
									<ArrowsUpDownIcon
										className="h-3.5 w-3.5 shrink-0 opacity-90"
										aria-hidden
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
									{t('sortNewest')}
								</DesktopAppButton>
								<DesktopAppButton
									type="button"
									variant={sortOrder === 'oldest' ? 'neutral' : 'ghost'}
									size="sm"
									className="h-7 gap-1 px-2 text-[0.6875rem]"
									aria-pressed={sortOrder === 'oldest'}
									aria-label={t('sortOldestAria')}
									onClick={() => {
										setSortOrder('oldest');
									}}
								>
									<ArrowsUpDownIcon
										className="h-3.5 w-3.5 shrink-0 opacity-90"
										aria-hidden
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
									{t('sortOldest')}
								</DesktopAppButton>
								<DesktopAppButton
									type="button"
									variant={pinnedOnly ? 'neutral' : 'ghost'}
									size="sm"
									className="h-7 gap-1 px-2 text-[0.6875rem]"
									aria-pressed={pinnedOnly}
									aria-label={t('pinnedOnlyAria')}
									onClick={() => {
										setPinnedOnly((v) => !v);
									}}
								>
									<MapPinIcon
										className="h-3.5 w-3.5 shrink-0 opacity-90"
										aria-hidden
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
									{t('pinnedOnly')}
								</DesktopAppButton>
								<DesktopAppButton
									type="button"
									variant={unreadOnly ? 'neutral' : 'ghost'}
									size="sm"
									className="h-7 gap-1 px-2 text-[0.6875rem]"
									aria-pressed={unreadOnly}
									aria-label={t('unreadOnlyAria')}
									disabled={unreadCount === 0 && !unreadOnly}
									onClick={() => {
										setUnreadOnly((v) => !v);
									}}
								>
									<InboxIcon
										className="h-3.5 w-3.5 shrink-0 opacity-90"
										aria-hidden
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
									{t('unreadOnly')}
								</DesktopAppButton>
								<DesktopAppButton
									type="button"
									variant={starredOnly ? 'neutral' : 'ghost'}
									size="sm"
									className="h-7 gap-1 px-2 text-[0.6875rem]"
									aria-pressed={starredOnly}
									aria-label={t('starredOnlyAria')}
									disabled={starredCount === 0 && !starredOnly}
									onClick={() => {
										setStarredOnly((v) => !v);
									}}
								>
									<StarIcon
										className="h-3.5 w-3.5 shrink-0 opacity-90"
										aria-hidden
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
									{t('starredOnly')}
								</DesktopAppButton>
								{unreadCount > 0 ? (
									<DesktopAppButton
										type="button"
										variant="ghost"
										size="sm"
										className="h-7 gap-1 px-2 text-[0.6875rem] text-(--desktop-text-secondary)"
										aria-label={t('markAllReadAria')}
										onClick={handleMarkAllRead}
									>
										{t('markAllRead')}
									</DesktopAppButton>
								) : null}
								{listFiltersActive ? (
									<DesktopAppButton
										type="button"
										variant="neutral"
										size="sm"
										className="h-7 px-2 text-[0.6875rem]"
										aria-label={t('resetFiltersAria')}
										onClick={resetListFilters}
									>
										{t('resetFilters')}
									</DesktopAppButton>
								) : null}
							</div>
							{listFiltersActive ? (
								<p
									className={`${DESKTOP_TYPOGRAPHY.meta} px-0.5 text-(--desktop-text-muted)`}
								>
									{t('filtersEscHint')}
								</p>
							) : null}
							{listFiltersActive && activeFilterSummary ? (
								<p
									className={`${DESKTOP_TYPOGRAPHY.meta} px-0.5 text-(--desktop-text-secondary)`}
									aria-live="polite"
								>
									{t('activeFiltersSummary', { summary: activeFilterSummary })}
								</p>
							) : null}
							{showKeyboardHints ? (
								<p
									className={`${DESKTOP_TYPOGRAPHY.meta} rounded-(--desktop-radius) border border-(--desktop-border-subtle)/80 bg-[color-mix(in_srgb,var(--desktop-surface-soft)_70%,transparent)] px-2 py-1.5 text-(--desktop-text-muted)`}
								>
									{t('keyboardHintsPanel')}
								</p>
							) : null}
						</div>
					) : null}
				</>
			)}
			{!listFeed.isLoading && !listFeed.isError && posts.length === 0 && (
				<div className="motion-safe:animate-fade-in motion-reduce:animate-none">
					<DesktopAppEmptyState
						className="mx-auto min-h-48 w-full max-w-sm px-4 py-6"
						icon={
							hasActiveFilters ? (
								<MagnifyingGlassIcon
									className="h-8 w-8 text-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.88)_42%,var(--desktop-text-dim))]"
									aria-hidden
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							) : (
								<NewspaperIcon
									className="h-8 w-8 text-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.88)_42%,var(--desktop-text-dim))]"
									aria-hidden
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							)
						}
						title={
							hasActiveFilters ? t('noSearchResultsTitle') : t('emptyTitle')
						}
						description={
							hasActiveFilters ? t('noSearchResultsDesc') : t('emptyDesc')
						}
					>
						{hasActiveFilters ? (
							<DesktopAppButton
								type="button"
								variant="neutral"
								size="sm"
								aria-label={t('resetFiltersAria')}
								onClick={resetListFilters}
							>
								{t('resetFilters')}
							</DesktopAppButton>
						) : null}
					</DesktopAppEmptyState>
				</div>
			)}
			{filteredPosts.length > 0 ? (
				<div
					id={EW_DESK_LISTBOX_ID}
					role="listbox"
					tabIndex={0}
					aria-activedescendant={
						selectedId ? ewDeskListOptionDomId(selectedId) : undefined
					}
					className={cn(
						'scroll-smooth flex flex-col gap-1.5 p-2 pb-4 pt-1 transition-opacity duration-150 motion-reduce:transition-none md:p-3 md:pb-5 md:pt-2',
						isSearchFilterPending && 'opacity-[0.92]'
					)}
					aria-label={t('listLabel')}
				>
					{filteredPosts.map((p, index) => (
						<EwDeskNewsListRow
							key={p.id}
							post={p}
							index={index}
							isSelected={selectedId === p.id}
							tabIndex={getOptionTabIndex(index)}
							detailPanelId={EW_DESK_DETAIL_PANEL_ID}
							listboxOptionId={ewDeskListOptionDomId(p.id)}
							buttonRef={getOptionButtonRef(p.id)}
							onSelect={handleSelectPost}
							onOptionKeyDown={handleOptionKeyDown}
							isUnread={!readIds.has(p.id)}
							isStarred={starredIds.has(p.id)}
							onPrefetchPost={prefetchPostDetailOnHover}
							onRowContextMenu={handleListRowContextMenu}
							searchHighlightQuery={deferredSearchQuery.trim()}
						/>
					))}
					{listFeed.hasNextPage || listFeed.isFetchingNextPage ? (
						<div
							className="flex min-h-8 items-center justify-center px-1 pt-1 pb-2"
							aria-live="polite"
							role="presentation"
						>
							<div
								ref={loadMoreSentinelRef}
								className="flex w-full max-w-[16rem] items-center justify-center gap-1.5 py-1 text-[0.6875rem] text-(--desktop-text-muted)"
								role="status"
								aria-label={
									listFeed.isFetchingNextPage
										? t('loadMoreLoadingAria')
										: t('loadMoreAria', {
												loaded: posts.length,
												serverTotal: listFeed.serverTotal,
											})
								}
							>
								{listFeed.isFetchingNextPage ? (
									<>
										<ArrowPathIcon
											className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin motion-reduce:animate-none"
											aria-hidden
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
										{t('loadingMore')}
									</>
								) : (
									t('loadMore', {
										loaded: posts.length,
										serverTotal: listFeed.serverTotal,
									})
								)}
							</div>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);

	const detailSection = showDetailPane ? (
		<section
			ref={detailScrollRef}
			id={EW_DESK_DETAIL_PANEL_ID}
			data-ed-guide="feed-detail"
			aria-label={t('detailRegionLabel')}
			aria-live="polite"
			className={cn(
				'scroll-smooth flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain scrollbar-gutter-stable p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] md:p-6 md:pb-6',
				detailCanvasClass
			)}
		>
			{!selectedId && splitPaneLayout && (
				<div className="flex min-h-0 flex-1 flex-col justify-center py-6 md:py-10">
					<div className="mx-auto w-full max-w-md motion-safe:animate-fade-in motion-reduce:animate-none">
						<DesktopAppEmptyState
							className="min-h-[min(18rem,42vh)] px-6"
							icon={
								<NewspaperIcon
									className="h-9 w-9 text-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.88)_38%,var(--desktop-text-dim))]"
									aria-hidden
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							}
							title={t('emptySelectTitle')}
							description={t('emptySelectDesc')}
						/>
					</div>
				</div>
			)}
			{selectedId && selectedListTitle ? (
				<div className="sr-only" aria-live="polite" aria-atomic="true">
					{t('selectedPostAnnounced', { title: selectedListTitle })}
				</div>
			) : null}
			{selectedId && detailQuery.isLoading && (
				<div
					key={selectedId}
					className={cn('mx-auto w-full px-1 py-2', articleMaxWidthClass)}
					role="status"
					aria-busy="true"
					aria-label={t('detailLoadingAria')}
				>
					<div
						className={cn(
							'motion-safe:animate-fade-in motion-reduce:animate-none',
							'overflow-hidden rounded-(--desktop-radius-xl) border border-(--desktop-border-subtle)',
							'ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.06)]',
							'bg-[color-mix(in_srgb,var(--desktop-surface-panel)_35%,transparent)]',
							'shadow-[inset_3px_0_0_0_rgb(var(--desktop-accent-rgb)/0.22),0_12px_36px_-16px_rgb(0_0_0/0.28)]',
							getDesktopShellContentPanelClassName(shellFrame)
						)}
					>
						<div className="border-b border-(--desktop-border-subtle) bg-linear-to-b from-[rgb(var(--desktop-accent-rgb)/0.05)] to-transparent px-5 py-4 md:px-7 md:py-5">
							<DesktopAppSkeleton className="h-6 w-[88%] max-w-md rounded-md" />
							<DesktopAppSkeleton className="mt-4 h-0.5 w-10 rounded-full" />
							<DesktopAppSkeleton className="mt-4 h-5 w-40 rounded-full" />
						</div>
						<div className="space-y-2.5 px-5 py-6 md:px-7 md:py-8">
							<DesktopAppSkeleton className="h-3 w-full rounded-md" />
							<DesktopAppSkeleton className="h-3 w-[94%] rounded-md" />
							<DesktopAppSkeleton className="h-3 w-[88%] rounded-md" />
							<DesktopAppSkeleton className="h-3 w-[72%] rounded-md" />
						</div>
					</div>
				</div>
			)}
			{selectedId && detailQuery.isError && (
				<div className="motion-safe:animate-fade-in motion-reduce:animate-none">
					<DesktopAppEmptyState
						className="mx-auto min-h-56 w-full max-w-sm px-4"
						icon={
							<ExclamationCircleIcon
								className="h-8 w-8 text-[color-mix(in_srgb,rgb(251_113_133)_75%,var(--desktop-text-dim))]"
								aria-hidden
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						}
						title={t('detailLoadErrorTitle')}
						description={t('detailLoadErrorDesc')}
					>
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="sm"
							aria-label={t('detailRetryAria')}
							onClick={() => {
								void detailQuery.refetch();
							}}
						>
							{t('retry')}
						</DesktopAppButton>
					</DesktopAppEmptyState>
				</div>
			)}
			{selectedId && selected && (
				<div className={cn('mx-auto w-full', articleMaxWidthClass)}>
					<article
						key={selected.id}
						aria-labelledby="ewdesk-detail-title"
						className={cn(
							'motion-safe:animate-fade-in motion-reduce:animate-none',
							'overflow-hidden rounded-(--desktop-radius-xl)',
							'ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.07)]',
							'shadow-[inset_4px_0_0_0_rgb(var(--desktop-accent-rgb)/0.42),0_16px_48px_-20px_rgb(0_0_0/0.4),0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)]',
							'motion-safe:transition-shadow motion-safe:duration-300 motion-reduce:transition-none',
							/* hover: shadow only — avoids layout layer promotion from translate */
							'motion-safe:hover:shadow-[inset_4px_0_0_0_rgb(var(--desktop-accent-rgb)/0.48),0_22px_56px_-22px_rgb(0_0_0/0.44),0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.06)]',
							'focus-within:ring-2 focus-within:ring-[rgb(var(--desktop-accent-rgb)/0.24)] focus-within:ring-offset-2 focus-within:ring-offset-[color-mix(in_srgb,var(--desktop-surface-app)_55%,transparent)]',
							getDesktopShellContentPanelClassName(shellFrame)
						)}
					>
						<header
							className={cn(
								'relative border-b border-(--desktop-border-subtle) px-5 py-5 text-center md:px-7 md:py-6',
								'bg-linear-to-b from-[rgb(var(--desktop-accent-rgb)/0.09)] via-[color-mix(in_srgb,var(--desktop-surface-panel)_38%,transparent)] to-[color-mix(in_srgb,var(--desktop-surface-panel)_46%,transparent)]'
							)}
						>
							<div
								className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[rgb(var(--desktop-accent-rgb)/0.25)] to-transparent opacity-90"
								aria-hidden
							/>
							<h2
								id="ewdesk-detail-title"
								className={cn(
									DESKTOP_TYPOGRAPHY.title,
									'scroll-mt-4 text-pretty md:text-2xl md:leading-tight'
								)}
							>
								{selected.title}
							</h2>
							<div
								className="mx-auto mt-4 h-0.5 w-12 rounded-full bg-linear-to-r from-[rgb(var(--desktop-accent-rgb)/0.55)] to-[rgb(var(--desktop-accent-rgb)/0.15)] shadow-[0_1px_8px_rgb(var(--desktop-accent-rgb)/0.2)]"
								aria-hidden
							/>
							<div
								className={cn(
									DESKTOP_TYPOGRAPHY.meta,
									'mt-4 flex flex-col items-center gap-3 text-(--desktop-text-muted)'
								)}
							>
								<div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
									<span className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_92%,transparent)] px-2.5 py-0.5 shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)] tabular-nums transition-shadow duration-200 motion-reduce:transition-none">
										<CalendarIcon
											className="mt-0.5 h-3.5 w-3.5 shrink-0 self-start text-(--desktop-text-dim)"
											aria-hidden
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
										<DesktopChromeTooltip
											content={
												formatEwDeskNewsDate(selected.published_at) || undefined
											}
											placement="top"
											offsetExtra={4}
											disabled={!formatEwDeskNewsDate(selected.published_at)}
										>
											<time
												className="flex min-w-0 flex-col items-center gap-0.5 leading-tight"
												dateTime={selected.published_at ?? undefined}
											>
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.body,
														'font-medium tabular-nums text-(--desktop-text-secondary)'
													)}
												>
													{formatEwDeskNewsDate(selected.published_at)}
												</span>
												{selectedPublishedRelative ? (
													<span
														className={cn(
															DESKTOP_TYPOGRAPHY.small,
															'font-normal normal-case tracking-normal'
														)}
													>
														{selectedPublishedRelative}
													</span>
												) : null}
											</time>
										</DesktopChromeTooltip>
									</span>
									{selected.pinned ? (
										<span className="inline-flex cursor-default items-center gap-1 rounded-full border border-[color-mix(in_srgb,rgb(251_191_36)_35%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,rgb(251_191_36)_12%,var(--desktop-surface-soft)_75%)] px-2.5 py-0.5 text-[0.6875rem] font-medium text-[color-mix(in_srgb,rgb(180_130_20)_72%,var(--desktop-text-secondary))] shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)] transition-shadow duration-200 motion-reduce:transition-none">
											<MapPinIcon
												className="h-3 w-3 shrink-0 opacity-90 drop-shadow-[0_0_8px_rgb(251_191_36/0.4)]"
												aria-hidden
												strokeWidth={DESKTOP_LUCIDE.stroke}
											/>
											{t('pinnedBadge')}
										</span>
									) : null}
									<DesktopAppButton
										type="button"
										size="sm"
										variant="ghost"
										className="h-7 min-w-0 px-2 text-[0.6875rem] text-(--desktop-text-muted)"
										aria-label={t('copyPostLinkAria')}
										onClick={() => {
											void copyPostLink(selected.id);
										}}
									>
										<LinkIcon
											className="h-3.5 w-3.5 shrink-0"
											aria-hidden
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
										{t('copyPostLink')}
									</DesktopAppButton>
									<DesktopAppButton
										type="button"
										size="sm"
										variant="ghost"
										className="h-7 min-w-0 px-2 text-[0.6875rem] text-(--desktop-text-muted)"
										aria-label={t('copyPostIdAria')}
										onClick={() => {
											void copyPostId(selected.id);
										}}
									>
										<ClipboardDocumentIcon
											className="h-3.5 w-3.5 shrink-0"
											aria-hidden
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
										{t('copyPostId')}
									</DesktopAppButton>
								</div>
								<div className="flex flex-wrap items-center justify-center gap-1.5 sm:shrink-0">
									<fieldset
										className={cn(
											readingWidthClusterClass,
											'm-0 min-w-0 border-0 p-0'
										)}
										aria-label={t('readingWidthGroupAria')}
									>
										<DesktopAppButton
											type="button"
											variant={readingWidth === 'narrow' ? 'neutral' : 'ghost'}
											size="sm"
											className="h-7 min-w-7 px-2 text-[0.6875rem] font-semibold tabular-nums"
											aria-pressed={readingWidth === 'narrow'}
											aria-label={t('readingWidthNarrowAria')}
											onClick={() => {
												setReadingWidthPersist('narrow');
											}}
										>
											S
										</DesktopAppButton>
										<DesktopAppButton
											type="button"
											variant={
												readingWidth === 'comfortable' ? 'neutral' : 'ghost'
											}
											size="sm"
											className="h-7 min-w-7 px-2 text-[0.6875rem] font-semibold tabular-nums"
											aria-pressed={readingWidth === 'comfortable'}
											aria-label={t('readingWidthComfortableAria')}
											onClick={() => {
												setReadingWidthPersist('comfortable');
											}}
										>
											M
										</DesktopAppButton>
										<DesktopAppButton
											type="button"
											variant={readingWidth === 'wide' ? 'neutral' : 'ghost'}
											size="sm"
											className="h-7 min-w-7 px-2 text-[0.6875rem] font-semibold tabular-nums"
											aria-pressed={readingWidth === 'wide'}
											aria-label={t('readingWidthWideAria')}
											onClick={() => {
												setReadingWidthPersist('wide');
											}}
										>
											L
										</DesktopAppButton>
									</fieldset>
									<DesktopAppButton
										type="button"
										variant="ghost"
										size="sm"
										className="gap-1.5 text-[0.6875rem] text-(--desktop-text-secondary) hover:text-(--desktop-text-primary)"
										aria-pressed={selectedIsStarred}
										aria-label={
											selectedIsStarred ? t('starRemoveAria') : t('starAddAria')
										}
										onClick={() => {
											handleToggleStar();
										}}
									>
										<StarIcon
											className={cn(
												'h-3.5 w-3.5 shrink-0 opacity-90',
												selectedIsStarred &&
													'fill-amber-400/90 text-amber-400 drop-shadow-[0_0_10px_rgb(251_191_36/0.35)]'
											)}
											aria-hidden
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
										{selectedIsStarred ? t('starred') : t('star')}
									</DesktopAppButton>
								</div>
							</div>
						</header>
						{selected.video_content_id ? (
							<section
								className="relative -mx-5 w-[calc(100%+2.5rem)] shrink-0 border-b border-(--desktop-border-subtle) bg-black md:-mx-7 md:w-[calc(100%+3.5rem)]"
								aria-label={t('videoHeroAria')}
							>
								<EwDeskNewsVideo
									contentId={selected.video_content_id}
									variant="hero"
								/>
							</section>
						) : null}
						{selected.audio_content_id ? (
							<section
								className="border-b border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_25%,transparent)] px-5 py-4 text-center md:px-7"
								aria-label={t('audioPlayerAria')}
							>
								<div className="mx-auto max-w-md">
									<EwDeskNewsAudio contentId={selected.audio_content_id} />
								</div>
							</section>
						) : null}
						<div
							className={cn(
								DESKTOP_TYPOGRAPHY.body,
								'relative text-center',
								'bg-[linear-gradient(to_bottom,transparent_0%,color-mix(in_srgb,var(--desktop-surface-app)_20%,transparent)_100%),color-mix(in_srgb,var(--desktop-surface-app)_30%,transparent)]',
								'px-5 py-7 text-[0.9375rem] leading-[1.72] text-(--desktop-text-primary) antialiased md:px-7 md:py-9 md:text-[1.015rem] md:leading-[1.78]',
								'text-pretty wrap-anywhere selection:bg-[rgb(var(--desktop-accent-rgb)/0.24)]'
							)}
						>
							<div
								className="pointer-events-none absolute inset-x-5 top-0 h-px bg-linear-to-r from-transparent via-[rgb(var(--desktop-accent-rgb)/0.2)] to-transparent md:inset-x-7"
								aria-hidden
							/>
							{selected.body.trim() ? (
								<div
									className={cn(
										'relative mx-auto mt-1 max-w-[min(100%,42rem)] rounded-2xl border border-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.12)_100%,transparent)]',
										'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_26%,transparent)]',
										'px-4 py-5 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.045)] sm:px-6 sm:py-6',
										'ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]'
									)}
								>
									<ProductAssistantMarkdown
										content={selected.body}
										remarkPluginsExtra={[remarkBreaks]}
										className={cn(
											'!prose-lg min-w-0 text-center',
											'[&_p]:mx-auto [&_p]:max-w-[min(100%,38rem)] [&_p]:text-(--desktop-text-primary)',
											'[&_li]:text-(--desktop-text-primary)',
											'[&_ul]:mx-auto [&_ul]:w-fit [&_ul]:max-w-[min(100%,36rem)] [&_ul]:text-left',
											'[&_ol]:mx-auto [&_ol]:w-fit [&_ol]:max-w-[min(100%,36rem)] [&_ol]:text-left',
											'[&_blockquote]:mx-auto [&_blockquote]:max-w-[min(100%,36rem)] [&_blockquote]:border-l-[rgb(var(--desktop-accent-rgb)/0.55)]',
											'[&_blockquote]:text-left [&_blockquote]:text-(--desktop-text-secondary)',
											'[&_h2]:mx-auto [&_h2]:max-w-[min(100%,38rem)] [&_h2]:text-[1.2rem] [&_h2]:tracking-tight',
											'[&_h3]:mx-auto [&_h3]:max-w-[min(100%,38rem)] [&_h3]:text-[1.05rem] [&_h3]:tracking-tight',
											'[&_hr]:mx-auto [&_hr]:max-w-[min(100%,24rem)]',
											'[&_hr]:border-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.35)_100%,transparent)]',
											'[&_strong]:text-(--desktop-text-primary)',
											'[&_a]:font-medium',
											'[&_table]:mx-auto',
											'[&_button.not-prose]:rounded-xl [&_button.not-prose]:border [&_button.not-prose]:border-[rgb(var(--desktop-accent-rgb)/0.3)] [&_button.not-prose]:bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.14)_100%,transparent)] [&_button.not-prose]:px-3.5 [&_button.not-prose]:py-2 [&_button.not-prose]:text-[0.8125rem] [&_button.not-prose]:font-semibold [&_button.not-prose]:shadow-[0_1px_0_0_rgba(255,255,255,0.06)] [&_button.not-prose]:transition-colors',
											'[&_button.not-prose]:hover:bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.22)_100%,transparent)]'
										)}
									/>
									{selected.image_content_id || selected.image_url ? (
										<figure className="mx-auto mt-8 w-full max-w-[min(100%,40rem)] overflow-hidden rounded-(--desktop-radius-lg) border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_58%,transparent)] shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)]">
											<EwDeskNewsImage
												contentId={selected.image_content_id}
												src={selected.image_url}
												alt=""
												className={heroImageClass}
											/>
										</figure>
									) : null}
								</div>
							) : null}
							<div
								className="mx-auto mt-12 flex max-w-32 flex-col items-center gap-2.5"
								aria-hidden
							>
								<div className="h-px w-full bg-linear-to-r from-transparent via-[rgb(var(--desktop-accent-rgb)/0.22)] to-transparent opacity-95" />
								<div className="flex items-center gap-1.5">
									<div className="h-1 w-1 rounded-full bg-[rgb(var(--desktop-accent-rgb)/0.28)] opacity-90" />
									<div className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--desktop-accent-rgb)/0.42)] shadow-[0_0_10px_rgb(var(--desktop-accent-rgb)/0.28)]" />
									<div className="h-1 w-1 rounded-full bg-[rgb(var(--desktop-accent-rgb)/0.28)] opacity-90" />
								</div>
							</div>
						</div>
					</article>
				</div>
			)}
		</section>
	) : null;

	return (
		<DesktopAppContentWrapper
			className={cn(
				DESKTOP_APP_STYLE_CONTRACT.shell,
				'flex min-h-0 h-full flex-col bg-(--desktop-surface-app)'
			)}
		>
			<div
				ref={ewDeskRootRef}
				id={EW_DESK_GUIDE_ROOT_ID}
				data-ewdesk-root={embeddedMobileLayout ? '1' : undefined}
				data-embedded-mobile={embeddedMobileLayout ? '1' : undefined}
				className={cn(
					'relative flex min-h-0 flex-1 flex-col outline-none',
					embeddedMobileLayout && MOBILE_EMBEDDED_APP_ROOT_CLASS
				)}
				tabIndex={-1}
			>
				{!embeddedMobileLayout ? (
					<div
						data-ed-guide="header"
						className={cn(
							'relative flex min-h-12 shrink-0 select-none items-center justify-between gap-2 border-b border-(--desktop-border-subtle)/70 px-4 py-2.5',
							'shadow-[inset_0_-1px_0_rgb(var(--desktop-fg-primary-rgb)/0.07)]',
							headerStripClass
						)}
					>
						<div className="flex min-w-0 items-center gap-2.5">
							<span
								className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-(--desktop-radius-lg)"
								aria-hidden
							>
								<DesktopAppSymbol
									appComponent="EWDeskApp"
									className="h-full w-full"
									iconStyle={desktopIconStyle}
								/>
							</span>
							<div className="flex min-w-0 flex-col gap-0.5 leading-tight">
								<span
									className={`${DESKTOP_TYPOGRAPHY.subtitle} truncate text-(--desktop-text-primary)`}
								>
									{t('title')}
								</span>
								<span
									className={`${DESKTOP_TYPOGRAPHY.small} block max-w-44 truncate text-[0.625rem] leading-tight text-(--desktop-text-muted) sm:max-w-none sm:text-xs`}
								>
									{t('tagline')}
								</span>
							</div>
						</div>
						<DesktopChromeTooltip
							content={
								listFeed.isFetching ? t('refreshLoadingAria') : t('refreshAria')
							}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="icon"
								className="shrink-0 rounded-(--desktop-radius-lg) text-(--desktop-text-secondary) hover:bg-(--desktop-surface-soft) hover:text-(--desktop-text-primary) active:scale-95 disabled:cursor-wait disabled:opacity-50 motion-reduce:active:scale-100"
								aria-label={
									listFeed.isFetching
										? t('refreshLoadingAria')
										: t('refreshAria')
								}
								disabled={listFeed.isFetching}
								onClick={() => {
									void listFeed.refetch();
								}}
							>
								<ArrowPathIcon
									className={cn(
										'h-4 w-4 transition-opacity duration-200 motion-reduce:transition-none',
										listFeed.isFetching
											? 'motion-safe:animate-spin motion-reduce:animate-none'
											: 'opacity-[0.88] hover:opacity-100'
									)}
									aria-hidden
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							</DesktopAppButton>
						</DesktopChromeTooltip>
					</div>
				) : null}

				{initialProfessionalWorldsDraft ? (
					<div className="shrink-0 border-b border-(--desktop-border-subtle)/70 px-3 py-2 md:px-4">
						<DesktopAppSurface
							variant="soft"
							padding="sm"
							className="space-y-2 text-sm text-(--desktop-text-secondary)"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<strong className="text-(--desktop-text-primary)">
									{t('pwDraftBannerTitle', {
										title: initialProfessionalWorldsDraft.title,
									})}
								</strong>
								<span className="text-xs text-(--desktop-text-muted)">
									{t('pwDraftManualPublishOnly')}
								</span>
							</div>
							<ProductAssistantMarkdown
								content={initialProfessionalWorldsDraft.markdown}
								className="max-h-40 overflow-y-auto text-sm"
							/>
							{canOpenEwDeskAdminPublish &&
							initialProfessionalWorldsDraft.crossAppLinkId ? (
								<div className="flex flex-wrap gap-2 pt-1">
									<DesktopAppButton
										size="sm"
										variant="ghost"
										onClick={handleOpenEwDeskAdminPublish}
										aria-label={t('pwDraftOpenAdminAria')}
									>
										{t('pwDraftOpenAdmin')}
									</DesktopAppButton>
								</div>
							) : null}
						</DesktopAppSurface>
					</div>
				) : null}

				<div className="flex min-h-0 flex-1 flex-col md:flex-row md:gap-px">
					{splitPaneLayout ? (
						<>
							{listSection}
							{detailSection}
						</>
					) : selectedId ? (
						<div className="flex min-h-0 flex-1 flex-col">
							<div
								className={cn(
									'flex min-h-11 shrink-0 select-none items-center px-3 py-2',
									'border-b border-(--desktop-border-subtle)/70',
									'shadow-[inset_0_-1px_0_rgb(var(--desktop-fg-primary-rgb)/0.06)]',
									headerStripClass
								)}
							>
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="sm"
									className="group gap-1.5 rounded-(--desktop-radius-lg) px-2 text-(--desktop-text-primary) hover:bg-(--desktop-surface-soft) active:scale-[0.98] motion-reduce:active:scale-100"
									aria-label={t('backToListAria')}
									onClick={() => setSelectedId(null)}
								>
									<ChevronLeftIcon
										className="h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none motion-safe:group-hover:-translate-x-px motion-safe:group-focus-visible:-translate-x-px"
										aria-hidden
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
									{t('backToList')}
								</DesktopAppButton>
							</div>
							{detailSection}
						</div>
					) : (
						listSection
					)}
				</div>
				<AnimatePresence>
					{listRowContextMenu && listContextPost && listContextMenuPos ? (
						<m.div
							key="ewdesk-list-context"
							initial={{ opacity: 0, scale: 0.96, y: 4 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 4 }}
							transition={{ duration: 0.12 }}
							className="fixed"
							style={{
								zIndex: portalStackBase,
								left: listContextMenuPos.x,
								top: listContextMenuPos.y,
							}}
							role="presentation"
							onClick={(e) => e.stopPropagation()}
							onMouseDown={(e) => e.stopPropagation()}
						>
							<DesktopAppMenuSurface
								className="min-w-[200px]"
								role="menu"
								aria-label={t('listContextMenuAria')}
							>
								<DesktopAppMenuItem
									type="button"
									role="menuitem"
									onClick={() => {
										handleSelectPost(listContextPost.id);
										setListRowContextMenu(null);
									}}
									className={DESKTOP_INTERACTIVE.focusRing}
								>
									{t('listContextOpen')}
								</DesktopAppMenuItem>
								<DesktopAppMenuDivider />
								{readIds.has(listContextPost.id) ? (
									<DesktopAppMenuItem
										type="button"
										role="menuitem"
										onClick={() => {
											markPostUnread(listContextPost.id);
											setListRowContextMenu(null);
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{t('listContextMarkUnread')}
									</DesktopAppMenuItem>
								) : (
									<DesktopAppMenuItem
										type="button"
										role="menuitem"
										onClick={() => {
											markPostRead(listContextPost.id);
											setListRowContextMenu(null);
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{t('listContextMarkRead')}
									</DesktopAppMenuItem>
								)}
								<DesktopAppMenuDivider />
								{starredIds.has(listContextPost.id) ? (
									<DesktopAppMenuItem
										type="button"
										role="menuitem"
										onClick={() => {
											handleToggleStarById(listContextPost.id);
											setListRowContextMenu(null);
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{t('listContextStarRemove')}
									</DesktopAppMenuItem>
								) : (
									<DesktopAppMenuItem
										type="button"
										role="menuitem"
										onClick={() => {
											handleToggleStarById(listContextPost.id);
											setListRowContextMenu(null);
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{t('listContextStarAdd')}
									</DesktopAppMenuItem>
								)}
								<DesktopAppMenuDivider />
								<DesktopAppMenuItem
									type="button"
									role="menuitem"
									onClick={() => {
										void copyPostLink(listContextPost.id);
										setListRowContextMenu(null);
									}}
									className={DESKTOP_INTERACTIVE.focusRing}
								>
									{t('listContextCopyLink')}
								</DesktopAppMenuItem>
								<DesktopAppMenuItem
									type="button"
									role="menuitem"
									onClick={() => {
										void copyPostId(listContextPost.id);
										setListRowContextMenu(null);
									}}
									className={DESKTOP_INTERACTIVE.focusRing}
								>
									{t('listContextCopyId')}
								</DesktopAppMenuItem>
							</DesktopAppMenuSurface>
						</m.div>
					) : null}
				</AnimatePresence>
			</div>
			{!embeddedMobileLayout ? (
				<SpotlightGuideModal
					open={guideOpen}
					onClose={() => setGuideOpen(false)}
					rootId={EW_DESK_GUIDE_ROOT_ID}
					steps={guideSteps}
					audioLocalStorageKey={EW_DESK_GUIDE_AUDIO_LS_KEY}
					tourAudioFolder={EW_DESK_GUIDE_TOUR_FOLDER}
					labels={guideLabels}
					dialogTitleId="ewdesk-guide-title"
				/>
			) : null}
		</DesktopAppContentWrapper>
	);
}
