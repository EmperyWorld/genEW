/**
 * In-memory GAF chat notification sound preference (mirrors shell_state.gaf_chat_sound_enabled).
 * Used by GAFChatProvider beeps and GAFChatApp UI; reset on shell cache clear / logout.
 */

export const GAF_CHAT_SOUND_ANON_STORAGE_KEY =
	'gaf_chat_sound_enabled::anonymous';

export const GAF_CHAT_SOUND_SHELL_EVENT = 'eliteew-gaf-chat-sound-shell';

let cached: boolean | undefined;

export function resetGafChatSoundShellCache(): void {
	cached = undefined;
}

export function setGafChatSoundEnabledCached(value: boolean): void {
	cached = value;
	if (typeof window === 'undefined') return;
	try {
		window.dispatchEvent(
			new CustomEvent<boolean>(GAF_CHAT_SOUND_SHELL_EVENT, { detail: value })
		);
	} catch {
		/* ignore */
	}
}

export function getGafChatSoundEnabledForBeep(): boolean {
	if (cached === undefined) return true;
	return cached;
}
