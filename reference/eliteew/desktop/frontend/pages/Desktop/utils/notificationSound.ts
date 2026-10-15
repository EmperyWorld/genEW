/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T <keysray70@gmail.com>
 * ---
 *
 * Purpose:
 * Desktop notification chimes via Web Audio; respects DND and per-source themes.
 *
 * Invariants:
 * - Playback only when AudioContext is running (unlocked after user gesture).
 * - Shared AudioContext is not closed after each chime.
 *
 * Related:
 * - `notifications/api.ts`, `NotificationHubQuickSettings.tsx`
 */

import {
	type NotificationSourceKey,
	normalizeNotificationSource,
} from '@/notifications/sourceMeta';

export type DesktopNotificationSoundTheme =
	| 'chime'
	| 'soft'
	| 'digital'
	| 'warm'
	| 'pulse'
	| 'spark';

export const DESKTOP_NOTIFICATION_SOUND_THEMES: readonly DesktopNotificationSoundTheme[] =
	['chime', 'soft', 'digital', 'warm', 'pulse', 'spark'];

export function normalizeDesktopSoundTheme(
	raw: string | undefined | null
): DesktopNotificationSoundTheme {
	if (!raw || typeof raw !== 'string') return 'chime';
	const t = raw.trim().toLowerCase();
	return DESKTOP_NOTIFICATION_SOUND_THEMES.includes(
		t as DesktopNotificationSoundTheme
	)
		? (t as DesktopNotificationSoundTheme)
		: 'chime';
}

export interface DesktopNotificationSettings {
	soundEnabled: boolean;
	doNotDisturb: boolean;
	soundTheme: DesktopNotificationSoundTheme;
	soundThemeBySource: Record<
		NotificationSourceKey,
		DesktopNotificationSoundTheme
	>;
	soundEnabledBySource: Record<NotificationSourceKey, boolean>;
}

const DEFAULT_SETTINGS: DesktopNotificationSettings = {
	soundEnabled: true,
	doNotDisturb: false,
	soundTheme: 'chime',
	soundThemeBySource: {
		default: 'chime',
		gaf_chat: 'pulse',
		ugs: 'digital',
		doc_editor: 'warm',
		friends: 'soft',
		business_intelligence: 'spark',
		server: 'chime',
	},
	soundEnabledBySource: {
		default: true,
		gaf_chat: true,
		ugs: true,
		doc_editor: true,
		friends: true,
		business_intelligence: true,
		server: true,
	},
};

let currentSettings: DesktopNotificationSettings = { ...DEFAULT_SETTINGS };
let lastPlayAt = 0;
const MIN_INTERVAL_MS = 250;

let sharedAudioContext: AudioContext | null = null;
let audioUnlockListenerInstalled = false;

function hasAudioUserGesture(): boolean {
	if (typeof navigator === 'undefined') return false;
	const activation = (
		navigator as Navigator & {
			userActivation?: { hasBeenActive?: boolean; isActive?: boolean };
		}
	).userActivation;
	return activation?.hasBeenActive === true || activation?.isActive === true;
}

function getAudioContextClass(): typeof AudioContext | null {
	if (typeof window === 'undefined') return null;
	const audioWindow = window as typeof window & {
		webkitAudioContext?: typeof AudioContext;
		AudioContext?: typeof AudioContext;
	};
	return audioWindow.webkitAudioContext ?? audioWindow.AudioContext ?? null;
}

function getOrCreateSharedAudioContext(): AudioContext | null {
	const AudioCtx = getAudioContextClass();
	if (!AudioCtx) return null;
	if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
		try {
			sharedAudioContext = new AudioCtx();
		} catch {
			return null;
		}
	}
	return sharedAudioContext;
}

/** Resume shared AudioContext after a user gesture (Chrome autoplay policy). */
export function unlockNotificationAudio(): void {
	const ctx = getOrCreateSharedAudioContext();
	if (!ctx || ctx.state === 'running') return;
	void ctx.resume().catch(() => {
		/* still suspended until gesture */
	});
}

function installNotificationAudioUnlockListener(): void {
	if (typeof window === 'undefined' || audioUnlockListenerInstalled) return;
	audioUnlockListenerInstalled = true;
	const onGesture = (): void => {
		unlockNotificationAudio();
		if (getOrCreateSharedAudioContext()?.state === 'running') {
			window.removeEventListener('pointerdown', onGesture, true);
			window.removeEventListener('keydown', onGesture, true);
		}
	};
	window.addEventListener('pointerdown', onGesture, {
		capture: true,
		passive: true,
	});
	window.addEventListener('keydown', onGesture, {
		capture: true,
		passive: true,
	});
}

installNotificationAudioUnlockListener();

async function ensureNotificationAudioRunning(): Promise<AudioContext | null> {
	if (!sharedAudioContext && !hasAudioUserGesture()) return null;
	const ctx = getOrCreateSharedAudioContext();
	if (!ctx) return null;
	if (ctx.state === 'suspended') {
		if (!hasAudioUserGesture()) return null;
		try {
			await ctx.resume();
		} catch {
			return null;
		}
	}
	if (ctx.state !== 'running') return null;
	return ctx;
}

export function getDesktopNotificationSettings(): DesktopNotificationSettings {
	return currentSettings;
}

export function updateDesktopNotificationSettings(
	partial: Partial<DesktopNotificationSettings>
): DesktopNotificationSettings {
	currentSettings = {
		...currentSettings,
		...partial,
		soundThemeBySource: {
			...currentSettings.soundThemeBySource,
			...(partial.soundThemeBySource ?? {}),
		},
		soundEnabledBySource: {
			...currentSettings.soundEnabledBySource,
			...(partial.soundEnabledBySource ?? {}),
		},
	};
	return currentSettings;
}

export function normalizeDesktopSourceThemes(
	raw: Record<string, string> | null | undefined
): Record<NotificationSourceKey, DesktopNotificationSoundTheme> {
	const base = { ...DEFAULT_SETTINGS.soundThemeBySource };
	if (!raw || typeof raw !== 'object') return base;
	for (const [key, value] of Object.entries(raw)) {
		base[normalizeNotificationSource(key)] = normalizeDesktopSoundTheme(value);
	}
	return base;
}

export function normalizeDesktopSourceEnabled(
	raw: Record<string, boolean> | null | undefined
): Record<NotificationSourceKey, boolean> {
	const base = { ...DEFAULT_SETTINGS.soundEnabledBySource };
	if (!raw || typeof raw !== 'object') return base;
	for (const [key, value] of Object.entries(raw)) {
		base[normalizeNotificationSource(key)] = value !== false;
	}
	return base;
}

export function getDesktopSoundThemeForSource(
	source: string | null | undefined
): DesktopNotificationSoundTheme {
	const normalized = normalizeNotificationSource(source);
	return (
		currentSettings.soundThemeBySource[normalized] ??
		currentSettings.soundThemeBySource.default ??
		currentSettings.soundTheme
	);
}

export function isDesktopSourceSoundEnabled(
	source: string | null | undefined
): boolean {
	const normalized = normalizeNotificationSource(source);
	return currentSettings.soundEnabledBySource[normalized] !== false;
}

export function shouldPlayNotificationSound(): boolean {
	return currentSettings.soundEnabled && !currentSettings.doNotDisturb;
}

function playNotificationSoundCore(theme: DesktopNotificationSoundTheme): void {
	if (typeof window === 'undefined') return;

	void ensureNotificationAudioRunning().then((ctx) => {
		if (!ctx) return;

		try {
			const now = ctx.currentTime;

			/** Три коротких импульса (без общего osc). */
			if (theme === 'pulse') {
				const playTone = (t0: number, freq: number) => {
					const o = ctx.createOscillator();
					const g = ctx.createGain();
					o.connect(g);
					g.connect(ctx.destination);
					o.type = 'sine';
					o.frequency.setValueAtTime(freq, t0);
					g.gain.setValueAtTime(0.08, t0);
					g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
					o.start(t0);
					o.stop(t0 + 0.1);
				};
				playTone(now, 659.25);
				playTone(now + 0.11, 783.99);
				playTone(now + 0.22, 987.77);
				return;
			}

			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.connect(gain);
			gain.connect(ctx.destination);

			if (theme === 'soft') {
				osc.type = 'sine';
				osc.frequency.setValueAtTime(880, now);
				osc.frequency.linearRampToValueAtTime(988, now + 0.12);
				gain.gain.setValueAtTime(0.08, now);
				gain.gain.exponentialRampToValueAtTime(0.005, now + 0.4);
				osc.start(now);
				osc.stop(now + 0.4);
			} else if (theme === 'digital') {
				osc.type = 'triangle';
				osc.frequency.setValueAtTime(1320, now);
				osc.frequency.setValueAtTime(1760, now + 0.06);
				osc.frequency.setValueAtTime(1980, now + 0.12);
				gain.gain.setValueAtTime(0.07, now);
				gain.gain.exponentialRampToValueAtTime(0.004, now + 0.35);
				osc.start(now);
				osc.stop(now + 0.35);
			} else if (theme === 'warm') {
				osc.type = 'sine';
				osc.frequency.setValueAtTime(523.25, now);
				osc.frequency.setValueAtTime(659.25, now + 0.16);
				osc.frequency.setValueAtTime(783.99, now + 0.32);
				gain.gain.setValueAtTime(0.09, now);
				gain.gain.exponentialRampToValueAtTime(0.005, now + 0.58);
				osc.start(now);
				osc.stop(now + 0.58);
			} else if (theme === 'spark') {
				osc.type = 'sine';
				osc.frequency.setValueAtTime(2093, now);
				gain.gain.setValueAtTime(0.06, now);
				gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
				osc.start(now);
				osc.stop(now + 0.08);
			} else {
				// chime (default)
				osc.type = 'sine';
				osc.frequency.setValueAtTime(1046.5, now);
				osc.frequency.setValueAtTime(1318.5, now + 0.1);
				osc.frequency.setValueAtTime(1567.98, now + 0.2);
				gain.gain.setValueAtTime(0.1, now);
				gain.gain.exponentialRampToValueAtTime(0.006, now + 0.45);
				osc.start(now);
				osc.stop(now + 0.45);
			}
		} catch {
			// Audio context not available; silently ignore
		}
	});
}

export function playNotificationSound(): void {
	if (!shouldPlayNotificationSound()) return;
	playNotificationSoundCore(currentSettings.soundTheme);
}

/**
 * User-initiated preview in notification settings: bypass Do Not Disturb so the
 * selected theme can be heard (real notifications still respect DND).
 */
export function playNotificationSoundPreview(): void {
	playNotificationSoundCore(currentSettings.soundTheme);
}

export function playNotificationSoundForSource(
	source: string | null | undefined
): void {
	if (!shouldPlayNotificationSound()) return;
	if (!isDesktopSourceSoundEnabled(source)) return;
	playNotificationSoundCore(getDesktopSoundThemeForSource(source));
}

export function playNotificationSoundThrottled(): void {
	if (!shouldPlayNotificationSound()) return;
	const now = Date.now();
	if (now - lastPlayAt < MIN_INTERVAL_MS) return;
	lastPlayAt = now;
	playNotificationSoundCore(currentSettings.soundTheme);
}

export function playNotificationSoundForSourceThrottled(
	source: string | null | undefined
): void {
	if (!shouldPlayNotificationSound()) return;
	if (!isDesktopSourceSoundEnabled(source)) return;
	const now = Date.now();
	if (now - lastPlayAt < MIN_INTERVAL_MS) return;
	lastPlayAt = now;
	playNotificationSoundCore(getDesktopSoundThemeForSource(source));
}
