/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Typed client for the separate MusicForge backend-first song generation API.
 *
 * Invariants:
 * - Uses `/api/v1/music-forge/*`; the browser never calls raw music-generator or Comfy endpoints.
 * - Transport exposes backend run snapshots only; workflow/model controls stay server-side.
 * - Active-run watch prefers SSE; GET poll is backoff fallback only (no fixed 1.8s spam).
 *
 * Related:
 * - src/pages/MusicForge/MusicForgeApp.tsx
 * - EliteEW/api/routers/music_forge.py
 */

import { api } from '@/services/api/client';
import { API_CONFIG } from '@/services/api/config';
import authSession from '@/services/authSession';
import {
	fetchMusicDownloadPathBlobWithRanges,
	parseUnifiedContentIdFromDownloadPath,
	readMusicContentDownloadParamsFromPath,
	resolveMusicContentInlineStreamUrl,
} from '@/pages/MusicPlayer/musicPlayerAudioDownload';

const MUSIC_FORGE_BASE = '/music-forge';
export const MUSIC_FORGE_TIMEOUT_MS = 1_860_000;
/** @deprecated Prefer MUSIC_FORGE_POLL_MS_MIN — kept for test mocks / call sites. */
export const MUSIC_FORGE_POLL_MS = 4_000;
export const MUSIC_FORGE_POLL_MS_MIN = 4_000;
export const MUSIC_FORGE_POLL_MS_MAX = 15_000;
export const MUSIC_FORGE_SSE_RETRY_MS = 2_000;
export const MUSIC_FORGE_POLLS_BEFORE_SSE_RETRY = 3;

export type MusicForgeLanguage = 'auto' | 'ru' | 'en';
export type MusicForgeResolvedLanguage = 'ru' | 'en';
export type MusicForgeRunStatus =
	| 'queued'
	| 'running'
	| 'completed'
	| 'failed'
	| 'cancelled';
export type MusicForgeStepStatus =
	| 'pending'
	| 'running'
	| 'completed'
	| 'failed'
	| 'cancelled'
	| 'skipped';

export type MusicForgeModeOption = {
	mode_key: string;
	label_ru: string;
	label_en: string;
	is_default: boolean;
	lane_key: string;
};

export type MusicForgeCapabilities = {
	default_language: MusicForgeLanguage;
	languages: Array<{ value: MusicForgeLanguage; label_ru: string }>;
	duration_seconds_default: number;
	duration_seconds_min: number;
	duration_seconds_max: number;
	mvp_lane: string;
	frontend_role: 'thin_client';
	config_version?: string | null;
	/** Wave D — enabled Modes from active config; empty until migration applied. */
	modes?: MusicForgeModeOption[];
	default_mode_key?: string | null;
};

export type MusicForgeRunCreate = {
	idea: string;
	language?: MusicForgeLanguage;
	style_hint?: string | null;
	constraints?: string | null;
	duration_seconds?: number;
	mode_key?: string | null;
	idempotency_key?: string;
};

export type MusicForgeStep = {
	id?: string | null;
	step_index: number;
	step_kind: string;
	title: string;
	status: MusicForgeStepStatus;
	input_payload: Record<string, unknown>;
	output_payload: Record<string, unknown>;
	error_payload: Record<string, unknown>;
	started_at?: string | null;
	completed_at?: string | null;
	duration_ms?: number | null;
};

export type MusicForgeRun = {
	id: string;
	status: MusicForgeRunStatus;
	idea: string;
	language: MusicForgeResolvedLanguage;
	style_hint?: string | null;
	constraints?: string | null;
	duration_seconds: number;
	progress_current: number;
	progress_total: number;
	normalized_input: Record<string, unknown>;
	song_blueprint: Record<string, unknown>;
	lyrics_payload: Record<string, unknown>;
	style_capsule: Record<string, unknown>;
	render_payload: Record<string, unknown>;
	result_payload: Record<string, unknown>;
	error_payload: Record<string, unknown>;
	content_id?: string | null;
	ugs_request_id?: string | null;
	started_at?: string | null;
	completed_at?: string | null;
	cancelled_at?: string | null;
	created_at: string;
	updated_at: string;
	steps: MusicForgeStep[];
};

export type MusicForgeFeedback = {
	rating: 'like' | 'dislike';
	reason_code?: string | null;
	reason_custom?: string | null;
};

export function normalizeMusicForgeDownloadPath(downloadUrl: string): string {
	const trimmed = downloadUrl.trim();
	if (!trimmed) return '';
	if (trimmed.startsWith('/api/')) return trimmed;
	if (/^https?:\/\//i.test(trimmed) && typeof window !== 'undefined') {
		try {
			const url = new URL(trimmed);
			if (
				url.origin === window.location.origin &&
				url.pathname.startsWith('/api/')
			) {
				return `${url.pathname}${url.search}`;
			}
		} catch {
			return '';
		}
	}
	return '';
}

export async function fetchMusicForgeResultAudioBlob(
	downloadUrl: string,
	options?: { signal?: AbortSignal }
): Promise<Blob> {
	const path = normalizeMusicForgeDownloadPath(downloadUrl);
	if (!path) {
		throw new Error('MusicForge result download URL is not available');
	}
	return fetchMusicDownloadPathBlobWithRanges(path, {
		signal: options?.signal,
	});
}

export async function resolveMusicForgeResultAudioStreamUrl(
	downloadUrl: string,
	options?: { signal?: AbortSignal }
): Promise<string | null> {
	const path = normalizeMusicForgeDownloadPath(downloadUrl);
	if (!path) {
		return null;
	}
	const parsed = parseUnifiedContentIdFromDownloadPath(path);
	if (!parsed) {
		return null;
	}
	const params = readMusicContentDownloadParamsFromPath(path);
	return resolveMusicContentInlineStreamUrl(parsed.contentId, {
		version: params?.version ?? null,
		signal: options?.signal,
	});
}

export async function fetchMusicForgeCapabilities(): Promise<MusicForgeCapabilities> {
	return api.get<MusicForgeCapabilities>(`${MUSIC_FORGE_BASE}/capabilities`, {
		baseURL: '/api/v1',
		timeout: MUSIC_FORGE_TIMEOUT_MS,
	});
}

export async function createMusicForgeRun(
	input: MusicForgeRunCreate
): Promise<{ run_id: string; status: MusicForgeRunStatus }> {
	return api.post<{ run_id: string; status: MusicForgeRunStatus }>(
		`${MUSIC_FORGE_BASE}/runs`,
		input,
		{
			baseURL: '/api/v1',
			timeout: MUSIC_FORGE_TIMEOUT_MS,
		}
	);
}

export async function fetchMusicForgeRun(
	runId: string
): Promise<MusicForgeRun> {
	return api.get<MusicForgeRun>(
		`${MUSIC_FORGE_BASE}/runs/${encodeURIComponent(runId)}`,
		{
			baseURL: '/api/v1',
			timeout: MUSIC_FORGE_TIMEOUT_MS,
		}
	);
}

export async function cancelMusicForgeRun(
	runId: string
): Promise<MusicForgeRun> {
	return api.post<MusicForgeRun>(
		`${MUSIC_FORGE_BASE}/runs/${encodeURIComponent(runId)}/cancel`,
		{},
		{
			baseURL: '/api/v1',
			timeout: MUSIC_FORGE_TIMEOUT_MS,
		}
	);
}

export async function recordMusicForgeFeedback(
	runId: string,
	input: MusicForgeFeedback
): Promise<{ ok: boolean; rating: 'like' | 'dislike' }> {
	return api.post<{ ok: boolean; rating: 'like' | 'dislike' }>(
		`${MUSIC_FORGE_BASE}/runs/${encodeURIComponent(runId)}/feedback`,
		input,
		{
			baseURL: '/api/v1',
			timeout: MUSIC_FORGE_TIMEOUT_MS,
		}
	);
}

export function musicForgeRunEventsPath(runId: string): string {
	return `${MUSIC_FORGE_BASE}/runs/${encodeURIComponent(runId)}/events`;
}

async function* iterateMusicForgeSseDataLines(
	res: Response
): AsyncGenerator<string> {
	const reader = res.body?.getReader();
	if (!reader) return;
	const decoder = new TextDecoder();
	let buf = '';
	let readResult = await reader.read();
	while (!readResult.done) {
		buf += decoder.decode(readResult.value, { stream: true });
		const chunks = buf.split('\n\n');
		buf = chunks.pop() ?? '';
		for (const block of chunks) {
			for (const line of block.split('\n')) {
				const trimmed = line.trim();
				if (trimmed.startsWith('data:')) {
					yield trimmed.slice(5).trimStart();
				}
			}
		}
		readResult = await reader.read();
	}
}

export function parseMusicForgeRunFromSseLine(
	line: string
): MusicForgeRun | null {
	if (!line.trim()) return null;
	try {
		const parsed = JSON.parse(line) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return null;
		}
		const record = parsed as Record<string, unknown>;
		if (typeof record.status !== 'string' || typeof record.id !== 'string') {
			return null;
		}
		return parsed as MusicForgeRun;
	} catch {
		return null;
	}
}

export function isMusicForgeRunTerminalStatus(
	status: MusicForgeRunStatus | string | undefined | null
): boolean {
	return (
		status === 'completed' || status === 'failed' || status === 'cancelled'
	);
}

export function nextMusicForgePollDelayMs(currentMs: number): number {
	const base = Number.isFinite(currentMs) ? currentMs : MUSIC_FORGE_POLL_MS_MIN;
	return Math.min(
		MUSIC_FORGE_POLL_MS_MAX,
		Math.max(MUSIC_FORGE_POLL_MS_MIN, Math.round(base * 1.5))
	);
}

function isAbortError(exc: unknown): boolean {
	return (
		(exc instanceof DOMException && exc.name === 'AbortError') ||
		(exc instanceof Error && exc.name === 'AbortError')
	);
}

async function waitForMusicForgeSignal(
	ms: number,
	signal: AbortSignal
): Promise<void> {
	if (signal.aborted) {
		throw new DOMException('Aborted', 'AbortError');
	}
	await new Promise<void>((resolve, reject) => {
		const timer = window.setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			window.clearTimeout(timer);
			reject(new DOMException('Aborted', 'AbortError'));
		};
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

async function waitWhileMusicForgeTabHidden(
	signal: AbortSignal
): Promise<void> {
	if (typeof document === 'undefined' || !document.hidden || signal.aborted) {
		return;
	}
	await new Promise<void>((resolve) => {
		const finish = () => {
			document.removeEventListener('visibilitychange', onVis);
			signal.removeEventListener('abort', onAbort);
			resolve();
		};
		const onVis = () => {
			if (!document.hidden) finish();
		};
		const onAbort = () => finish();
		document.addEventListener('visibilitychange', onVis);
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

export async function consumeMusicForgeRunSse(params: {
	runId: string;
	signal?: AbortSignal;
	onRunSnapshot?: (run: MusicForgeRun) => void;
}): Promise<void> {
	const root = API_CONFIG.baseURL.replace(/\/$/, '');
	const url = `${root}${musicForgeRunEventsPath(params.runId)}`;
	const headers: Record<string, string> = {
		Accept: 'text/event-stream',
		...authSession.getAuthHeader(),
	};
	const res = await fetch(url, { headers, signal: params.signal });
	if (!res.ok) {
		throw new Error(`MusicForge SSE HTTP ${res.status}`);
	}
	for await (const line of iterateMusicForgeSseDataLines(res)) {
		const run = parseMusicForgeRunFromSseLine(line);
		if (run) params.onRunSnapshot?.(run);
	}
}

/**
 * Watch one run until terminal or abort: SSE first, GET poll with backoff if SSE drops.
 * Pauses while the document is hidden to avoid mindless spam from background tabs.
 */
export async function monitorMusicForgeRun(params: {
	runId: string;
	signal: AbortSignal;
	onRunSnapshot: (run: MusicForgeRun) => void;
	onError?: (exc: unknown) => void;
}): Promise<void> {
	const { runId, signal, onRunSnapshot, onError } = params;
	let pollDelayMs = MUSIC_FORGE_POLL_MS_MIN;
	let consecutivePolls = 0;
	let sawTerminal = false;

	const apply = (run: MusicForgeRun) => {
		onRunSnapshot(run);
		if (isMusicForgeRunTerminalStatus(run.status)) {
			sawTerminal = true;
		}
	};

	try {
		apply(await fetchMusicForgeRun(runId));
	} catch (exc) {
		if (isAbortError(exc) || signal.aborted) return;
		onError?.(exc);
	}
	if (sawTerminal || signal.aborted) return;

	while (!signal.aborted && !sawTerminal) {
		await waitWhileMusicForgeTabHidden(signal);
		if (signal.aborted || sawTerminal) return;

		try {
			await consumeMusicForgeRunSse({
				runId,
				signal,
				onRunSnapshot: (run) => {
					apply(run);
					pollDelayMs = MUSIC_FORGE_POLL_MS_MIN;
					consecutivePolls = 0;
				},
			});
			if (sawTerminal || signal.aborted) return;
			// Stream ended without a terminal snapshot — confirm once, then retry SSE.
			try {
				apply(await fetchMusicForgeRun(runId));
			} catch (exc) {
				if (isAbortError(exc) || signal.aborted) return;
				onError?.(exc);
			}
			if (sawTerminal || signal.aborted) return;
			await waitForMusicForgeSignal(MUSIC_FORGE_SSE_RETRY_MS, signal);
			continue;
		} catch (sseExc) {
			if (isAbortError(sseExc) || signal.aborted) return;
		}

		await waitWhileMusicForgeTabHidden(signal);
		if (signal.aborted || sawTerminal) return;

		try {
			apply(await fetchMusicForgeRun(runId));
			if (sawTerminal || signal.aborted) return;
			consecutivePolls += 1;
			if (consecutivePolls >= MUSIC_FORGE_POLLS_BEFORE_SSE_RETRY) {
				consecutivePolls = 0;
				continue;
			}
			await waitForMusicForgeSignal(pollDelayMs, signal);
			pollDelayMs = nextMusicForgePollDelayMs(pollDelayMs);
		} catch (exc) {
			if (isAbortError(exc) || signal.aborted) return;
			onError?.(exc);
			await waitForMusicForgeSignal(pollDelayMs, signal);
			pollDelayMs = nextMusicForgePollDelayMs(pollDelayMs);
		}
	}
}
