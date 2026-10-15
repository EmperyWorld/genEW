/**
 * Desktop-level GAF Chat process: Empery World socket, React Query invalidation, and incoming-message UX.
 *
 * **Imports:** `gafChatQueryKeys` from `../components/GAFChat/api/gafChatApi`;
 * `gafChatMeQueryOptions` from `gafChatQueryOptions` (staleTime aligned with shell-bootstrap seed).
 * `gafChatApi` does not import this provider or Desktop context — no circular dependency.
 *
 * **Socket:** On authenticated Desktop, **one leader tab** holds `Services.socket` (see
 * `utils/desktopRealtimeLeader.ts`); follower tabs receive GAF events via BroadcastChannel relay.
 * Connection state is exposed via `socketConnectionStore` (leader only) and `isDesktopRealtimeLeader` in context.
 *
 * **Query cache:** Debounced invalidation of `gafChatQueryKeys.chats` plus per-chat
 * `gafChatQueryKeys.messages(id)` invalidation for pending chats. Debounce uses exponential
 * backoff while events keep arriving before a flush (storm damping).
 * First socket `connection-restored` (`initial: true`) does **not** invalidate chats —
 * shell-bootstrap already seeded the list (see `gafChatConnectionRestorePolicy`).
 * On logout, `removeQueries({ queryKey: gafChatQueryKeys.all })`.
 *
 * **Multi-tab:** Leader relays socket events on `eliteew-desktop-realtime-v1` BC; notification
 * dedupe keys still shared on `eliteew-gaf-chat-notify-v1`.
 *
 * **Incoming messages (non-self, unmuted):** Short beep when `notifications.gaf.incoming_message.in_app`
 * (respects tab visibility deferral, GAF sound toggle + desktop notification sound/DND via `gafChatUiSounds`), optional notification
 * center + Sonner, optional OS notification when `browser` is on and the tab is not visible — см. профиль.
 * Event-level dedupe uses `NOTIFY_DEDUPE_MS` and a bounded key map (`message_id` or content hash).
 * **Foreground toasts:** When `document.visibilityState === 'visible'`, Sonner uses a stable `id` per `chatId`
 * so rapid messages in the same chat update one toast instead of stacking. When hidden, `id` is tied to the
 * dedupe key so replays still collapse.
 */
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useBrowserTabLeader } from '@/contexts/BrowserTabLeaderProvider';
import { setBrowserTabSocketConnected } from '@/utils/browserTabLeaderState';
import {
	setSocketConnectionConnected,
	setSocketConnectionLeader,
	resetSocketConnectionStore,
} from '@/services/communication/socketConnectionStore';
import {
	getDesktopShellReady,
	subscribeDesktopShellReady,
} from '../utils/desktopShellReady';
import { useUserPreferencesApp } from '@/contexts/UserPreferencesAppContext';
import type { Friend, FriendsOverview } from '@/features/friends/types';
import { friendsQueryKeys } from '@/features/friends/api/queryKeys';
import { getNotificationStoreRef } from '@/notifications/context';
import {
	DEFAULT_GAF_NOTIFICATION_PREFERENCES,
	type UgsNotificationBlockSettings,
} from '@/types/profile';
import { showBrowserNotificationWhenTabHidden } from '@/utils/browserSystemNotification';
import { Services } from '@/services';
import {
	bindDesktopRealtimePerfQueryClient,
	ensureDesktopRealtimePerfConsoleInstalled,
	markInvalidationEnd,
	markInvalidationStart,
} from '@/services/communication/desktopRealtimePerfTelemetry';
import {
	useQuery,
	useQueryClient,
	type InfiniteData,
} from '@tanstack/react-query';
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	type ReactNode,
} from 'react';
import { toast as sonnerToast } from 'sonner';
import {
	requestCloseDesktopVideoCall,
	requestOpenDesktopApp,
} from '../utils/desktopDeepLink';
import { gafChatQueryKeys } from '../components/GAFChat/api/gafChatApi';
import { shouldRefetchGafChatsOnConnectionRestored } from '../components/GAFChat/gafChatConnectionRestorePolicy';
import { gafChatMeQueryOptions } from '../components/GAFChat/gafChatQueryOptions';
import type {
	GAFChatListItem,
	GAFMessageItem,
} from '../components/GAFChat/types';
import {
	appendGafSocketMessageToInfinitePages,
	gafSocketPayloadToMessageItem,
} from '../components/GAFChat/gafChatMessageUtils';
import { fetchDesktopShellStateDeduplicated } from '../services/desktopApi';
import {
	flushShellStatePipelineNow,
	scheduleShellStateMutation,
} from '../utils/desktopShellStateMutationPipeline';
import { gafChatFocusedChatIdRef } from '../components/GAFChat/gafChatFocusedChatRef';
import {
	GAF_CHAT_SOUND_ANON_STORAGE_KEY,
	setGafChatSoundEnabledCached,
} from '../utils/gafChatShellSound';
import {
	closeGafChatUiSoundsAudioContext,
	playGafReceiveOpenThreadSoundNow,
	playGafStandardIncomingBeepNow,
	playGafVideoCallRingNow,
} from '../utils/gafChatUiSounds';
import { useDesktopBackgroundRuntimeController } from '../runtime/DesktopBackgroundRuntimeContext';
import {
	endVideoCall,
	joinVideoCall,
} from '../components/VideoCall/api/videoCallApi';
import { startOutgoingJoinPoll } from '../components/GAFChat/videoCallOutgoingJoinPoll';
import { shouldOpenDesktopMeetOnVideoCallAccepted } from '../components/GAFChat/videoCallDeviceAffinity';
import {
	registerOutgoingVideoCallHandler,
	videoCallMissedToastMessage,
	type OutgoingVideoCallOpts,
} from '../components/GAFChat/gafVideoCallOutgoing';
import { DESKTOP_REALTIME_BC } from '../utils/desktopRealtimeLeader';
import { subscribeDocumentVisibleSync } from '../utils/subscribeDocumentVisibleSync';

interface GAFChatProcessState {
	/** True when this tab holds the single desktop Socket.IO leader lock. */
	isDesktopRealtimeLeader: boolean;
}

interface GAFChatContextValue extends GAFChatProcessState {
	/** Placeholder for future process-level controls (mute notifications, global status, etc.). */
}

const defaultValue: GAFChatContextValue = {
	isDesktopRealtimeLeader: false,
};

const GAFChatContext = createContext<GAFChatContextValue | null>(null);

export function useGAFChatProcess(): GAFChatContextValue {
	const ctx = useContext(GAFChatContext);
	return ctx ?? defaultValue;
}

interface GAFChatProviderProps {
	children: ReactNode;
}

const NOTIFY_DEDUPE_MS = 4000;
const INVALIDATION_DEBOUNCE_MS = 100;
const INVALIDATION_DEBOUNCE_MAX_MS = 2000;
/** Реже будить главный поток: статус сокета и так обновляется по событиям */
const SOCKET_SYNC_INTERVAL_MS = 15_000;
/** Повтор connect после занятого browser lease (stale sid в Redis) */
const SOCKET_LEASE_RETRY_MS = 15_000;
/** Периодический reconnect, если socket.io исчерпал внутренние попытки */
const SOCKET_RECONNECT_PROBE_MS = 60_000;
const VIDEO_CALL_RING_INTERVAL_MS = 2_700;

const GAF_NOTIFY_BC = 'eliteew-gaf-chat-notify-v1';
const VIDEO_CALL_ENDED_BROWSER_EVENT = 'eliteew-video-call-ended';

type GafNotifyBcPayload = { type: 'gaf-notify'; dedupeKey: string; t: number };

type DesktopRealtimeRelayPayload = {
	type: 'socket-relay';
	event: string;
	payload: unknown;
	t: number;
};

type GafMessageNewPayload = {
	chat_id?: string;
	sender_id?: string;
	body?: string;
	created_at?: string;
	recipient_is_muted?: boolean;
	message_id?: string;
	algorithm?: string | null;
	encryption_version?: string | null;
	body_ciphertext?: string | null;
	nonce?: string | null;
	attachment_content_id?: string | null;
	attachment_mime_type?: string | null;
	attachment_name?: string | null;
	attachment_size?: number | null;
	attachment_recipient_saved_id?: string | null;
	reply_to_message_id?: string | null;
	metadata?: Record<string, unknown> | null;
};

type VideoCallIncomingPayload = {
	call_id?: string;
	chat_id?: string | null;
	caller_user_id?: string;
	/** Server preference: suppress desktop ring when mobile_only. */
	call_target?: string;
};

/**
 * Фоновый процесс GAF Chat на уровне Desktop: socket, инвалидация кэша, уведомления о входящих.
 * Подробности — блок комментария в начале файла.
 */
function resolveGafIncomingBlock(
	raw: UgsNotificationBlockSettings | undefined
): UgsNotificationBlockSettings {
	return {
		enabled: raw?.enabled !== false,
		in_app: raw?.in_app !== false,
		browser: raw?.browser === true,
	};
}

export function GAFChatProvider({ children }: GAFChatProviderProps) {
	const { t } = useTranslation('gafChat');
	const tRef = useRef(t);
	tRef.current = t;

	const { user } = useAuth();
	const { isLeader, isSocketOwner } = useBrowserTabLeader();
	const runtimeController = useDesktopBackgroundRuntimeController();
	const prefsApp = useUserPreferencesApp();
	const gafIncomingBlock = resolveGafIncomingBlock({
		...DEFAULT_GAF_NOTIFICATION_PREFERENCES.incoming_message,
		...prefsApp?.preferences?.notifications?.gaf?.incoming_message,
	});
	const gafIncomingBlockRef = useRef(gafIncomingBlock);
	gafIncomingBlockRef.current = gafIncomingBlock;

	const userId = user?.id;
	const socketDisplayName = useMemo(
		() => user?.profile?.display_name || user?.email || user?.username || '',
		[user?.profile?.display_name, user?.email, user?.username]
	);
	const isDesktopRealtimeLeader = isLeader;

	useEffect(() => {
		setSocketConnectionLeader(isSocketOwner);
		if (!isSocketOwner) {
			setSocketConnectionConnected(false);
		}
		return () => {
			resetSocketConnectionStore();
		};
	}, [isSocketOwner]);

	const relayBcRef = useRef<BroadcastChannel | null>(null);
	const queryClient = useQueryClient();
	const queryClientRef = useRef(queryClient);
	queryClientRef.current = queryClient;

	useEffect(() => {
		ensureDesktopRealtimePerfConsoleInstalled();
		return bindDesktopRealtimePerfQueryClient(queryClient);
	}, [queryClient]);

	const { data: me } = useQuery({
		...gafChatMeQueryOptions(),
		enabled: !!user,
	});
	const gafUserId = me?.user_id ?? null;
	const gafUserIdRef = useRef<string | null>(null);
	gafUserIdRef.current = gafUserId;

	/** Deferred incoming sound while tab was hidden (Page Visibility). */
	const pendingIncomingSoundRef = useRef<(() => void) | null>(null);
	const prevUserRef = useRef(user);

	useEffect(() => {
		if (!gafUserId) return;
		try {
			const raw = window.localStorage.getItem(
				`gaf_chat_sound_enabled::${gafUserId}`
			);
			if (raw === '0') setGafChatSoundEnabledCached(false);
			else if (raw === '1') setGafChatSoundEnabledCached(true);
		} catch {
			/* ignore */
		}
		let cancelled = false;
		void (async () => {
			try {
				const s = await fetchDesktopShellStateDeduplicated();
				if (cancelled) return;
				if (typeof s.gaf_chat_sound_enabled === 'boolean') {
					setGafChatSoundEnabledCached(s.gaf_chat_sound_enabled);
				} else {
					try {
						const r = window.localStorage.getItem(
							`gaf_chat_sound_enabled::${gafUserId}`
						);
						let leg: boolean | null = null;
						if (r === '0') leg = false;
						else if (r === '1') leg = true;
						if (leg !== null) {
							setGafChatSoundEnabledCached(leg);
							scheduleShellStateMutation({
								source: 'chrome',
								merge: () => ({ gaf_chat_sound_enabled: leg }),
							});
							await flushShellStatePipelineNow('chrome').catch(() => {});
						}
					} catch {
						/* ignore */
					}
				}
				try {
					window.localStorage.removeItem(
						`gaf_chat_sound_enabled::${gafUserId}`
					);
					window.localStorage.removeItem(GAF_CHAT_SOUND_ANON_STORAGE_KEY);
				} catch {
					/* ignore */
				}
			} catch {
				try {
					const r = window.localStorage.getItem(
						`gaf_chat_sound_enabled::${gafUserId}`
					);
					if (r === '0') setGafChatSoundEnabledCached(false);
					else if (r === '1') setGafChatSoundEnabledCached(true);
				} catch {
					/* ignore */
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [gafUserId]);

	const scheduleIncomingSound = useCallback(
		(playFn: () => void | Promise<void>) => {
			if (!gafUserId || typeof window === 'undefined') return;
			if (typeof document === 'undefined') {
				void Promise.resolve(playFn());
				return;
			}
			if (document.visibilityState === 'visible') {
				pendingIncomingSoundRef.current = null;
				void Promise.resolve(playFn());
				return;
			}
			pendingIncomingSoundRef.current = () => {
				void Promise.resolve(playFn());
			};
		},
		[gafUserId]
	);

	useEffect(() => {
		return subscribeDocumentVisibleSync(() => {
			const pending = pendingIncomingSoundRef.current;
			if (!pending) return;
			pendingIncomingSoundRef.current = null;
			pending();
		});
	}, []);

	const isMutedIncomingChat = useCallback(
		(
			chatId?: string | null,
			senderId?: string | null,
			payloadMuted?: boolean
		): boolean => {
			if (payloadMuted) {
				return true;
			}

			const chats = queryClient.getQueryData<GAFChatListItem[]>(
				gafChatQueryKeys.chats
			);
			if (chatId) {
				const mutedInChatCache = chats?.some(
					(chat) => chat.chat_id === chatId && chat.partner?.is_muted
				);
				if (mutedInChatCache) {
					return true;
				}
			}

			if (senderId) {
				const friendsList = queryClient.getQueryData<Friend[]>(
					friendsQueryKeys.list()
				);
				if (
					friendsList?.some(
						(friend) => friend.id === senderId && friend.is_muted
					)
				) {
					return true;
				}

				const overview = queryClient.getQueryData<FriendsOverview>(
					friendsQueryKeys.overview()
				);
				if (
					overview?.friends?.some(
						(friend) => friend.id === senderId && friend.is_muted
					)
				) {
					return true;
				}
			}

			return false;
		},
		[queryClient]
	);

	const isMutedIncomingChatRef = useRef(isMutedIncomingChat);
	isMutedIncomingChatRef.current = isMutedIncomingChat;

	const scheduleIncomingSoundRef = useRef(scheduleIncomingSound);
	scheduleIncomingSoundRef.current = scheduleIncomingSound;

	const videoCallRingTimersRef = useRef<Map<string, number>>(new Map());
	/** Dispose fns for HTTP join-poll while outgoing toast is active (socket fallback). */
	const videoCallOutgoingJoinPollRef = useRef<Map<string, () => void>>(
		new Map()
	);
	/** Call IDs this browser started (outgoing ring) — gate Meet open on accepted. */
	const localOutgoingVideoCallIdsRef = useRef<Set<string>>(new Set());
	const recentNotifyKeysRef = useRef<Map<string, number>>(new Map());
	const notifyBcRef = useRef<BroadcastChannel | null>(null);

	// Share notification dedupe keys across tabs (same browser profile); low footprint, best-effort.
	useEffect(() => {
		if (!userId || typeof BroadcastChannel === 'undefined') {
			notifyBcRef.current?.close();
			notifyBcRef.current = null;
			return;
		}
		let ch: BroadcastChannel;
		try {
			ch = new BroadcastChannel(GAF_NOTIFY_BC);
		} catch {
			return;
		}
		notifyBcRef.current = ch;
		const onMsg = (e: MessageEvent) => {
			const d = e.data as Partial<GafNotifyBcPayload> | undefined;
			if (d?.type !== 'gaf-notify' || typeof d.dedupeKey !== 'string') {
				return;
			}
			const t = typeof d.t === 'number' ? d.t : Date.now();
			const map = recentNotifyKeysRef.current;
			map.set(d.dedupeKey, t);
			if (map.size > 80) {
				const first = map.keys().next().value as string | undefined;
				if (first !== undefined) map.delete(first);
			}
		};
		ch.addEventListener('message', onMsg);
		return () => {
			ch.removeEventListener('message', onMsg);
			ch.close();
			if (notifyBcRef.current === ch) {
				notifyBcRef.current = null;
			}
		};
	}, [userId]);

	// Relay channel for follower tabs (socket events from leader).
	useEffect(() => {
		if (!userId || typeof BroadcastChannel === 'undefined') {
			relayBcRef.current?.close();
			relayBcRef.current = null;
			return;
		}
		let ch: BroadcastChannel;
		try {
			ch = new BroadcastChannel(DESKTOP_REALTIME_BC);
		} catch {
			return;
		}
		relayBcRef.current = ch;
		return () => {
			ch.close();
			if (relayBcRef.current === ch) {
				relayBcRef.current = null;
			}
		};
	}, [userId]);

	// Logout / session end: drop GAF cache, dedupe state, audio; socket effect clears on !userId.
	useEffect(() => {
		const prev = prevUserRef.current;
		prevUserRef.current = user;
		if (!prev || user) return;
		pendingIncomingSoundRef.current = null;
		for (const timerId of videoCallRingTimersRef.current.values()) {
			window.clearInterval(timerId);
		}
		videoCallRingTimersRef.current.clear();
		for (const dispose of videoCallOutgoingJoinPollRef.current.values()) {
			dispose();
		}
		videoCallOutgoingJoinPollRef.current.clear();
		localOutgoingVideoCallIdsRef.current.clear();
		recentNotifyKeysRef.current.clear();
		closeGafChatUiSoundsAudioContext();
		queryClient.removeQueries({ queryKey: gafChatQueryKeys.all });
	}, [user, queryClient]);

	const stopVideoCallRing = useCallback((callId?: string | null) => {
		if (!callId) return;
		const timerId = videoCallRingTimersRef.current.get(callId);
		if (timerId == null) return;
		window.clearInterval(timerId);
		videoCallRingTimersRef.current.delete(callId);
	}, []);

	const stopOutgoingJoinPoll = useCallback((callId?: string | null) => {
		if (!callId) return;
		const dispose = videoCallOutgoingJoinPollRef.current.get(callId);
		if (!dispose) return;
		dispose();
		videoCallOutgoingJoinPollRef.current.delete(callId);
	}, []);

	const openMeetAfterOutgoingAccepted = useCallback(
		(callId: string) => {
			const id = callId.trim();
			if (!id) return;
			stopVideoCallRing(id);
			stopOutgoingJoinPoll(id);
			sonnerToast.dismiss(`video-call:${id}`);
			sonnerToast.dismiss(`video-call-outgoing:${id}`);
			const openMeet = shouldOpenDesktopMeetOnVideoCallAccepted(
				localOutgoingVideoCallIdsRef.current,
				id
			);
			localOutgoingVideoCallIdsRef.current.delete(id);
			// Other devices of the same user (e.g. idle desktop while mobile called)
			// must clear ringing UI only — opening Meet causes dual-join media flaps.
			if (!openMeet) return;
			requestOpenDesktopApp({
				appComponent: 'VideoCallApp',
				videoCallId: id,
				videoCallTitle: t('videoCallAppTitle'),
			});
		},
		[stopOutgoingJoinPoll, stopVideoCallRing, t]
	);

	const startVideoCallRing = useCallback(
		(callId: string) => {
			const incoming = gafIncomingBlockRef.current;
			if (!incoming.enabled || !incoming.in_app) return;
			stopVideoCallRing(callId);
			const play = () => {
				void playGafVideoCallRingNow({ force: true });
			};
			play();
			const timerId = window.setInterval(play, VIDEO_CALL_RING_INTERVAL_MS);
			videoCallRingTimersRef.current.set(callId, timerId);
		},
		[stopVideoCallRing]
	);

	const showOutgoingVideoCall = useCallback(
		(opts: OutgoingVideoCallOpts) => {
			const callId = opts.callId.trim();
			if (!callId) return;
			localOutgoingVideoCallIdsRef.current.add(callId);
			const partnerLabel =
				opts.partnerLabel.trim() || t('desktopProcess.partnerLabelFallback');
			const cancelCall = () => {
				stopVideoCallRing(callId);
				stopOutgoingJoinPoll(callId);
				localOutgoingVideoCallIdsRef.current.delete(callId);
				sonnerToast.dismiss(`video-call-outgoing:${callId}`);
				void endVideoCall(callId).catch(() => {
					sonnerToast.error(t('desktopProcess.cancelCallFailed'));
				});
			};
			startVideoCallRing(callId);
			stopOutgoingJoinPoll(callId);
			const disposePoll = startOutgoingJoinPoll({
				callId,
				join: joinVideoCall,
				isStillOutgoing: (id) => localOutgoingVideoCallIdsRef.current.has(id),
				onAccepted: openMeetAfterOutgoingAccepted,
			});
			videoCallOutgoingJoinPollRef.current.set(callId, disposePoll);
			sonnerToast.info(
				t('desktopProcess.outgoingCallTitle', { partner: partnerLabel }),
				{
					description: t('desktopProcess.outgoingCallWaiting'),
					duration: 120_000,
					id: `video-call-outgoing:${callId}`,
					action: {
						label: t('desktopProcess.actionCancel'),
						onClick: cancelCall,
					},
					cancel: {
						label: t('desktopProcess.actionDismiss'),
						onClick: () => sonnerToast.dismiss(`video-call-outgoing:${callId}`),
					},
				}
			);
		},
		[
			openMeetAfterOutgoingAccepted,
			startVideoCallRing,
			stopOutgoingJoinPoll,
			stopVideoCallRing,
			t,
		]
	);

	useEffect(() => {
		registerOutgoingVideoCallHandler(showOutgoingVideoCall);
		return () => registerOutgoingVideoCallHandler(null);
	}, [showOutgoingVideoCall]);

	useEffect(() => {
		return () => {
			for (const timerId of videoCallRingTimersRef.current.values()) {
				window.clearInterval(timerId);
			}
			videoCallRingTimersRef.current.clear();
			for (const dispose of videoCallOutgoingJoinPollRef.current.values()) {
				dispose();
			}
			videoCallOutgoingJoinPollRef.current.clear();
		};
	}, []);

	const pushIncomingMessageNotification = useCallback(
		(chatId: string, preview: string, opts: { dedupeKey: string }) => {
			const b = gafIncomingBlockRef.current;
			if (!b.enabled) {
				return;
			}

			const title = t('desktopProcess.incomingMessageTitle');
			const message = preview || t('desktopProcess.incomingMessageFallback');
			const inForeground =
				typeof document !== 'undefined' &&
				document.visibilityState === 'visible';

			if (b.in_app) {
				/** Foreground: one toast per chat (updates in place). Background: one row per dedupe key. */
				const toastId = inForeground
					? `gaf-chat-foreground:${chatId}`
					: `gaf-chat:${opts.dedupeKey}`;
				const openChat = () => {
					requestOpenDesktopApp({
						appComponent: 'GAFChatApp',
						targetChatId: chatId,
					});
				};
				sonnerToast.info(title, {
					description: message,
					duration: 4000,
					id: toastId,
					action: {
						label: t('desktopProcess.actionOpen'),
						onClick: openChat,
					},
				});
				const store = getNotificationStoreRef().current;
				if (store) {
					store.addToCenter({
						type: 'info',
						title,
						message,
						openApp: {
							appComponent: 'GAFChatApp',
							targetChatId: chatId,
						},
						action: {
							label: t('desktopProcess.actionOpenChat'),
							onClick: openChat,
						},
					});
				}
			}

			if (b.browser) {
				showBrowserNotificationWhenTabHidden(title, message, {
					tag: `gaf-chat:${opts.dedupeKey}`,
					onClick: () => {
						requestOpenDesktopApp({
							appComponent: 'GAFChatApp',
							targetChatId: chatId,
						});
					},
				});
			}
		},
		[t]
	);

	// Leaving desktop: deferred disconnect so an in-flight polling→websocket upgrade is not aborted in the same tick.
	useEffect(() => {
		return () => {
			requestAnimationFrame(() => {
				try {
					void Services.socket.disconnect();
				} catch {
					/* ignore */
				}
			});
		};
	}, []);

	// Tab lost socket ownership or session ended — disconnect without re-running on auth object identity churn.
	useEffect(() => {
		if (userId && isSocketOwner) {
			return;
		}
		setSocketConnectionConnected(false);
		setBrowserTabSocketConnected(false);
		const frame = requestAnimationFrame(() => {
			try {
				void Services.socket.disconnect();
			} catch {
				/* ignore */
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [userId, isSocketOwner]);

	useEffect(() => {
		if (!userId || !isSocketOwner) {
			return;
		}
		const socket = Services.socket;
		if (!socket || typeof socket.connect !== 'function') return;

		let cancelled = false;
		let reconnectTimer: number | null = null;

		const connectParams = {
			user_id: userId,
			user_name: socketDisplayName,
			capabilities: ['chat', 'monitoring'] as string[],
		};

		const syncConnected = () => {
			if (cancelled) return;
			try {
				if (typeof socket.isConnected === 'function') {
					const ok = socket.isConnected();
					setSocketConnectionConnected(ok);
					setBrowserTabSocketConnected(ok);
				}
			} catch {
				setSocketConnectionConnected(false);
				setBrowserTabSocketConnected(false);
			}
		};

		const attemptConnect = () => {
			if (cancelled) return;
			try {
				if (typeof socket.getConnectionState === 'function') {
					const state = socket.getConnectionState();
					if (state === 'connecting') {
						return;
					}
					if (state === 'connected' && socket.isConnected?.()) {
						syncConnected();
						return;
					}
				}
			} catch {
				/* ignore state probe errors */
			}
			void socket
				.connect(connectParams)
				.then(() => {
					if (!cancelled) syncConnected();
				})
				.catch(() => {
					if (!cancelled) setSocketConnectionConnected(false);
				});
		};

		const scheduleReconnect = (delayMs = SOCKET_LEASE_RETRY_MS) => {
			if (cancelled || reconnectTimer != null) return;
			reconnectTimer = window.setTimeout(() => {
				reconnectTimer = null;
				attemptConnect();
			}, delayMs);
		};

		let disposeConnect: (() => void) | null = null;
		let shellRaf: number | null = null;

		const activateSocketTransport = () => {
			if (cancelled) return;

			attemptConnect();

			const unsubLost =
				typeof socket.addEventListener === 'function'
					? socket.addEventListener('connection-lost', () => {
							setSocketConnectionConnected(false);
							setBrowserTabSocketConnected(false);
							scheduleReconnect();
						})
					: () => {};

			const intervalId = window.setInterval(
				syncConnected,
				SOCKET_SYNC_INTERVAL_MS
			);
			const reconnectProbeId = window.setInterval(() => {
				if (cancelled) return;
				try {
					if (
						typeof socket.isConnected === 'function' &&
						!socket.isConnected()
					) {
						attemptConnect();
					}
				} catch {
					scheduleReconnect();
				}
			}, SOCKET_RECONNECT_PROBE_MS);

			const unsubVisibleSync = subscribeDocumentVisibleSync(() => {
				syncConnected();
				try {
					if (
						typeof socket.isConnected === 'function' &&
						!socket.isConnected()
					) {
						attemptConnect();
					}
				} catch {
					scheduleReconnect();
				}
			});

			disposeConnect = () => {
				unsubLost();
				unsubVisibleSync();
				window.clearInterval(intervalId);
				window.clearInterval(reconnectProbeId);
			};
		};

		const scheduleActivate = () => {
			shellRaf = window.requestAnimationFrame(() => {
				activateSocketTransport();
			});
		};

		const unsubSuperseded =
			typeof socket.addEventListener === 'function'
				? socket.addEventListener('presence_superseded', () => {
						setSocketConnectionConnected(false);
						setBrowserTabSocketConnected(false);
						scheduleReconnect();
					})
				: () => {};

		const unsubRestored =
			typeof socket.addEventListener === 'function'
				? socket.addEventListener('connection-restored', () => {
						syncConnected();
					})
				: () => {};

		let unsubShellReady: (() => void) | null = null;
		if (getDesktopShellReady()) {
			scheduleActivate();
		} else {
			unsubShellReady = subscribeDesktopShellReady(scheduleActivate);
		}

		return () => {
			cancelled = true;
			if (shellRaf != null) {
				window.cancelAnimationFrame(shellRaf);
			}
			unsubShellReady?.();
			disposeConnect?.();
			if (reconnectTimer != null) {
				window.clearTimeout(reconnectTimer);
			}
			unsubSuperseded();
			unsubRestored();
		};
	}, [userId, isSocketOwner, socketDisplayName]);

	// Global listeners for GAF Chat events (leader: socket + relay; followers: BC relay only).
	useEffect(() => {
		if (!userId) return;
		const socket = Services.socket;
		const socketOk = Boolean(
			socket && typeof socket.addEventListener === 'function'
		);

		const postRelay = (event: string, payload: unknown) => {
			try {
				relayBcRef.current?.postMessage({
					type: 'socket-relay',
					event,
					payload,
					t: Date.now(),
				} satisfies DesktopRealtimeRelayPayload);
			} catch {
				/* ignore */
			}
		};

		let debounceTimer: number | null = null;
		let pendingDebounceMs = INVALIDATION_DEBOUNCE_MS;
		const pendingMessageChatIds = new Set<string>();

		const flushInvalidations = () => {
			debounceTimer = null;
			pendingDebounceMs = INVALIDATION_DEBOUNCE_MS;
			const qc = queryClientRef.current;
			markInvalidationStart();
			const invalidations: Array<Promise<unknown>> = [
				qc.invalidateQueries({ queryKey: gafChatQueryKeys.chats }),
			];
			if (pendingMessageChatIds.size === 1) {
				const only = pendingMessageChatIds.values().next().value;
				if (only !== undefined) {
					invalidations.push(
						qc.invalidateQueries({
							queryKey: gafChatQueryKeys.messages(only),
						})
					);
				}
			} else if (pendingMessageChatIds.size > 1) {
				for (const chatId of pendingMessageChatIds) {
					invalidations.push(
						qc.invalidateQueries({
							queryKey: gafChatQueryKeys.messages(chatId),
						})
					);
				}
			}
			pendingMessageChatIds.clear();
			void Promise.all(invalidations).finally(() => {
				markInvalidationEnd();
			});
		};

		const scheduleInvalidate = (chatId?: string | null) => {
			// Refetch message history for the chat that received a socket event (active query only).
			if (chatId) {
				pendingMessageChatIds.add(chatId);
			}
			if (
				typeof document !== 'undefined' &&
				document.visibilityState !== 'visible'
			) {
				runtimeController.trackBackgroundInvalidation();
			}
			if (debounceTimer != null) {
				window.clearTimeout(debounceTimer);
				pendingDebounceMs = Math.min(
					pendingDebounceMs * 2,
					INVALIDATION_DEBOUNCE_MAX_MS
				);
			} else {
				pendingDebounceMs = INVALIDATION_DEBOUNCE_MS;
			}
			debounceTimer = window.setTimeout(flushInvalidations, pendingDebounceMs);
		};

		const mergeIncomingMessageIntoCache = (rawUnknown: unknown) => {
			const data = rawUnknown as GafMessageNewPayload | undefined;
			const chatId = data?.chat_id?.trim();
			if (!chatId) return;
			const item = gafSocketPayloadToMessageItem(data ?? {});
			if (!item) return;
			queryClientRef.current.setQueryData<InfiniteData<GAFMessageItem[]>>(
				gafChatQueryKeys.messages(chatId),
				(old) => {
					if (!old) return old;
					const pages = appendGafSocketMessageToInfinitePages(old.pages, item, {
						myUserId: gafUserIdRef.current,
					});
					if (pages === old.pages) return old;
					return { ...old, pages };
				}
			);
		};

		const onMessageNew = (rawUnknown: unknown) => {
			const data = rawUnknown as GafMessageNewPayload | undefined;
			const chatId = data?.chat_id;
			mergeIncomingMessageIntoCache(rawUnknown);
			scheduleInvalidate(chatId ?? undefined);
			const maybeVideoCallMeta = data?.metadata as
				| { kind?: unknown; event?: unknown; call_id?: unknown }
				| null
				| undefined;
			if (
				maybeVideoCallMeta?.kind === 'video_call_event' &&
				['accepted', 'ended', 'missed'].includes(
					String(maybeVideoCallMeta.event || '')
				) &&
				typeof maybeVideoCallMeta.call_id === 'string'
			) {
				stopVideoCallRing(maybeVideoCallMeta.call_id);
			}

			const gid = gafUserIdRef.current;
			const isIncoming =
				data?.sender_id != null && gid != null && data.sender_id !== gid;
			if (!chatId || !isIncoming) return;
			if (
				isMutedIncomingChatRef.current(
					chatId,
					data.sender_id ?? null,
					data?.recipient_is_muted === true
				)
			) {
				return;
			}

			const dedupeKey =
				data.message_id?.trim() ||
				`${chatId}:${data.sender_id ?? ''}:${data.created_at ?? ''}:${(data.body ?? '').slice(0, 64)}`;
			const now = Date.now();
			const map = recentNotifyKeysRef.current;
			const last = map.get(dedupeKey);
			if (last !== undefined && now - last < NOTIFY_DEDUPE_MS) {
				return;
			}
			map.set(dedupeKey, now);
			if (map.size > 80) {
				const first = map.keys().next().value as string | undefined;
				if (first !== undefined) map.delete(first);
			}

			try {
				notifyBcRef.current?.postMessage({
					type: 'gaf-notify',
					dedupeKey,
					t: now,
				} satisfies GafNotifyBcPayload);
			} catch {
				// ignore BC errors
			}

			const incoming = gafIncomingBlockRef.current;
			if (!incoming.enabled) {
				return;
			}
			if (incoming.in_app) {
				const focused = gafChatFocusedChatIdRef.current;
				const playFn =
					focused === chatId
						? playGafReceiveOpenThreadSoundNow
						: playGafStandardIncomingBeepNow;
				scheduleIncomingSoundRef.current(() => void playFn());
			}
			const preview = (data?.body || '').slice(0, 120);
			pushIncomingMessageNotification(chatId, preview, {
				dedupeKey,
			});
		};

		const onChatCreated = (dataUnknown: unknown) => {
			const data = dataUnknown as { chat_id?: string } | undefined;
			scheduleInvalidate(data?.chat_id);
		};

		const onMessageEdited = (dataUnknown: unknown) => {
			const data = dataUnknown as { chat_id: string };
			scheduleInvalidate(data?.chat_id);
		};

		const onMessageDeleted = (dataUnknown: unknown) => {
			const data = dataUnknown as { chat_id: string };
			scheduleInvalidate(data?.chat_id);
		};

		const onMessageRead = (dataUnknown: unknown) => {
			const data = dataUnknown as
				| {
						chat_id?: string;
						user_id?: string;
						up_to_message_id?: string | null;
				  }
				| undefined;
			void data;
			return;
		};

		const onVideoIncoming = (dataUnknown: unknown) => {
			const data = dataUnknown as VideoCallIncomingPayload | undefined;
			const callId = data?.call_id?.trim();
			if (!callId) return;
			const callTarget = String(data?.call_target || 'both')
				.trim()
				.toLowerCase();
			if (callTarget === 'mobile_only') {
				return;
			}
			const translate = tRef.current;
			const incomingVideoTitle = translate(
				'desktopProcess.incomingVideoCallTitle'
			);
			const incomingVideoMessage = translate(
				'desktopProcess.incomingVideoCallDescription'
			);
			const videoCallWindowTitle = translate('videoCallAppTitle');
			const openCall = () => {
				stopVideoCallRing(callId);
				requestOpenDesktopApp({
					appComponent: 'VideoCallApp',
					videoCallId: callId,
					videoCallTitle: videoCallWindowTitle,
				});
			};
			const declineCall = () => {
				stopVideoCallRing(callId);
				sonnerToast.dismiss(`video-call:${callId}`);
				void endVideoCall(callId).catch(() => {
					sonnerToast.error(translate('desktopProcess.declineCallFailed'));
				});
			};
			const incoming = gafIncomingBlockRef.current;
			startVideoCallRing(callId);
			sonnerToast.info(incomingVideoTitle, {
				description: incomingVideoMessage,
				duration: 60_000,
				id: `video-call:${callId}`,
				action: {
					label: translate('desktopProcess.actionAnswer'),
					onClick: openCall,
				},
				cancel: {
					label: translate('desktopProcess.actionDecline'),
					onClick: declineCall,
				},
			});
			const store = getNotificationStoreRef().current;
			if (store) {
				store.addToCenter({
					type: 'info',
					title: incomingVideoTitle,
					message: incomingVideoMessage,
					openApp: {
						appComponent: 'VideoCallApp',
						videoCallId: callId,
						videoCallTitle: videoCallWindowTitle,
					},
					action: {
						label: translate('desktopProcess.actionAnswer'),
						onClick: openCall,
					},
				});
			}
			if (incoming.enabled && incoming.browser) {
				showBrowserNotificationWhenTabHidden(
					incomingVideoTitle,
					incomingVideoMessage,
					{
						tag: `video-call:${callId}`,
						onClick: openCall,
					}
				);
			}
		};

		const onVideoEnded = (dataUnknown: unknown) => {
			const data = dataUnknown as
				| {
						call_id?: string;
						missed_reason?: string;
						status?: string;
				  }
				| undefined;
			const callId = data?.call_id?.trim();
			if (!callId) return;
			localOutgoingVideoCallIdsRef.current.delete(callId);
			stopVideoCallRing(callId);
			stopOutgoingJoinPoll(callId);
			sonnerToast.dismiss(`video-call:${callId}`);
			sonnerToast.dismiss(`video-call-outgoing:${callId}`);
			requestCloseDesktopVideoCall(callId);
			window.dispatchEvent(
				new CustomEvent(VIDEO_CALL_ENDED_BROWSER_EVENT, {
					detail: { callId },
				})
			);
			sonnerToast.message(
				videoCallMissedToastMessage(
					data?.missed_reason,
					data?.status,
					tRef.current
				),
				{
					id: `video-call-ended:${callId}`,
				}
			);
		};

		const onVideoAccepted = (dataUnknown: unknown) => {
			const data = dataUnknown as
				| { call_id?: string; chat_id?: string | null }
				| undefined;
			const callId = data?.call_id?.trim();
			if (!callId) return;
			openMeetAfterOutgoingAccepted(callId);
		};

		const dispatchRelay = (event: string, payload: unknown) => {
			switch (event) {
				case 'gaf_chat.message_new':
					onMessageNew(payload);
					break;
				case 'gaf_chat.chat_created':
					onChatCreated(payload);
					break;
				case 'gaf_chat.message_edited':
					onMessageEdited(payload);
					break;
				case 'gaf_chat.message_deleted':
					onMessageDeleted(payload);
					break;
				case 'gaf_chat.message_read':
					onMessageRead(payload);
					break;
				case 'video_call.incoming':
					onVideoIncoming(payload);
					break;
				case 'video_call.accepted':
					onVideoAccepted(payload);
					break;
				case 'video_call.ended':
					onVideoEnded(payload);
					break;
				default:
					break;
			}
		};

		const refetchChatsAfterRestore = () => {
			const focused = gafChatFocusedChatIdRef.current?.trim();
			void queryClientRef.current.invalidateQueries({
				queryKey: gafChatQueryKeys.chats,
			});
			if (focused) {
				void queryClientRef.current.invalidateQueries({
					queryKey: gafChatQueryKeys.messages(focused),
				});
			}
		};

		const onWindowOnline = () => {
			// Browser came back online — always reconcile chats (no `initial` flag).
			refetchChatsAfterRestore();
		};
		window.addEventListener('online', onWindowOnline);

		const noop = () => {};
		let unsubNew = noop;
		let unsubCreated = noop;
		let unsubEdited = noop;
		let unsubDeleted = noop;
		let unsubRead = noop;
		let unsubVideoIncoming = noop;
		let unsubVideoAccepted = noop;
		let unsubVideoEnded = noop;
		let unsubConnectionRestored = noop;

		if (isDesktopRealtimeLeader && socketOk && socket) {
			unsubNew = socket.addEventListener('gaf_chat.message_new', (raw) => {
				postRelay('gaf_chat.message_new', raw);
				onMessageNew(raw);
			});
			unsubCreated = socket.addEventListener('gaf_chat.chat_created', (raw) => {
				postRelay('gaf_chat.chat_created', raw);
				onChatCreated(raw);
			});
			unsubEdited = socket.addEventListener(
				'gaf_chat.message_edited',
				(raw) => {
					postRelay('gaf_chat.message_edited', raw);
					onMessageEdited(raw);
				}
			);
			unsubDeleted = socket.addEventListener(
				'gaf_chat.message_deleted',
				(raw) => {
					postRelay('gaf_chat.message_deleted', raw);
					onMessageDeleted(raw);
				}
			);
			unsubRead = socket.addEventListener('gaf_chat.message_read', (raw) => {
				postRelay('gaf_chat.message_read', raw);
				onMessageRead(raw);
			});
			unsubVideoIncoming = socket.addEventListener(
				'video_call.incoming',
				(raw) => {
					postRelay('video_call.incoming', raw);
					onVideoIncoming(raw);
				}
			);
			unsubVideoAccepted = socket.addEventListener(
				'video_call.accepted',
				(raw) => {
					postRelay('video_call.accepted', raw);
					onVideoAccepted(raw);
				}
			);
			unsubVideoEnded = socket.addEventListener('video_call.ended', (raw) => {
				postRelay('video_call.ended', raw);
				onVideoEnded(raw);
			});
			unsubConnectionRestored = socket.addEventListener(
				'connection-restored',
				(payload) => {
					// First connect emits `{ initial: true }` — shell-bootstrap already seeded
					// chats; invalidating here forced a duplicate GET /gaf-chat/chats.
					if (!shouldRefetchGafChatsOnConnectionRestored(payload)) {
						return;
					}
					refetchChatsAfterRestore();
				}
			);
		}

		let onRelayMessage: ((event: MessageEvent) => void) | null = null;
		const relayCh = relayBcRef.current;
		if (!isDesktopRealtimeLeader && relayCh) {
			onRelayMessage = (event: MessageEvent) => {
				const data = event.data as DesktopRealtimeRelayPayload | undefined;
				if (data?.type !== 'socket-relay') return;
				dispatchRelay(data.event, data.payload);
			};
			relayCh.addEventListener('message', onRelayMessage);
		}

		return () => {
			if (debounceTimer != null) {
				window.clearTimeout(debounceTimer);
				debounceTimer = null;
			}
			pendingMessageChatIds.clear();
			unsubNew();
			unsubCreated();
			unsubEdited();
			unsubDeleted();
			unsubRead();
			unsubVideoIncoming();
			unsubVideoAccepted();
			unsubVideoEnded();
			unsubConnectionRestored();
			window.removeEventListener('online', onWindowOnline);
			if (relayCh && onRelayMessage) {
				relayCh.removeEventListener('message', onRelayMessage);
			}
		};
	}, [
		isDesktopRealtimeLeader,
		openMeetAfterOutgoingAccepted,
		pushIncomingMessageNotification,
		runtimeController,
		startVideoCallRing,
		stopOutgoingJoinPoll,
		stopVideoCallRing,
		userId,
	]);

	const value = useMemo<GAFChatContextValue>(
		() => ({
			isDesktopRealtimeLeader,
		}),
		[isDesktopRealtimeLeader]
	);

	return (
		<GAFChatContext.Provider value={value}>{children}</GAFChatContext.Provider>
	);
}
