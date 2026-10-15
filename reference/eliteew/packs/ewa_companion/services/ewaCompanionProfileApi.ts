/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Typed HTTP client for **`/api/v1/ewa/companion-profile`** (per-user companion memory in EWA Postgres), separate
 * from marketing cabinet APIs.
 *
 * Invariants:
 * - Uses `apiClient` + `API_OPTIONS` (same Bearer as the main app).
 * - Exports **`EWA_COMPANION_SERVER_FIRST_V2_PREF_KEY`** / **`readEwaCompanionServerFirstV2Pref`** for **backward compatibility** with previously stored learned preferences only; the toggle is no longer surfaced in UI (server-only mode since 2026-05; see ``documentation/platform/EWA-COMPANION-SERVER-ONLY-MIGRATION.md``). The API ignores this flag for routing.
 * - **`EWA_COMPANION_AGENTIC_AUTONOMY_PREF_KEY`** / **`readEwaCompanionAutoAcceptTasksPref`** — left-rail auto-accept HITL tumbler → ``agentic_autonomy_v1.auto_accept_tasks``.
 * - Optional **`bypassHttpCache`** on GET avoids stale ``companion_revision`` behind caching proxies; **`isHttpConflictError`** detects **409** whether the client throws **`APIError`** or raw **`AxiosError`**.
 * - **`EWA_COMPANION_BUILTIN_QUICK_PRESET_PREFIX`** marks **client-only** quick presets merged into the chat UI (not stored via quick-actions API); use **`isEwaCompanionBuiltinQuickPresetId`** before delete/patch.
 * - User presets persist in EWA Postgres table **`ewa_companion_quick_action_presets`** via **`/ewa/companion-profile/quick-actions`** (per ``principal_id``).
 *
 * Related:
 * - EliteEW/api/ewa_platform/gateways/routers/companion_profile.py
 * - EliteEW/api/ewa_platform/agentic/auto_accept_hitl.py
 * - src/features/ewa/EwaDesktopApp.tsx
 */
import { API_OPTIONS } from '@/pages/MarketingCabinet/marketingCabinetApi/config';
import { APIError, apiClient } from '@/services/api/client';
import { isAxiosError } from 'axios';

export const EWA_COMPANION_PROFILE_PATH = '/ewa/companion-profile' as const;

export const EWA_COMPANION_SERVER_FIRST_V2_PREF_KEY =
	'ewa_companion_server_first_v2' as const;

/** Left-rail agentic autonomy tumbler → ``learned_preferences.agentic_autonomy_v1``. */
export const EWA_COMPANION_AGENTIC_AUTONOMY_PREF_KEY =
	'agentic_autonomy_v1' as const;

/** Contemplation / Right to Silence → ``learned_preferences.companion_presence_v1``. */
export const EWA_COMPANION_PRESENCE_PREF_KEY = 'companion_presence_v1' as const;

/** Soft initiative daily budget / snooze → ``learned_preferences.companion_soft_initiative_v1``. */
export const EWA_COMPANION_SOFT_INITIATIVE_PREF_KEY =
	'companion_soft_initiative_v1' as const;

export type EwaCompanionPresenceMode = 'chat' | 'contemplation';

/** Client-only quick presets (chat UI); IDs must not be sent to quick-actions CRUD. */
export const EWA_COMPANION_BUILTIN_QUICK_PRESET_PREFIX =
	'__ewa_builtin__' as const;

export function isEwaCompanionBuiltinQuickPresetId(id: string): boolean {
	return id.startsWith(EWA_COMPANION_BUILTIN_QUICK_PRESET_PREFIX);
}

/** Reads the optional Server-first v2 toggle from companion ``learned_preferences`` (default false). */
export function readEwaCompanionServerFirstV2Pref(
	learnedPreferences: Record<string, unknown> | null | undefined
): boolean {
	if (!learnedPreferences || typeof learnedPreferences !== 'object')
		return false;
	const raw = learnedPreferences[EWA_COMPANION_SERVER_FIRST_V2_PREF_KEY];
	if (raw === true) return true;
	if (typeof raw === 'string') {
		const s = raw.trim().toLowerCase();
		return s === '1' || s === 'true' || s === 'yes' || s === 'on';
	}
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		const enabled = (raw as { enabled?: unknown }).enabled;
		if (enabled === true) return true;
		if (typeof enabled === 'string') {
			const s = enabled.trim().toLowerCase();
			return s === '1' || s === 'true' || s === 'yes' || s === 'on';
		}
	}
	return false;
}

/** Auto-accept companion HITL confirms in agentic mode (default false). */
export function readEwaCompanionAutoAcceptTasksPref(
	learnedPreferences: Record<string, unknown> | null | undefined
): boolean {
	if (!learnedPreferences || typeof learnedPreferences !== 'object')
		return false;
	const raw = learnedPreferences[EWA_COMPANION_AGENTIC_AUTONOMY_PREF_KEY];
	if (raw === true) return true;
	if (typeof raw === 'string') {
		const s = raw.trim().toLowerCase();
		return s === '1' || s === 'true' || s === 'yes' || s === 'on';
	}
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		const enabled = (raw as { auto_accept_tasks?: unknown }).auto_accept_tasks;
		if (enabled === true) return true;
		if (typeof enabled === 'string') {
			const s = enabled.trim().toLowerCase();
			return s === '1' || s === 'true' || s === 'yes' || s === 'on';
		}
	}
	return false;
}

/** Shallow-merge helper for PATCH learned_preferences with auto-accept tumbler. */
export function mergeEwaCompanionAutoAcceptTasksPref(
	learnedPreferences: Record<string, unknown> | null | undefined,
	autoAcceptTasks: boolean
): Record<string, unknown> {
	const base =
		learnedPreferences && typeof learnedPreferences === 'object'
			? { ...learnedPreferences }
			: {};
	const prev = base[EWA_COMPANION_AGENTIC_AUTONOMY_PREF_KEY];
	const prevObj =
		prev && typeof prev === 'object' && !Array.isArray(prev)
			? { ...(prev as Record<string, unknown>) }
			: {};
	base[EWA_COMPANION_AGENTIC_AUTONOMY_PREF_KEY] = {
		...prevObj,
		auto_accept_tasks: autoAcceptTasks,
	};
	return base;
}

/** Read presence mode from LP (default ``chat``). */
export function readEwaCompanionPresenceMode(
	learnedPreferences: Record<string, unknown> | null | undefined
): EwaCompanionPresenceMode {
	if (!learnedPreferences || typeof learnedPreferences !== 'object') {
		return 'chat';
	}
	const raw = learnedPreferences[EWA_COMPANION_PRESENCE_PREF_KEY];
	if (typeof raw === 'string') {
		const s = raw.trim().toLowerCase();
		return s === 'contemplation' ? 'contemplation' : 'chat';
	}
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		const mode = String((raw as { mode?: unknown }).mode ?? 'chat')
			.trim()
			.toLowerCase();
		return mode === 'contemplation' ? 'contemplation' : 'chat';
	}
	return 'chat';
}

/** Merge contemplation / chat mode into learned_preferences for profile PATCH. */
export function mergeEwaCompanionPresenceModePref(
	learnedPreferences: Record<string, unknown> | null | undefined,
	mode: EwaCompanionPresenceMode
): Record<string, unknown> {
	const base =
		learnedPreferences && typeof learnedPreferences === 'object'
			? { ...learnedPreferences }
			: {};
	const prev = base[EWA_COMPANION_PRESENCE_PREF_KEY];
	const prevObj =
		prev && typeof prev === 'object' && !Array.isArray(prev)
			? { ...(prev as Record<string, unknown>) }
			: {};
	base[EWA_COMPANION_PRESENCE_PREF_KEY] = {
		...prevObj,
		schema: EWA_COMPANION_PRESENCE_PREF_KEY,
		mode: mode === 'contemplation' ? 'contemplation' : 'chat',
	};
	return base;
}

/** End of local calendar day as ISO (for server soft-initiative snooze mirror). */
export function endOfLocalDayIso(now: Date = new Date()): string {
	const end = new Date(now);
	end.setHours(23, 59, 59, 0);
	return end.toISOString();
}

/** Merge soft-initiative snooze_until into learned_preferences for profile PATCH. */
export function mergeEwaCompanionSoftInitiativeSnoozePref(
	learnedPreferences: Record<string, unknown> | null | undefined,
	snoozeUntilIso: string
): Record<string, unknown> {
	const base =
		learnedPreferences && typeof learnedPreferences === 'object'
			? { ...learnedPreferences }
			: {};
	const prev = base[EWA_COMPANION_SOFT_INITIATIVE_PREF_KEY];
	const prevObj =
		prev && typeof prev === 'object' && !Array.isArray(prev)
			? { ...(prev as Record<string, unknown>) }
			: {};
	base[EWA_COMPANION_SOFT_INITIATIVE_PREF_KEY] = {
		...prevObj,
		schema: EWA_COMPANION_SOFT_INITIATIVE_PREF_KEY,
		snooze_until: snoozeUntilIso,
		last_deny_reason: 'snooze',
	};
	return base;
}

export function isHttpConflictError(error: unknown): boolean {
	if (error instanceof APIError && error.statusCode === 409) return true;
	if (isAxiosError(error) && error.response?.status === 409) return true;
	return false;
}

/** True when companion profile row is missing (404 / ``companion_profile_not_initialized``). */
export function isCompanionProfileNotInitializedError(error: unknown): boolean {
	if (error instanceof APIError) {
		if (error.statusCode === 404) return true;
		const code = String(error.errorCode || error.message || '').trim();
		const msg = String(error.message || '').trim();
		return (
			code === 'companion_profile_not_initialized' ||
			msg.includes('companion_profile_not_initialized')
		);
	}
	if (isAxiosError(error)) {
		if (error.response?.status === 404) return true;
		const detail = error.response?.data;
		if (typeof detail === 'string') {
			return detail.includes('companion_profile_not_initialized');
		}
		if (detail && typeof detail === 'object') {
			const code = (detail as { code?: unknown }).code;
			const msg = (detail as { detail?: unknown }).detail;
			if (code === 'companion_profile_not_initialized') return true;
			if (
				typeof msg === 'string' &&
				msg.includes('companion_profile_not_initialized')
			) {
				return true;
			}
		}
	}
	return false;
}

export type GetEwaCompanionProfileOptions = {
	/** Bypass browser/intermediary caching so ``companion_revision`` matches the DB row before a CAS PATCH. */
	bypassHttpCache?: boolean;
};

export type EwaCompanionProfileOut = {
	principal_id: string;
	schema_version: string;
	seed_persona_id: string;
	baseline: Record<string, unknown>;
	learned_preferences: Record<string, unknown>;
	style_parameters: Record<string, unknown>;
	memory_display?: string[];
	character_state?: Record<string, unknown>;
	companion_revision: number;
	updated_at: string | null;
	/** stack9 voice-gateway (Whisper STT + Qwen3-TTS); from ``EWA_COMPANION_VOICE_ENABLED``. */
	voice_enabled?: boolean;
	/** Mood/work reactive window chrome; from ``EWA_COMPANION_REACTIVE_CHROME_ENABLED``. */
	reactive_chrome_enabled?: boolean;
};

export type EwaCompanionQuickPreset = {
	id: string;
	principal_id: string;
	label: string;
	prompt_text: string;
	sort_order: number;
	created_at?: string | null;
	updated_at?: string | null;
};

export async function getEwaCompanionProfile(
	options?: GetEwaCompanionProfileOptions
): Promise<EwaCompanionProfileOut> {
	const res = await apiClient.get<EwaCompanionProfileOut>(
		EWA_COMPANION_PROFILE_PATH,
		{
			...API_OPTIONS,
			...(options?.bypassHttpCache
				? {
						params: { _ewa_cp: Date.now() },
						headers: {
							'Cache-Control': 'no-cache',
							Pragma: 'no-cache',
						},
					}
				: {}),
		}
	);
	return res.data;
}

export async function initializeEwaCompanionProfile(body: {
	seed_persona_id: string;
	baseline?: Record<string, unknown> | null;
}): Promise<EwaCompanionProfileOut> {
	const res = await apiClient.post<EwaCompanionProfileOut>(
		`${EWA_COMPANION_PROFILE_PATH}/initialize`,
		body,
		API_OPTIONS
	);
	return res.data;
}

export type EwaCompanionArlikaV2ModeToggleOut = EwaCompanionProfileOut & {
	switched: boolean;
	transform_event_kind: string | null;
};

export async function toggleEwaCompanionArlikaV2Mode(): Promise<EwaCompanionArlikaV2ModeToggleOut> {
	const res = await apiClient.post<EwaCompanionArlikaV2ModeToggleOut>(
		`${EWA_COMPANION_PROFILE_PATH}/arlika-v2-mode-toggle`,
		{},
		API_OPTIONS
	);
	return res.data;
}

export async function patchEwaCompanionProfile(body: {
	baseline?: Record<string, unknown> | null;
	learned_preferences?: Record<string, unknown> | null;
	style_parameters?: Record<string, unknown> | null;
	expect_revision?: number | null;
}): Promise<EwaCompanionProfileOut> {
	const res = await apiClient.patch<EwaCompanionProfileOut>(
		EWA_COMPANION_PROFILE_PATH,
		body,
		API_OPTIONS
	);
	return res.data;
}

/** User-initiated forget of one ``companion_memory_v1`` row by ``content_hash`` (U6.3). */
export async function forgetEwaCompanionMemory(
	contentHash: string
): Promise<EwaCompanionProfileOut> {
	const res = await apiClient.delete<EwaCompanionProfileOut>(
		`${EWA_COMPANION_PROFILE_PATH}/memory/${encodeURIComponent(contentHash)}`,
		API_OPTIONS
	);
	return res.data;
}

export async function listEwaCompanionQuickPresets(options?: {
	scopePrincipalId?: string;
}): Promise<EwaCompanionQuickPreset[]> {
	const res = await apiClient.get<EwaCompanionQuickPreset[]>(
		`${EWA_COMPANION_PROFILE_PATH}/quick-actions`,
		{
			...API_OPTIONS,
			params: {
				_: Date.now(),
				...(options?.scopePrincipalId ? { pid: options.scopePrincipalId } : {}),
			},
			headers: {
				'Cache-Control': 'no-cache',
				Pragma: 'no-cache',
			},
		}
	);
	return Array.isArray(res.data) ? res.data : [];
}

export async function createEwaCompanionQuickPreset(body: {
	label: string;
	prompt_text: string;
	sort_order?: number;
}): Promise<EwaCompanionQuickPreset> {
	const res = await apiClient.post<EwaCompanionQuickPreset>(
		`${EWA_COMPANION_PROFILE_PATH}/quick-actions`,
		body,
		API_OPTIONS
	);
	return res.data;
}

export async function patchEwaCompanionQuickPreset(
	presetId: string,
	body: {
		label?: string | null;
		prompt_text?: string | null;
		sort_order?: number | null;
	}
): Promise<EwaCompanionQuickPreset> {
	const res = await apiClient.patch<EwaCompanionQuickPreset>(
		`${EWA_COMPANION_PROFILE_PATH}/quick-actions/${encodeURIComponent(presetId)}`,
		body,
		API_OPTIONS
	);
	return res.data;
}

export async function deleteEwaCompanionQuickPreset(
	presetId: string
): Promise<void> {
	await apiClient.delete(
		`${EWA_COMPANION_PROFILE_PATH}/quick-actions/${encodeURIComponent(presetId)}`,
		API_OPTIONS
	);
}
