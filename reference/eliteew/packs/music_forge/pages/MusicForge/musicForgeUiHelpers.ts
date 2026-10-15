/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * User-safe error mapping and small form helpers for MusicForge pages layer.
 *
 * Invariants:
 * - Never surfaces stack traces or internal stage tokens as primary user copy.
 *
 * Related:
 * - src/pages/MusicForge/MusicForgeApp.tsx
 * - src/pages/MusicForge/MusicForgeWorkflow.tsx
 */

import type { TFunction } from 'i18next';
import { APIError } from '@/services/api/client';

export function stringField(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

const STACK_TRACE_MARKERS =
	/traceback|exception in|^\s+at\s+\S|file ".*\.py"/im;

export function resolveMusicForgeErrorMessage(
	payload: Record<string, unknown> | undefined | null,
	fallback: string
): string {
	const msg = stringField(payload?.message);
	if (!msg) return fallback;
	if (STACK_TRACE_MARKERS.test(msg)) return fallback;
	if (msg.length > 500) return `${msg.slice(0, 497)}…`;
	return msg;
}

export function mapMusicForgeApiError(
	exc: unknown,
	t: TFunction<'desktopUi'>,
	fallbackKey:
		| 'musicForge.errors.contactStudio'
		| 'musicForge.errors.pollFailed'
): string {
	if (exc instanceof APIError) {
		if (
			exc.status === 0 ||
			/network error|failed to fetch/i.test(exc.message)
		) {
			return t('musicForge.errors.network');
		}
		if (exc.status >= 500) return t(fallbackKey);
		const msg = exc.message.trim();
		if (msg && msg.length < 200 && !/^\d{3}\b/.test(msg)) return msg;
		return t('musicForge.errors.contactStudio');
	}
	if (exc instanceof Error && /network|failed to fetch/i.test(exc.message)) {
		return t('musicForge.errors.network');
	}
	return t(fallbackKey);
}

export function ideaNeedsMinLengthHint(idea: string): boolean {
	const trimmed = idea.trim();
	return trimmed.length > 0 && trimmed.length < 3;
}

export function clampDurationSeconds(
	value: number,
	min: number,
	max: number
): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, Math.round(value)));
}

export const MUSIC_FORGE_DISLIKE_REASON_CODES = [
	'vocal',
	'mix',
	'genre_mismatch',
	'arrangement',
	'lyrics',
	'tempo_rhythm',
	'artifacts',
	'other',
] as const;

export type MusicForgeDislikeReasonCode =
	(typeof MUSIC_FORGE_DISLIKE_REASON_CODES)[number];

/** Unified-content id for playback / favorites: top-level run field or result_payload. */
export function resolveMusicForgeContentId(run: {
	content_id?: string | null;
	result_payload?: Record<string, unknown> | null;
}): string {
	const top = stringField(run.content_id);
	if (top) return top;
	const payload = run.result_payload;
	if (!payload || typeof payload !== 'object') return '';
	return stringField(payload.content_id);
}

export const MUSIC_FORGE_FEEDBACK_STORAGE_PREFIX = 'musicForge.feedback.';
export const MUSIC_FORGE_AUTO_PLAY_STORAGE_PREFIX = 'musicForge.autoPlay.';

export function readMusicForgeFeedbackRating(
	runId: string
): 'like' | 'dislike' | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(
			`${MUSIC_FORGE_FEEDBACK_STORAGE_PREFIX}${runId}`
		);
		if (raw === 'like' || raw === 'dislike') return raw;
	} catch {
		// ignore quota / private mode
	}
	return null;
}

export function writeMusicForgeFeedbackRating(
	runId: string,
	rating: 'like' | 'dislike'
): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(
			`${MUSIC_FORGE_FEEDBACK_STORAGE_PREFIX}${runId}`,
			rating
		);
	} catch {
		// ignore
	}
}

/** Returns true once per run id in this browser tab (auto-play guard). */
export function claimMusicForgeAutoPlay(runId: string): boolean {
	if (typeof sessionStorage === 'undefined') return true;
	const key = `${MUSIC_FORGE_AUTO_PLAY_STORAGE_PREFIX}${runId}`;
	try {
		if (sessionStorage.getItem(key) === '1') return false;
		sessionStorage.setItem(key, '1');
		return true;
	} catch {
		return true;
	}
}
