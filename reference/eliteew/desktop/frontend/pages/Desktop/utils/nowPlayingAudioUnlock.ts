/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Capture browser user activation for the global now-playing `<audio>` before async blob fetch.
 *
 * Invariants:
 * - Runs only while `navigator.userActivation.isActive` (sync click stack).
 * - Uses muted play/pause; does not leave audible output or a loaded track.
 *
 * Related:
 * - src/pages/Desktop/context/NowPlayingContext.tsx
 * - src/pages/Desktop/utils/notificationSound.ts
 */

function hasActiveUserActivation(): boolean {
	if (typeof navigator === 'undefined') return false;
	const activation = (
		navigator as Navigator & {
			userActivation?: { isActive?: boolean };
		}
	).userActivation;
	return activation?.isActive === true;
}

/**
 * Unlock programmatic playback on the shared now-playing element while the click gesture is active.
 * Without this, `audio.play()` after network/IDB fetch often hits NotAllowedError (autoplay policy).
 */
export function captureNowPlayingUserActivation(audio: HTMLAudioElement): void {
	if (!hasActiveUserActivation()) return;
	const previousMuted = audio.muted;
	audio.muted = true;
	const playPromise = audio.play();
	if (!playPromise) {
		audio.muted = previousMuted;
		return;
	}
	playPromise
		.then(() => {
			audio.pause();
			audio.muted = previousMuted;
		})
		.catch(() => {
			audio.muted = previousMuted;
		});
}
