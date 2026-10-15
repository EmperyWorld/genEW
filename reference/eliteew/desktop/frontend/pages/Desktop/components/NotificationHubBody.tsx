/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared body for the notification center (taskbar panel) and the full desktop app window.
 *
 * Invariants:
 * - Panel density omits detailed quick settings; window density includes search, source filter, grouping.
 * - Virtual window list (>40 items) forces type grouping only.
 * - Escape resets active list filters when focus is not in a text field; panel flyout or window closes when filters are idle and `onRequestClose` is set.
 * - Handled Escape uses `useShellCaptureKeyboard` (capture + stopPropagation).
 * - Panel and window feeds support Arrow/Home/End between notification cards (`data-notification-hub-item`).
 *
 * Related:
 * - NotificationCenter.tsx, NotificationsDesktopApp.tsx
 * - notificationHub/NotificationHubPanelFilters.tsx, NotificationHubWindowFilters.tsx
 * - notificationHub/NotificationHubGroupedFeed.tsx, NotificationHubFooterToolbar.tsx
 * - hooks/useShellCaptureKeyboard.ts, notificationHubFilterState.ts
 */

import type { Notification, NotificationType } from '@/notifications';
import { getNotificationSourceI18nKey } from '@/notifications/sourceMeta';
import { cn } from '@/utils/cn';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type FC,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationHubItemKeyboardNav } from '../hooks/useNotificationHubPanelItemKeyboardNav';
import { useShellCaptureKeyboard } from '../hooks/useShellCaptureKeyboard';
import { DESKTOP_LUCIDE } from '../constants';
import { DesktopAppButton, DesktopAppEmptyState } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import {
	NotificationHubExtensionSlots,
	type NotificationHubExtensionContext,
} from '../notifications';
import { NotificationHubClearConfirm } from './notificationHub/NotificationHubClearConfirm';
import { downloadNotificationsJson } from './notificationHub/exportNotificationsJson';
import { NotificationHubFooterToolbar } from './notificationHub/NotificationHubFooterToolbar';
import { NotificationHubGroupedFeed } from './notificationHub/NotificationHubGroupedFeed';
import { NotificationHubPanelFilters } from './notificationHub/NotificationHubPanelFilters';
import { NotificationHubWindowFilters } from './notificationHub/NotificationHubWindowFilters';
import {
	notificationHubPanelFiltersActive,
	notificationHubWindowFiltersActive,
	resolveNotificationHubEffectiveGroupMode,
	resolveNotificationHubEscapeAction,
} from './notificationHub/notificationHubFilterState';
import {
	NotificationPanelAnimatedList,
	NotificationVirtualPanelList,
	PANEL_VIRTUAL_THRESHOLD,
	WINDOW_VIRTUAL_THRESHOLD,
} from './notificationHub/NotificationHubVirtualLists';
import { useTimeTick } from './notificationHub/useTimeTick';
import {
	NH_EMPTY_CENTER_WRAP_CLASS,
	NH_FILTER_RESET_BUTTON_CLASS,
	NH_RESET_FILTERS_WRAP_CLASS,
	NH_SETTINGS_BLOCK_CLASS,
	NH_WINDOW_FEED_WRAP_CLASS,
	NH_WINDOW_SCROLL_FEED_WRAP_CLASS,
	nhExtensionSlotClass,
} from './notificationHub/notificationHubLayoutTokens';
import { BellIcon } from '@heroicons/react/24/outline';

const GROUP_MODE_STORAGE_KEY = 'elite_notification_hub_group_mode_v1';

export interface NotificationHubBodyProps {
	notifications: Notification[];
	onMarkAsRead: (id: string) => void;
	onMarkAllAsRead: () => void;
	onMarkGroupAsRead?: (type: NotificationType) => void;
	onMarkGroupAsReadBySource?: (source: string | null) => void;
	onDismiss: (id: string) => void;
	onClearAll: () => void;
	density: 'panel' | 'window';
	onRequestClose?: () => void;
	/** Panel flyout: open full NotificationsApp (Quick Settings discoverability). */
	onOpenFull?: () => void;
	embeddedMobileLayout?: boolean;
}

function sortWindowFeed(items: Notification[]): Notification[] {
	const pinned = items
		.filter((n) => n.persistent)
		.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
	const rest = items
		.filter((n) => !n.persistent)
		.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
	return [...pinned, ...rest];
}

export const NotificationHubBody: FC<NotificationHubBodyProps> = ({
	notifications,
	onMarkAsRead,
	onMarkAllAsRead,
	onMarkGroupAsRead,
	onMarkGroupAsReadBySource,
	onDismiss,
	onClearAll,
	density,
	onRequestClose,
	onOpenFull,
	embeddedMobileLayout = false,
}) => {
	const { t } = useTranslation('desktopUi', { keyPrefix: 'notificationHub' });
	const timeRefreshKey = useTimeTick();
	const unreadCount = useMemo(
		() => notifications.filter((n) => !n.read).length,
		[notifications]
	);
	const [filter, setFilter] = useState<'all' | 'unread'>('all');
	const [searchQuery, setSearchQuery] = useState('');
	const [typeChipFilter, setTypeChipFilter] = useState<
		'all' | NotificationType
	>('all');
	const [sourceFilter, setSourceFilter] = useState<'all' | string>('all');
	const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
	const [groupMode, setGroupMode] = useState<'type' | 'source'>(() => {
		try {
			const v = sessionStorage.getItem(GROUP_MODE_STORAGE_KEY);
			return v === 'source' ? 'source' : 'type';
		} catch {
			return 'type';
		}
	});

	useEffect(() => {
		try {
			sessionStorage.setItem(GROUP_MODE_STORAGE_KEY, groupMode);
		} catch {
			// ignore
		}
	}, [groupMode]);

	const baseFiltered =
		filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

	const filteredNotifications = useMemo(() => {
		if (density !== 'window' || !searchQuery.trim()) return baseFiltered;
		const q = searchQuery.trim().toLowerCase();
		return baseFiltered.filter(
			(n) =>
				n.title.toLowerCase().includes(q) ||
				n.message.toLowerCase().includes(q) ||
				(n.source?.toLowerCase().includes(q) ?? false)
		);
	}, [baseFiltered, density, searchQuery]);

	const uniqueSources = useMemo(() => {
		const s = new Set<string>();
		for (const n of notifications) {
			if (n.source?.trim()) s.add(n.source);
		}
		return [...s].sort((a, b) => a.localeCompare(b));
	}, [notifications]);

	const getSourceLabel = useCallback(
		(source: string | null) =>
			source
				? t(getNotificationSourceI18nKey(source))
				: t('sourceGroupUnknown'),
		[t]
	);

	useEffect(() => {
		if (sourceFilter !== 'all' && !uniqueSources.includes(sourceFilter)) {
			setSourceFilter('all');
		}
	}, [uniqueSources, sourceFilter]);

	useEffect(() => {
		if (!import.meta.env.DEV) return;
		void import('../notifications/notificationHubExtensionDev');
	}, []);

	const afterSourceFilter = useMemo(() => {
		if (density !== 'window') return filteredNotifications;
		if (sourceFilter === 'all') return filteredNotifications;
		return filteredNotifications.filter((n) => n.source === sourceFilter);
	}, [density, filteredNotifications, sourceFilter]);

	const panelSortedList = useMemo(() => {
		if (density !== 'panel') return [];
		let list = filteredNotifications;
		if (typeChipFilter !== 'all') {
			list = list.filter((n) => n.type === typeChipFilter);
		}
		return [...list].sort(
			(a, b) => b.timestamp.getTime() - a.timestamp.getTime()
		);
	}, [density, filteredNotifications, typeChipFilter]);

	const windowFeedSorted = useMemo(
		() => sortWindowFeed(afterSourceFilter),
		[afterSourceFilter]
	);

	const panelFeedRef = useRef<HTMLDivElement>(null);
	const windowFeedRef = useRef<HTMLDivElement>(null);
	useNotificationHubItemKeyboardNav(
		panelFeedRef,
		density === 'panel',
		panelSortedList.length
	);
	useNotificationHubItemKeyboardNav(
		windowFeedRef,
		density === 'window',
		windowFeedSorted.length
	);

	const useWindowVirtual =
		density === 'window' && windowFeedSorted.length > WINDOW_VIRTUAL_THRESHOLD;

	const effectiveGroupMode = resolveNotificationHubEffectiveGroupMode(
		groupMode,
		useWindowVirtual
	);

	const restNotifications = useMemo(
		() => afterSourceFilter.filter((n) => !n.persistent),
		[afterSourceFilter]
	);

	const pinnedItems = useMemo(
		() =>
			[...afterSourceFilter.filter((n) => n.persistent)].sort(
				(a, b) => b.timestamp.getTime() - a.timestamp.getTime()
			),
		[afterSourceFilter]
	);

	const groupedByTypeRest = useMemo(() => {
		const groups: Record<NotificationType, Notification[]> = {
			error: [],
			warning: [],
			success: [],
			info: [],
		};
		for (const n of restNotifications) {
			groups[n.type].push(n);
		}
		return groups;
	}, [restNotifications]);

	const groupedBySourceRest = useMemo(() => {
		const map = new Map<string | null, Notification[]>();
		for (const n of restNotifications) {
			const key = n.source?.trim() ? n.source : null;
			const arr = map.get(key) ?? [];
			arr.push(n);
			map.set(key, arr);
		}
		for (const arr of map.values()) {
			arr.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
		}
		const keys = [...map.keys()].sort((a, b) => {
			if (a === null) return 1;
			if (b === null) return -1;
			return a.localeCompare(b);
		});
		return { map, keys };
	}, [restNotifications]);

	const showDetailedSettings = density === 'window';

	const windowFiltersActive = useMemo(
		() => notificationHubWindowFiltersActive(searchQuery, sourceFilter, filter),
		[searchQuery, sourceFilter, filter]
	);

	const panelFiltersActive = useMemo(
		() => notificationHubPanelFiltersActive(filter, typeChipFilter),
		[filter, typeChipFilter]
	);

	const filtersActive =
		density === 'window' ? windowFiltersActive : panelFiltersActive;

	const resetFilters = useCallback(() => {
		setSearchQuery('');
		setSourceFilter('all');
		setFilter('all');
		setTypeChipFilter('all');
	}, []);

	useShellCaptureKeyboard(true, (e) => {
		if (e.key !== 'Escape') return;
		const action = resolveNotificationHubEscapeAction({
			filtersActive,
			density,
			hasRequestClose: Boolean(onRequestClose),
			target: e.target,
		});
		if (action === 'none') return;
		e.preventDefault();
		e.stopPropagation();
		if (action === 'reset-filters') {
			resetFilters();
			return;
		}
		onRequestClose?.();
	});

	const renderPanelEmptyDescription = () => {
		const hasAnyUnread = notifications.some((n) => !n.read);
		if (filter === 'unread' && !hasAnyUnread && notifications.length > 0) {
			return t('emptyAllRead');
		}
		if (
			typeChipFilter !== 'all' &&
			panelSortedList.length === 0 &&
			baseFiltered.length > 0
		) {
			return t('emptyTypeFilter');
		}
		return t('emptyDefault');
	};

	const notificationHubExtensionContext =
		useMemo<NotificationHubExtensionContext>(
			() => ({
				density,
				notifications,
				unreadCount,
				actions: {
					markAsRead: onMarkAsRead,
					markAllAsRead: onMarkAllAsRead,
					dismiss: onDismiss,
					clearAll: onClearAll,
				},
			}),
			[
				density,
				notifications,
				unreadCount,
				onMarkAsRead,
				onMarkAllAsRead,
				onDismiss,
				onClearAll,
			]
		);

	const handleExportJson = useCallback(() => {
		downloadNotificationsJson(notifications);
	}, [notifications]);

	const groupedFeed = (
		<NotificationHubGroupedFeed
			useWindowVirtual={useWindowVirtual}
			windowFeedSorted={windowFeedSorted}
			afterSourceFilter={afterSourceFilter}
			effectiveGroupMode={effectiveGroupMode}
			pinnedItems={pinnedItems}
			groupedByTypeRest={groupedByTypeRest}
			groupedBySourceRest={groupedBySourceRest}
			filter={filter}
			searchQuery={searchQuery}
			sourceFilter={sourceFilter}
			filtersActive={filtersActive}
			onMarkAsRead={onMarkAsRead}
			onDismiss={onDismiss}
			onMarkGroupAsRead={onMarkGroupAsRead}
			onMarkGroupAsReadBySource={onMarkGroupAsReadBySource}
			onResetFilters={resetFilters}
			getSourceLabel={getSourceLabel}
			timeRefreshKey={timeRefreshKey}
		/>
	);

	const windowFiltersScrollCap = useWindowVirtual
		? 'max-h-[min(50vh,420px)] overflow-y-auto overscroll-contain'
		: embeddedMobileLayout
			? 'max-h-[min(42dvh,380px)] overflow-y-auto overscroll-contain'
			: undefined;

	const windowFiltersBlock = (
		<NotificationHubWindowFilters
			showDetailedSettings={showDetailedSettings}
			embeddedMobileLayout={embeddedMobileLayout}
			extensionContext={notificationHubExtensionContext}
			searchQuery={searchQuery}
			onSearchChange={setSearchQuery}
			uniqueSources={uniqueSources}
			sourceFilter={sourceFilter}
			onSourceFilterChange={setSourceFilter}
			getSourceLabel={(src) => getSourceLabel(src)}
			filter={filter}
			unreadCount={unreadCount}
			onFilterChange={setFilter}
			effectiveGroupMode={effectiveGroupMode}
			useWindowVirtual={useWindowVirtual}
			onGroupModeChange={setGroupMode}
			settingsBlockClass={NH_SETTINGS_BLOCK_CLASS}
			scrollCapClass={windowFiltersScrollCap}
		/>
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{density === 'panel' ? (
				<>
					<NotificationHubPanelFilters
						filter={filter}
						unreadCount={unreadCount}
						typeChipFilter={typeChipFilter}
						onFilterChange={setFilter}
						onTypeChipChange={setTypeChipFilter}
						extensionContext={notificationHubExtensionContext}
						onOpenFull={onOpenFull}
					/>

					<div ref={panelFeedRef} className="min-h-0 flex-1 overflow-y-auto">
						{panelSortedList.length === 0 ? (
							<div className={NH_EMPTY_CENTER_WRAP_CLASS}>
								<DesktopAppEmptyState
									icon={
										<BellIcon
											className="h-8 w-8 text-(--desktop-text-muted)"
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
									}
									title={t('emptyTitle')}
									description={renderPanelEmptyDescription()}
								/>
								{panelFiltersActive ? (
									<div className={NH_RESET_FILTERS_WRAP_CLASS}>
										<DesktopChromeTooltip
											content={t('resetFilters')}
											placement="top"
											offsetExtra={4}
										>
											<DesktopAppButton
												type="button"
												variant="accent"
												size="sm"
												className={NH_FILTER_RESET_BUTTON_CLASS}
												aria-label={t('resetFiltersAria')}
												onClick={resetFilters}
											>
												{t('resetFilters')}
											</DesktopAppButton>
										</DesktopChromeTooltip>
									</div>
								) : null}
							</div>
						) : panelSortedList.length > PANEL_VIRTUAL_THRESHOLD ? (
							<NotificationVirtualPanelList
								items={panelSortedList}
								onMarkAsRead={onMarkAsRead}
								onDismiss={onDismiss}
								timeRefreshKey={timeRefreshKey}
							/>
						) : (
							<NotificationPanelAnimatedList
								items={panelSortedList}
								onMarkAsRead={onMarkAsRead}
								onDismiss={onDismiss}
								timeRefreshKey={timeRefreshKey}
							/>
						)}
					</div>
				</>
			) : useWindowVirtual ? (
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					{windowFiltersBlock}
					<div
						ref={windowFeedRef}
						className={NH_WINDOW_FEED_WRAP_CLASS}
						data-nc-guide="feed"
					>
						<NotificationHubExtensionSlots
							slot="hubFeedStart"
							context={notificationHubExtensionContext}
							className={nhExtensionSlotClass('hubFeedStart')}
						/>
						{groupedFeed}
						<NotificationHubExtensionSlots
							slot="hubFeedEnd"
							context={notificationHubExtensionContext}
							className={nhExtensionSlotClass('hubFeedEnd')}
						/>
					</div>
				</div>
			) : (
				<div
					className={cn(
						'flex min-h-0 flex-1 flex-col',
						embeddedMobileLayout
							? 'overflow-hidden'
							: 'overflow-y-auto overscroll-contain'
					)}
				>
					{windowFiltersBlock}
					<div
						ref={windowFeedRef}
						className={cn(
							embeddedMobileLayout
								? NH_WINDOW_FEED_WRAP_CLASS
								: NH_WINDOW_SCROLL_FEED_WRAP_CLASS,
							embeddedMobileLayout && 'overflow-y-auto overscroll-contain'
						)}
						data-nc-guide="feed"
					>
						<NotificationHubExtensionSlots
							slot="hubFeedStart"
							context={notificationHubExtensionContext}
							className={nhExtensionSlotClass('hubFeedStart')}
						/>
						{groupedFeed}
						<NotificationHubExtensionSlots
							slot="hubFeedEnd"
							context={notificationHubExtensionContext}
							className={nhExtensionSlotClass('hubFeedEnd')}
						/>
					</div>
				</div>
			)}

			{notifications.length > 0 ? (
				<NotificationHubFooterToolbar
					density={density}
					onMarkAllAsRead={onMarkAllAsRead}
					onExportJson={density === 'window' ? handleExportJson : undefined}
					onRequestClearConfirm={() => setClearConfirmOpen(true)}
				/>
			) : null}

			<NotificationHubClearConfirm
				open={clearConfirmOpen}
				onClose={() => setClearConfirmOpen(false)}
				onConfirm={onClearAll}
			/>
		</div>
	);
};

NotificationHubBody.displayName = 'NotificationHubBody';
