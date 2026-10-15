/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Bridge Socket.IO server notifications into desktop toasts and React Query invalidation.
 *
 * Invariants:
 * - EWDesk feed invalidation is debounced; ewdesk.news_updated also shows an open-app toast.
 *
 * Related:
 * - DesktopWorkspace.tsx, EmperyworldSocketService.ts
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Services, type NotificationEvent } from '../../services';
import type { EwDeskNewsUpdatedPayload } from '../../services/communication/EmperyworldSocketService';
import { invalidateFriendsQueries } from '@/features/friends/api/queryKeys';
import {
	ewDeskNewsCountsQueryKey,
	ewDeskNewsInvalidationQueryKey,
} from '@/pages/Desktop/components/ewDesk/ewDeskNewsQueryOptions';
import { getNotificationStoreRef } from '@/notifications/context';
import { notify } from '@/notifications';
import { openAppDetailFromNotification } from '@/notifications/openAppFromMetadata';
import { getNotificationPreferencesSnapshot } from '@/notifications/prefsBridge';
import { deliverDocCollabInviteSocketNotification } from '@/notifications/docCollabSocketDelivery';
import { buildSocketToastOptions } from '@/notifications/socketToastOptions';
import type { NotificationType, NotificationInput } from '@/notifications';

function mapEventTypeToNotificationType(
	eventType: NotificationEvent['type']
): NotificationType {
	if (eventType === 'system') {
		return 'info';
	}
	return eventType;
}

/** Coalesce socket bursts → one friends cache invalidation (desktop perf guardrail). */
const FRIENDS_QUERY_INVALIDATION_DEBOUNCE_MS = 220;
const EWDESK_QUERY_INVALIDATION_DEBOUNCE_MS = 220;

export function DesktopSocketNotificationsBridge(): null {
	const queryClient = useQueryClient();
	const { t } = useTranslation('desktopUi', { keyPrefix: 'ewDesk' });
	const friendsInvalidateTimerRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);
	const ewDeskInvalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null
	);

	const scheduleRefreshFriends = useCallback(() => {
		if (friendsInvalidateTimerRef.current != null) {
			clearTimeout(friendsInvalidateTimerRef.current);
		}
		friendsInvalidateTimerRef.current = setTimeout(() => {
			friendsInvalidateTimerRef.current = null;
			void invalidateFriendsQueries(queryClient);
		}, FRIENDS_QUERY_INVALIDATION_DEBOUNCE_MS);
	}, [queryClient]);

	const scheduleRefreshEwDesk = useCallback(() => {
		if (ewDeskInvalidateTimerRef.current != null) {
			clearTimeout(ewDeskInvalidateTimerRef.current);
		}
		ewDeskInvalidateTimerRef.current = setTimeout(() => {
			ewDeskInvalidateTimerRef.current = null;
			void queryClient.invalidateQueries({
				queryKey: ewDeskNewsInvalidationQueryKey(),
			});
			void queryClient.invalidateQueries({
				queryKey: ewDeskNewsCountsQueryKey(),
			});
		}, EWDESK_QUERY_INVALIDATION_DEBOUNCE_MS);
	}, [queryClient]);

	const openEwDeskApp = useCallback((postId?: string) => {
		try {
			window.dispatchEvent(
				new CustomEvent('desktop-open-app', {
					detail: {
						appComponent: 'EWDeskApp',
						...(postId ? { initialPayload: { ewDeskNewsId: postId } } : {}),
					},
				})
			);
		} catch {
			// ignore desktop event errors
		}
	}, []);

	useEffect(() => {
		return () => {
			if (friendsInvalidateTimerRef.current != null) {
				clearTimeout(friendsInvalidateTimerRef.current);
				friendsInvalidateTimerRef.current = null;
			}
			if (ewDeskInvalidateTimerRef.current != null) {
				clearTimeout(ewDeskInvalidateTimerRef.current);
				ewDeskInvalidateTimerRef.current = null;
			}
		};
	}, []);

	const openFriendsApp = useCallback(() => {
		try {
			window.dispatchEvent(
				new CustomEvent('desktop-open-app', {
					detail: {
						appComponent: 'SocialHubApp',
					},
				})
			);
		} catch {
			// ignore desktop event errors
		}
	}, []);

	useEffect(() => {
		const socket = Services.socket;

		const buildCenterAction = (
			event: NotificationEvent
		): NotificationInput['action'] | undefined => {
			const primaryAction = event.actions?.[0];
			if (!primaryAction) {
				return undefined;
			}

			if (primaryAction.action === 'open_friends') {
				return {
					label: primaryAction.label,
					onClick: openFriendsApp,
				};
			}

			return undefined;
		};

		const unsubscribe = socket.addEventListener(
			'notification',
			(data: unknown) => {
				const event = data as NotificationEvent;
				const level = mapEventTypeToNotificationType(event.type);
				const expiresAt = event.expires_at
					? new Date(event.expires_at)
					: undefined;
				const metaObj =
					event.metadata && typeof event.metadata === 'object'
						? (event.metadata as Record<string, unknown>)
						: undefined;
				const isDocCollabInvite = metaObj?.kind === 'doc_collaboration_invite';
				const serverActions =
					isDocCollabInvite && event.actions?.length
						? event.actions.map((a) => ({
								label: a.label,
								action: typeof a.action === 'string' ? a.action : '',
							}))
						: undefined;
				const action = serverActions?.length
					? undefined
					: buildCenterAction(event);
				const openApp = openAppDetailFromNotification(
					event.source,
					event.metadata
				);

				const input: NotificationInput = {
					id: event.id,
					type: level,
					title: event.title,
					message: event.message,
					source: event.source ?? 'server',
					persistent: event.persistent,
					expiresAt,
					action,
					...(serverActions?.length ? { serverActions } : {}),
					...(metaObj ? { metadata: metaObj } : {}),
					...(openApp ? { openApp } : {}),
				};

				const includeAllSocket =
					getNotificationPreferencesSnapshot()
						?.desktop_notification_center_all_socket_events === true;
				const shouldAddToCenter =
					includeAllSocket ||
					event.persistent ||
					event.priority === 'high' ||
					event.priority === 'urgent';

				if (event.source === 'friends') {
					scheduleRefreshFriends();
				}

				if (isDocCollabInvite && serverActions?.length && metaObj) {
					deliverDocCollabInviteSocketNotification({
						level,
						event,
						input,
						serverActions,
						metaObj,
						shouldAddToCenter,
					});
					return;
				}

				const toastOpts = buildSocketToastOptions({
					shouldAddToCenter,
					center: input,
				});

				// Show toast (Sonner); center row uses same id as server event (single add via notify API)
				if (level === 'success') {
					notify.success(event.title, event.message, toastOpts);
				} else if (level === 'error') {
					notify.error(event.title, event.message, toastOpts);
				} else if (level === 'warning') {
					notify.warning(event.title, event.message, toastOpts);
				} else {
					notify.info(event.title, event.message, toastOpts);
				}

				// Sound: toastAndSound inside notify.* already plays once — do not double-play here
			}
		);

		const unsubscribeFriendsUpdated = socket.addEventListener(
			'friends.updated',
			() => {
				scheduleRefreshFriends();
			}
		);

		const unsubscribeEwDeskUpdated = socket.addEventListener(
			'ewdesk.news_updated',
			(data: unknown) => {
				scheduleRefreshEwDesk();
				const payload = (data ?? {}) as EwDeskNewsUpdatedPayload;
				const postId = payload.post_id?.trim();
				notify.info(
					t('socketNewsUpdatedTitle'),
					t('socketNewsUpdatedMessage'),
					{
						toastAction: {
							label: t('socketNewsUpdatedAction'),
							onClick: () => {
								openEwDeskApp(postId);
							},
						},
					}
				);
			}
		);

		const unsubscribeDismiss = socket.addEventListener(
			'notification_dismiss',
			(data: unknown) => {
				const id =
					data &&
					typeof data === 'object' &&
					'id' in data &&
					typeof (data as { id: unknown }).id === 'string'
						? (data as { id: string }).id
						: null;
				if (!id) return;
				getNotificationStoreRef().current?.dismiss(id);
			}
		);

		return () => {
			unsubscribe();
			unsubscribeFriendsUpdated();
			unsubscribeEwDeskUpdated();
			unsubscribeDismiss();
		};
	}, [
		openEwDeskApp,
		openFriendsApp,
		scheduleRefreshEwDesk,
		scheduleRefreshFriends,
		t,
	]);

	return null;
}
