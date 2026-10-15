/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Builds the Desktop tray model from real background runtime state: chat socket,
 * unread counters, active music, friends requests, UGS work and minimized apps.
 *
 * Invariants:
 * - Static shortcuts are not background processes and must not inflate tray counts.
 * - Only desktop-level providers or minimized persistent apps may create tray rows.
 * - GAF row requires unread or minimized GAF — bare socket online is not membership.
 *
 * Related:
 * - `components/TaskbarTrayGafCluster.tsx`
 * - `components/TaskbarTrayPanel.tsx`
 */

import { useAuth } from '@/contexts/AuthContext';
import { useFriendsOverview } from '@/features/friends/hooks/useFriendsOverview';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGAFUnreadCountMeta } from '../components/GAFChat/hooks/useGAFUnreadCount';
import { PERSISTENT_APP_COMPONENTS } from '../constants';
import { useSocketConnectionState } from '@/services/communication/socketConnectionStore';
import { useMusicPlaybackDomain } from '../context/MusicPlaybackDomainContext';
import { useNowPlayingTransport } from '../context/NowPlayingContext';
import { shouldIncludeGafTrayRow } from '../utils/desktopTraySurfacePolicy';
import { useUgsActiveTasksTray } from './useUgsActiveTasksTray';

export type DesktopTrayItemVariant = 'gaf' | 'music' | 'friends' | 'ugs';

export type DesktopTrayItem = {
	id: string;
	variant: DesktopTrayItemVariant;
	appComponent: string;
	label: string;
	status: string;
	secondary?: string;
	socketConnected?: boolean;
};

export type UseDesktopTrayItemsResult = {
	items: DesktopTrayItem[];
	/** Состояние сокета GAF (для кнопки чата в панели задач, даже когда строки нет в tray). */
	socketConnected: boolean;
	gafUnread: number;
	gafUnreadFetching: boolean;
	musicPlaybackErrorActive: boolean;
	musicPlaybackErrorMessage: string | null;
	/** Входящие заявки в друзья (для подсказок панели задач). */
	friendsIncomingCount: number;
	/** Активные задачи UGS (очередь / в работе), для бейджа tray. */
	ugsActiveTaskCount: number;
	ugsActiveTasksFetching: boolean;
	ugsTrayPollError: boolean;
	ugsTrayPollSuccess: boolean;
};

const EMPTY_MINIMIZED = new Set<string>();

function normalizePersistentAppComponent(appComponent: string): string {
	return appComponent === 'FriendsApp' ? 'SocialHubApp' : appComponent;
}

export type UseDesktopTrayItemsOptions = {
	/** AppComponent персистентных окон, которые пользователь свернул в фон (кнопка «—» / «Показать рабочий стол»). */
	minimizedPersistent?: ReadonlySet<string>;
};

function minimizedSetKey(s: ReadonlySet<string>): string {
	if (s.size === 0) {
		return '';
	}
	return [...s].sort().join('\u0001');
}

function fmtCount(n: number): string | number {
	return n > 99 ? '99+' : n;
}

export function useDesktopTrayItems(
	options: UseDesktopTrayItemsOptions = {}
): UseDesktopTrayItemsResult {
	const { t } = useTranslation('desktopUi');
	const minimizedPersistent = options.minimizedPersistent ?? EMPTY_MINIMIZED;
	const minimizedKey = useMemo(
		() => minimizedSetKey(minimizedPersistent),
		[minimizedPersistent]
	);
	const { user: currentUser } = useAuth();
	const { connected: socketConnected } = useSocketConnectionState();
	const { count: gafUnread, isFetching: gafUnreadFetching } =
		useGAFUnreadCountMeta(!!currentUser);
	const friendsOverviewQuery = useFriendsOverview({
		enabled: !!currentUser,
	});
	const friendsIncomingCount =
		friendsOverviewQuery.data?.stats.incomingRequestsCount ?? 0;
	const { track, playing, error, errorTrackId } = useNowPlayingTransport();
	const { shuffle, repeat } = useMusicPlaybackDomain();
	const {
		activeCount: ugsActiveTaskCount,
		isFetching: ugsActiveTasksFetching,
		isError: ugsTrayPollError,
		isSuccess: ugsTrayPollSuccess,
	} = useUgsActiveTasksTray();

	const musicPlaybackErrorActive = Boolean(track && (error || errorTrackId));
	const musicPlaybackErrorMessage = musicPlaybackErrorActive
		? error || t('taskbar.trayMusicPlaybackFallback')
		: null;

	const items = useMemo((): DesktopTrayItem[] => {
		const out: DesktopTrayItem[] = [];
		const minimized =
			minimizedKey.length === 0
				? EMPTY_MINIMIZED
				: new Set(
						[...minimizedPersistent].map((appComponent) =>
							normalizePersistentAppComponent(appComponent)
						)
					);

		const gafMinimized = minimized.has('GAFChatApp');
		if (shouldIncludeGafTrayRow({ gafUnread, gafMinimized })) {
			const collapsedOnly = gafMinimized && gafUnread <= 0;
			out.push({
				id: collapsedOnly ? 'bg-GAFChatApp' : 'gaf-chat',
				variant: 'gaf',
				label: t('taskbar.gafHeadline'),
				status: collapsedOnly
					? socketConnected
						? t('taskbar.trayGafCollapsedOnline')
						: t('taskbar.trayGafCollapsedOffline')
					: socketConnected
						? t('taskbar.trayGafRtOnline')
						: t('taskbar.trayGafRtOffline'),
				appComponent: 'GAFChatApp',
				socketConnected,
				secondary:
					gafUnread > 0
						? t('taskbar.trayGafUnreadCount', {
								count: fmtCount(gafUnread),
							})
						: undefined,
			});
		}

		if (track) {
			const modeMarks = [
				shuffle ? '🔀' : null,
				repeat === 'all' ? '🔁' : null,
				repeat === 'one' ? '🔂' : null,
			].filter(Boolean);
			out.push({
				id: 'music-player',
				variant: 'music',
				label: t('taskbar.trayMusicPlayerTitle'),
				status: playing
					? t('taskbar.trayMusicPlaying')
					: t('taskbar.trayMusicPaused'),
				secondary:
					modeMarks.length > 0
						? `${track.name} ${modeMarks.join(' ')}`
						: track.name,
				appComponent: 'MusicPlayer',
			});
		}

		if (friendsIncomingCount > 0) {
			const n = friendsIncomingCount;
			out.push({
				id: 'friends',
				variant: 'friends',
				label: t('taskbar.trayFriendsTitle'),
				status:
					n === 1
						? t('taskbar.trayFriendsIncomingOne')
						: t('taskbar.trayFriendsIncomingMany', { count: fmtCount(n) }),
				secondary: t('taskbar.trayFriendsHint'),
				appComponent: 'SocialHubApp',
			});
		}

		const hubMinimized = minimized.has('UGSHubApp');
		const nUgs = ugsActiveTaskCount;
		if (currentUser && (nUgs > 0 || hubMinimized)) {
			let status: string;
			let secondary: string | undefined;
			if (ugsTrayPollError) {
				status = hubMinimized
					? t('taskbar.trayUgsCollapsedQueueUnavailable')
					: t('taskbar.trayUgsQueuePollErrorStatus');
				secondary = t('taskbar.trayUgsCheckNetwork');
			} else if (nUgs > 0) {
				const base =
					nUgs === 1
						? t('taskbar.trayUgsActiveTasksOne')
						: t('taskbar.trayUgsActiveTasksMany', {
								count: fmtCount(nUgs),
							});
				status = hubMinimized
					? t('taskbar.trayUgsCollapsedPrefix', { detail: base })
					: base;
				secondary = t('taskbar.trayUgsGenerationsRunning');
			} else {
				status = t('taskbar.trayMinimizedToBackground');
				secondary = t('taskbar.trayUgsNoActiveTasksHint');
			}
			out.push({
				id: nUgs > 0 ? 'ugs-hub-active' : 'ugs-hub-bg',
				variant: 'ugs',
				label: t('taskbar.trayUgsHubTitle'),
				status,
				secondary,
				appComponent: 'UGSHubApp',
			});
		}

		const seenApp = new Set(out.map((i) => i.appComponent));
		for (const acRaw of minimized) {
			const ac = normalizePersistentAppComponent(acRaw);
			if (!PERSISTENT_APP_COMPONENTS.has(ac) || seenApp.has(ac)) {
				continue;
			}
			seenApp.add(ac);
			if (ac === 'MusicPlayer') {
				out.push({
					id: 'bg-MusicPlayer',
					variant: 'music',
					label: t('taskbar.trayMusicPlayerTitle'),
					status: t('taskbar.trayMinimizedToBackground'),
					secondary: track ? undefined : t('taskbar.trayMusicNotPlaying'),
					appComponent: 'MusicPlayer',
				});
			} else if (ac === 'GAFChatApp') {
				out.push({
					id: 'bg-GAFChatApp',
					variant: 'gaf',
					label: t('taskbar.gafHeadline'),
					status: socketConnected
						? t('taskbar.trayGafCollapsedOnline')
						: t('taskbar.trayGafCollapsedOffline'),
					secondary:
						gafUnread > 0
							? t('taskbar.trayGafUnreadCount', {
									count: fmtCount(gafUnread),
								})
							: undefined,
					appComponent: 'GAFChatApp',
					socketConnected,
				});
			} else if (ac === 'SocialHubApp') {
				const n = friendsIncomingCount;
				out.push({
					id: 'bg-SocialHubApp',
					variant: 'friends',
					label: t('taskbar.traySocialHubLabel'),
					status: t('taskbar.trayMinimizedToBackground'),
					secondary:
						n > 0
							? n === 1
								? t('taskbar.trayFriendsIncomingOne')
								: t('taskbar.trayFriendsIncomingMany', {
										count: fmtCount(n),
									})
							: undefined,
					appComponent: 'SocialHubApp',
				});
			}
		}

		return out;
	}, [
		currentUser,
		friendsIncomingCount,
		gafUnread,
		minimizedKey,
		minimizedPersistent,
		playing,
		shuffle,
		repeat,
		socketConnected,
		t,
		track,
		ugsActiveTaskCount,
		ugsTrayPollError,
	]);

	return {
		items,
		socketConnected,
		gafUnread,
		gafUnreadFetching,
		musicPlaybackErrorActive,
		musicPlaybackErrorMessage,
		friendsIncomingCount,
		ugsActiveTaskCount,
		ugsActiveTasksFetching,
		ugsTrayPollError,
		ugsTrayPollSuccess,
	};
}
