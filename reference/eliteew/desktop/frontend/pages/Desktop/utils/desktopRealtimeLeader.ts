/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Leader-tab election for browser SPA: sync detect, handoff confirmation, Web Lock socket mutex.
 *
 * Invariants:
 * - Embedded WebView clients skip this module (see `eliteewEmbeddedClient.ts`).
 * - Handoff with live socket requires explicit accept on the current leader tab (60s).
 * - Tab visibility return re-requests leadership via shared visibility sync.
 *
 * Related:
 * - utils/subscribeDocumentVisibleSync.ts
 * - `contexts/BrowserTabLeaderProvider.tsx`, `components/BrowserTabHandoffDialog.tsx`
 */

import {
	invalidateDesktopShellStateRamCache,
	SHELL_STATE_INVALIDATED_BC,
} from '@/pages/Desktop/services/desktopApi';
import { getOrCreateBrowserTabSessionId } from '@/utils/browserTabSessionId';
import { subscribeDocumentVisibleSync } from './subscribeDocumentVisibleSync';

const LOCK_PREFIX = 'eliteew-desktop-realtime:';

/** BroadcastChannel for leadership, handoff, and socket relay. */
export const DESKTOP_REALTIME_BC = 'eliteew-desktop-realtime-v1';

export { SHELL_STATE_INVALIDATED_BC } from '@/pages/Desktop/services/desktopApi';

export function handleDesktopShellStateInvalidatedForFollower(
	messageType: string,
	role: BrowserTabLeadershipRole
): void {
	if (messageType !== SHELL_STATE_INVALIDATED_BC || role !== 'follower') {
		return;
	}
	invalidateDesktopShellStateRamCache();
}

const HEARTBEAT_MS = 1000;
export const LEADER_STALE_MS = 3500;
const LEADER_PROBE_MS = 450;
const HANDOFF_TIMEOUT_MS = 60_000;

export type BrowserTabLeadershipRole = 'leader' | 'follower';

export type HandoffRequestPayload = {
	requestId: string;
	fromTabId: string;
};

export type BrowserTabLeadershipCallbacks = {
	onRoleChange: (role: BrowserTabLeadershipRole) => void;
	onAcquire?: () => void;
	onRelease?: () => void;
	onHandoffRequest?: (payload: HandoffRequestPayload) => void;
	onHandoffWaiting?: (waiting: boolean) => void;
	/** Leader tab: is Socket.IO connected right now (for handoff probe). */
	getSocketConnected?: () => boolean;
};

export type DesktopRealtimeLeadershipCallbacks = {
	onAcquire: () => void;
	onRelease: () => void;
};

export type LeadershipController = {
	dispose: () => void;
	yieldLeadership: () => void;
	forceTakeLeadership: () => void;
	requestLeadershipHandoff: () => Promise<'granted' | 'denied' | 'immediate'>;
	respondToHandoff: (requestId: string, accepted: boolean) => void;
};

export type HandoffResult = 'granted' | 'denied' | 'immediate';

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function heartbeatStorageKey(userId: string): string {
	return `${LOCK_PREFIX}heartbeat:${userId.trim()}`;
}

function handoffRequestStorageKey(userId: string): string {
	return `${LOCK_PREFIX}handoff-req:${userId.trim()}`;
}

function handoffResponseStorageKey(userId: string): string {
	return `${LOCK_PREFIX}handoff-res:${userId.trim()}`;
}

function readLeaderHeartbeat(storageKey: string): {
	tabId: string | null;
	ts: number;
	socketConnected: boolean;
} {
	try {
		const raw = localStorage.getItem(storageKey);
		if (!raw) {
			return { tabId: null, ts: 0, socketConnected: false };
		}
		const parsed = JSON.parse(raw) as {
			tabId?: string;
			ts?: number;
			socketConnected?: boolean;
		};
		return {
			tabId: parsed.tabId ?? null,
			ts: typeof parsed.ts === 'number' ? parsed.ts : 0,
			socketConnected: parsed.socketConnected === true,
		};
	} catch {
		return { tabId: null, ts: 0, socketConnected: false };
	}
}

function writeLeaderHeartbeat(
	storageKey: string,
	tabId: string,
	socketConnected: boolean
): void {
	try {
		localStorage.setItem(
			storageKey,
			JSON.stringify({ tabId, ts: Date.now(), socketConnected })
		);
	} catch {
		/* quota / private mode */
	}
}

/** Synchronous role detect before React mount — avoids pending + API leak. */
export function detectSyncBrowserTabRole(
	userId: string
): BrowserTabLeadershipRole {
	if (typeof window === 'undefined') {
		return 'leader';
	}
	const tabId = getOrCreateBrowserTabSessionId();
	const storageKey = heartbeatStorageKey(userId);
	const { tabId: leaderTabId, ts } = readLeaderHeartbeat(storageKey);
	const stale = Date.now() - ts > LEADER_STALE_MS;
	if (leaderTabId === tabId) {
		return 'leader';
	}
	if (!leaderTabId || stale) {
		return 'leader';
	}
	return 'follower';
}

/**
 * Non-blocking leader election: heartbeat for UI role, Web Lock for socket mutex.
 */
export function subscribeBrowserTabLeadership(
	userId: string,
	callbacks: BrowserTabLeadershipCallbacks
): LeadershipController {
	let disposed = false;
	let role: BrowserTabLeadershipRole = detectSyncBrowserTabRole(userId);
	let releaseWaiter: (() => void) | null = null;
	let lockHeld = false;
	const tabId = getOrCreateBrowserTabSessionId();
	const lockName = `${LOCK_PREFIX}${userId.trim()}`;
	const storageKey = heartbeatStorageKey(userId);

	if (role === 'leader') {
		writeLeaderHeartbeat(storageKey, tabId, false);
	}

	callbacks.onRoleChange(role);

	const setRole = (next: BrowserTabLeadershipRole) => {
		if (role === next) {
			return;
		}
		role = next;
		callbacks.onRoleChange(next);
	};

	const yieldLeadership = () => {
		releaseWaiter?.();
		releaseWaiter = null;
		try {
			const { tabId: leaderTabId } = readLeaderHeartbeat(storageKey);
			if (leaderTabId === tabId) {
				localStorage.removeItem(storageKey);
			}
		} catch {
			/* ignore */
		}
		if (role === 'leader') {
			setRole('follower');
		}
	};

	let bc: BroadcastChannel | null = null;
	const pendingHandoffWaiters = new Map<
		string,
		(result: HandoffResult) => void
	>();

	const postBc = (payload: Record<string, unknown>) => {
		try {
			bc?.postMessage(payload);
		} catch {
			/* ignore */
		}
	};

	const publishHandoffRequest = (requestId: string, fromTabId: string) => {
		const payload = { requestId, fromTabId, ts: Date.now() };
		postBc({ type: 'handoff-request', ...payload });
		try {
			localStorage.setItem(
				handoffRequestStorageKey(userId),
				JSON.stringify(payload)
			);
		} catch {
			/* quota / private mode */
		}
	};

	const publishHandoffResponse = (
		requestId: string,
		accepted: boolean,
		fromTabId: string
	) => {
		const payload = { requestId, accepted, fromTabId, ts: Date.now() };
		postBc({ type: 'handoff-response', ...payload });
		try {
			localStorage.setItem(
				handoffResponseStorageKey(userId),
				JSON.stringify(payload)
			);
		} catch {
			/* quota / private mode */
		}
	};

	const handleHandoffRequestMessage = (
		requestId: string,
		fromTabId: string
	) => {
		if (!requestId || !fromTabId || fromTabId === tabId) {
			return;
		}
		callbacks.onHandoffRequest?.({ requestId, fromTabId });
	};

	const handleHandoffResponseMessage = (
		requestId: string,
		accepted: boolean
	) => {
		const waiter = pendingHandoffWaiters.get(requestId);
		if (!waiter) {
			return;
		}
		pendingHandoffWaiters.delete(requestId);
		callbacks.onHandoffWaiting?.(false);
		if (accepted) {
			forceTakeLeadership();
			waiter('granted');
		} else {
			waiter('denied');
		}
	};

	const onStorage = (event: StorageEvent) => {
		if (!event.newValue) {
			return;
		}
		if (event.key === handoffRequestStorageKey(userId) && role === 'leader') {
			try {
				const parsed = JSON.parse(event.newValue) as {
					requestId?: string;
					fromTabId?: string;
				};
				handleHandoffRequestMessage(
					String(parsed.requestId ?? ''),
					String(parsed.fromTabId ?? '')
				);
			} catch {
				/* ignore */
			}
			return;
		}
		if (event.key === handoffResponseStorageKey(userId)) {
			try {
				const parsed = JSON.parse(event.newValue) as {
					requestId?: string;
					accepted?: boolean;
				};
				handleHandoffResponseMessage(
					String(parsed.requestId ?? ''),
					parsed.accepted === true
				);
			} catch {
				/* ignore */
			}
		}
	};

	if (typeof window !== 'undefined') {
		window.addEventListener('storage', onStorage);
	}

	if (role === 'leader') {
		try {
			const raw = localStorage.getItem(handoffRequestStorageKey(userId));
			if (raw) {
				const parsed = JSON.parse(raw) as {
					requestId?: string;
					fromTabId?: string;
					ts?: number;
				};
				const age =
					typeof parsed.ts === 'number'
						? Date.now() - parsed.ts
						: HANDOFF_TIMEOUT_MS;
				if (age < HANDOFF_TIMEOUT_MS) {
					handleHandoffRequestMessage(
						String(parsed.requestId ?? ''),
						String(parsed.fromTabId ?? '')
					);
				}
			}
		} catch {
			/* ignore */
		}
	}

	try {
		if (typeof BroadcastChannel !== 'undefined') {
			bc = new BroadcastChannel(DESKTOP_REALTIME_BC);
			bc.onmessage = (event: MessageEvent) => {
				const data = event.data as Record<string, unknown> | undefined;
				if (!data?.type) {
					return;
				}
				const type = String(data.type);

				if (type === 'leader-probe') {
					if (role !== 'leader') {
						return;
					}
					postBc({
						type: 'leader-probe-reply',
						probeId: data.probeId,
						fromTabId: tabId,
						socketConnected: callbacks.getSocketConnected?.() === true,
					});
					return;
				}

				if (type === 'leader-probe-reply') {
					return;
				}

				if (type === 'handoff-request' && role === 'leader') {
					handleHandoffRequestMessage(
						String(data.requestId ?? ''),
						String(data.fromTabId ?? '')
					);
					return;
				}

				if (type === 'handoff-response') {
					handleHandoffResponseMessage(
						String(data.requestId ?? ''),
						data.accepted === true
					);
				}

				if (type === 'leader-alive' && data.tabId && data.tabId !== tabId) {
					setRole('follower');
					return;
				}

				handleDesktopShellStateInvalidatedForFollower(type, role);
			};
		}
	} catch {
		bc = null;
	}

	const onVisibleSync = () => {
		postBc({ type: 'request-leadership', tabId });
	};

	let unsubVisibleSync: (() => void) | undefined;
	if (typeof document !== 'undefined') {
		unsubVisibleSync = subscribeDocumentVisibleSync(onVisibleSync);
	}

	const forceTakeLeadership = () => {
		writeLeaderHeartbeat(
			storageKey,
			tabId,
			callbacks.getSocketConnected?.() === true
		);
		postBc({
			type: 'leader-alive',
			tabId,
			ts: Date.now(),
			socketConnected: callbacks.getSocketConnected?.() === true,
		});
		setRole('leader');
	};

	const respondToHandoff = (requestId: string, accepted: boolean) => {
		if (accepted) {
			yieldLeadership();
		}
		publishHandoffResponse(requestId, accepted, tabId);
	};

	const beginHandoffRequest = (
		finish: (result: HandoffResult) => void
	): string => {
		const requestId =
			typeof crypto !== 'undefined' && 'randomUUID' in crypto
				? crypto.randomUUID()
				: `handoff-${Date.now()}`;
		callbacks.onHandoffWaiting?.(true);
		pendingHandoffWaiters.set(requestId, finish);
		publishHandoffRequest(requestId, tabId);
		window.setTimeout(() => {
			if (!pendingHandoffWaiters.has(requestId)) {
				return;
			}
			pendingHandoffWaiters.delete(requestId);
			finish('denied');
		}, HANDOFF_TIMEOUT_MS);
		return requestId;
	};

	const requestLeadershipHandoff = (): Promise<HandoffResult> => {
		return new Promise((resolve) => {
			if (disposed) {
				resolve('denied');
				return;
			}

			const probeId =
				typeof crypto !== 'undefined' && 'randomUUID' in crypto
					? crypto.randomUUID()
					: `probe-${Date.now()}`;

			let settled = false;
			let probeReply: { socketConnected: boolean } | null = null;

			const finish = (result: HandoffResult) => {
				if (settled) {
					return;
				}
				settled = true;
				window.clearTimeout(probeTimer);
				callbacks.onHandoffWaiting?.(false);
				bc?.removeEventListener('message', onProbeMessage);
				resolve(result);
			};

			const onProbeMessage = (event: MessageEvent) => {
				const data = event.data as Record<string, unknown> | undefined;
				if (data?.type !== 'leader-probe-reply') {
					return;
				}
				if (String(data.probeId ?? '') !== probeId) {
					return;
				}
				probeReply = {
					socketConnected: data.socketConnected === true,
				};
			};

			bc?.addEventListener('message', onProbeMessage);
			postBc({ type: 'leader-probe', probeId, fromTabId: tabId });

			const probeTimer = window.setTimeout(() => {
				bc?.removeEventListener('message', onProbeMessage);
				const { tabId: leaderTabId, ts: leaderTs } =
					readLeaderHeartbeat(storageKey);
				const leaderAlive =
					Boolean(probeReply) ||
					(Boolean(leaderTabId) &&
						leaderTabId !== tabId &&
						Date.now() - leaderTs <= LEADER_STALE_MS);

				if (leaderAlive) {
					beginHandoffRequest((result) => {
						if (result === 'denied') {
							callbacks.onHandoffWaiting?.(false);
						}
						finish(result);
					});
					return;
				}
				forceTakeLeadership();
				finish('immediate');
			}, LEADER_PROBE_MS);
		});
	};

	const runHeartbeat = async () => {
		while (!disposed) {
			const now = Date.now();
			const { tabId: leaderTabId, ts: leaderTs } =
				readLeaderHeartbeat(storageKey);
			const stale = now - leaderTs > LEADER_STALE_MS;
			const weAreLeader = leaderTabId === tabId || stale || leaderTabId == null;

			if (weAreLeader) {
				writeLeaderHeartbeat(
					storageKey,
					tabId,
					callbacks.getSocketConnected?.() === true
				);
				postBc({
					type: 'leader-alive',
					tabId,
					ts: now,
					socketConnected: callbacks.getSocketConnected?.() === true,
				});
				setRole('leader');
			} else {
				setRole('follower');
			}

			await sleep(HEARTBEAT_MS);
		}
	};

	const runWithWebLock = async () => {
		while (!disposed) {
			if (role !== 'leader') {
				if (lockHeld) {
					yieldLeadership();
				}
				await sleep(400);
				continue;
			}
			try {
				await navigator.locks.request(lockName, async () => {
					if (disposed || role !== 'leader') {
						return;
					}
					lockHeld = true;
					callbacks.onAcquire?.();
					await new Promise<void>((resolve) => {
						releaseWaiter = resolve;
					});
					lockHeld = false;
					if (!disposed) {
						callbacks.onRelease?.();
					}
				});
			} catch {
				await sleep(2000);
			}
			if (!disposed) {
				await sleep(400);
			}
		}
	};

	const runFallbackSocketMutex = async () => {
		let socketLeader = false;
		while (!disposed) {
			if (role === 'leader' && !socketLeader) {
				socketLeader = true;
				callbacks.onAcquire?.();
			} else if (role !== 'leader' && socketLeader) {
				socketLeader = false;
				callbacks.onRelease?.();
			}
			await sleep(HEARTBEAT_MS);
		}
		if (socketLeader) {
			callbacks.onRelease?.();
		}
	};

	const runSocketMutex = async () => {
		if (
			typeof navigator !== 'undefined' &&
			typeof navigator.locks?.request === 'function'
		) {
			await runWithWebLock();
			return;
		}
		await runFallbackSocketMutex();
	};

	void runHeartbeat();
	void runSocketMutex();

	return {
		dispose: () => {
			disposed = true;
			if (typeof window !== 'undefined') {
				window.removeEventListener('storage', onStorage);
			}
			if (typeof document !== 'undefined') {
				unsubVisibleSync?.();
			}
			yieldLeadership();
			for (const waiter of pendingHandoffWaiters.values()) {
				waiter('denied');
			}
			pendingHandoffWaiters.clear();
			try {
				bc?.close();
			} catch {
				/* ignore */
			}
			bc = null;
		},
		yieldLeadership,
		forceTakeLeadership,
		requestLeadershipHandoff,
		respondToHandoff,
	};
}

export function acquireDesktopRealtimeLeadership(
	userId: string,
	callbacks: DesktopRealtimeLeadershipCallbacks
): LeadershipController {
	let acquired = false;
	return subscribeBrowserTabLeadership(userId, {
		onRoleChange: (nextRole) => {
			if (nextRole === 'leader' && !acquired) {
				acquired = true;
				callbacks.onAcquire();
			} else if (nextRole === 'follower' && acquired) {
				acquired = false;
				callbacks.onRelease();
			}
		},
		onAcquire: callbacks.onAcquire,
		onRelease: callbacks.onRelease,
	});
}

export { HANDOFF_TIMEOUT_MS };
