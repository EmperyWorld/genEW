/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Tab-scoped playback position for NowPlaying transport — not written to shell_state.
 *
 * Invariants:
 * - Position is keyed by track id; cleared when transport track is cleared.
 * - Survives in-tab refresh (sessionStorage); not synced cross-device (shell holds track + volume only).
 *
 * Related:
 * - src/pages/Desktop/context/NowPlayingContext.tsx
 * - documentation/product/desktop/DESKTOP-MUSIC-PLAYER.md
 */

const STORAGE_KEY = 'eliteew-nowplaying-position';

export interface NowPlayingPositionSnapshot {
	trackId: string;
	currentTime: number;
	updatedAt: number;
}

function readRawSnapshot(): NowPlayingPositionSnapshot | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const data = JSON.parse(raw) as NowPlayingPositionSnapshot;
		if (
			!data ||
			typeof data.trackId !== 'string' ||
			!data.trackId ||
			typeof data.currentTime !== 'number' ||
			Number.isNaN(data.currentTime)
		) {
			return null;
		}
		return {
			trackId: data.trackId,
			currentTime: Math.max(0, data.currentTime),
			updatedAt:
				typeof data.updatedAt === 'number' && !Number.isNaN(data.updatedAt)
					? data.updatedAt
					: Date.now(),
		};
	} catch {
		return null;
	}
}

/** Read saved position for a track within the current browser tab session. */
export function readNowPlayingPositionSession(trackId: string): number | null {
	if (!trackId.trim()) return null;
	const snap = readRawSnapshot();
	if (!snap || snap.trackId !== trackId) return null;
	return snap.currentTime;
}

/** Persist playback position for resume within the same tab session. */
export function writeNowPlayingPositionSession(
	trackId: string,
	currentTime: number
): void {
	if (typeof sessionStorage === 'undefined') return;
	if (!trackId.trim()) return;
	if (!Number.isFinite(currentTime) || currentTime <= 0) return;
	const safeTime = Math.max(0, currentTime);
	try {
		const payload: NowPlayingPositionSnapshot = {
			trackId: trackId.trim(),
			currentTime: safeTime,
			updatedAt: Date.now(),
		};
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch {
		/* quota / private mode */
	}
}

/** Remove tab-scoped position when transport clears or track changes away. */
export function clearNowPlayingPositionSession(): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		/* ignore */
	}
}
