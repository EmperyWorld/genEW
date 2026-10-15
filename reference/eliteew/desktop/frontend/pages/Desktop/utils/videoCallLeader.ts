/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Leader election for Jitsi VideoCall iframe: one tab/window per user+callId loads Meet;
 * duplicates show a passive state instead of joining again (avoids 16× «я» in room).
 *
 * Invariants:
 * - Lock name scoped per user id + call id.
 * - Visible tab may request leadership from a hidden leader (same pattern as desktop realtime).
 *
 * Related:
 * - VideoCallApp.tsx, desktopRealtimeLeader.ts
 */

const LOCK_PREFIX = 'eliteew-video-call:';

export type VideoCallLeadershipCallbacks = {
	onAcquire: () => void;
	onRelease: () => void;
};

type LeadershipController = {
	dispose: () => void;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

export function acquireVideoCallLeadership(
	userId: string,
	callId: string,
	callbacks: VideoCallLeadershipCallbacks
): LeadershipController {
	let disposed = false;
	let releaseWaiter: (() => void) | null = null;
	const lockName = `${LOCK_PREFIX}${userId.trim()}:${callId.trim()}`;

	const yieldLeadership = () => {
		releaseWaiter?.();
		releaseWaiter = null;
	};

	const runWithWebLock = async () => {
		while (!disposed) {
			try {
				await navigator.locks.request(lockName, async () => {
					if (disposed) {
						return;
					}
					callbacks.onAcquire();
					await new Promise<void>((resolve) => {
						releaseWaiter = resolve;
					});
					if (!disposed) {
						callbacks.onRelease();
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

	const runFallbackHeartbeat = async () => {
		const tabId =
			typeof crypto !== 'undefined' && 'randomUUID' in crypto
				? crypto.randomUUID()
				: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const storageKey = `${lockName}:heartbeat`;
		let holding = false;

		while (!disposed) {
			const now = Date.now();
			let leaderTabId: string | null = null;
			let leaderTs = 0;
			try {
				const raw = localStorage.getItem(storageKey);
				if (raw) {
					const parsed = JSON.parse(raw) as {
						tabId?: string;
						ts?: number;
					};
					leaderTabId = parsed.tabId ?? null;
					leaderTs = typeof parsed.ts === 'number' ? parsed.ts : 0;
				}
			} catch {
				leaderTabId = null;
				leaderTs = 0;
			}

			const stale = now - leaderTs > 6000;
			const weAreLeader = leaderTabId === tabId || stale || !leaderTabId;

			if (weAreLeader && !holding) {
				holding = true;
				callbacks.onAcquire();
			} else if (!weAreLeader && holding) {
				holding = false;
				callbacks.onRelease();
			}

			if (holding) {
				try {
					localStorage.setItem(storageKey, JSON.stringify({ tabId, ts: now }));
				} catch {
					/* private mode / quota */
				}
			}

			await sleep(2000);
		}

		if (holding) {
			callbacks.onRelease();
		}
	};

	const runLoop = async () => {
		if (
			typeof navigator !== 'undefined' &&
			typeof navigator.locks?.request === 'function'
		) {
			await runWithWebLock();
			return;
		}
		await runFallbackHeartbeat();
	};

	void runLoop();

	return {
		dispose: () => {
			disposed = true;
			yieldLeadership();
		},
	};
}
