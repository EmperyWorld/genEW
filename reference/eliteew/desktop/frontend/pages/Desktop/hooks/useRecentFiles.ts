/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Recent files list for Desktop: API load, MRU order overlay in `shell_state.recent_file_ids`.
 *
 * Invariants:
 * - Order persist uses shell-state mutation pipeline; debounced on `recentFiles` changes.
 * - Mount fetch aborts on unmount; abort / CanceledError is silent (no console noise).
 *
 * Related:
 * - `DesktopStateContext`, `emitDesktopFileOpened`, `desktopShellStateMutationPipeline.ts`
 */

import { useCallback, useEffect, useRef } from 'react';
import { api } from '../../../services/api/client';
import { isHttpRequestAbortLikeError } from '@/services/auth/authSessionHttpAbort';
import { STORAGE_KEYS } from '../constants';
import { fetchDesktopShellStateDeduplicated } from '../services/desktopApi';
import {
	flushShellStatePipelineNow,
	scheduleShellStateMutation,
	waitForShellStatePipelineFlush,
} from '../utils/desktopShellStateMutationPipeline';
import {
	useDesktopStateActions,
	useDesktopStateContext,
} from '../context/DesktopStateContext';
import type { RecentFile } from '../types/desktop.types';

/** API row shape for GET /desktop/recent-files and feed item rows. */
export type RecentFilesApiRow = {
	id: string;
	name: string;
	type: string;
	path: string;
	openedAt: string;
};

const DESKTOP_REQUEST_OPTIONS = { baseURL: '/api/v1' };

export function mapApiRowsToRecentFiles(
	data: RecentFilesApiRow[]
): RecentFile[] {
	return data.map((item) => ({
		id: item.id,
		name: item.name ?? 'Без названия',
		type:
			item.type === 'document' ||
			item.type === 'image' ||
			item.type === 'video' ||
			item.type === 'audio' ||
			item.type === 'folder' ||
			item.type === 'project'
				? item.type
				: 'document',
		path: item.path ?? `#/content/${item.id}`,
		openedAt: item.openedAt ? new Date(item.openedAt) : new Date(),
	}));
}

export interface DesktopFileOpenEventDetail {
	id: string;
	name: string;
	type: RecentFile['type'];
	path: string;
}

const DESKTOP_FILE_OPENED_EVENT = 'desktop-file-opened';
const RECENT_FILES_LIMIT = 10;

function applyRecentFileOrder(
	mapped: RecentFile[],
	orderIds: string[]
): RecentFile[] {
	if (orderIds.length === 0) {
		return mapped;
	}
	const byId = new Map(mapped.map((f) => [f.id, f] as const));
	const ordered = orderIds
		.map((id) => byId.get(id))
		.filter((f): f is RecentFile => f != null);
	const rest = mapped.filter((f) => !orderIds.includes(f.id));
	return [...ordered, ...rest];
}

/**
 * Centralized hook for working with recent files on Desktop.
 * - Provides current recentFiles from DesktopStateContext.
 * - Exposes addRecentFile helper with de-duplication and list trimming.
 * - Optionally loads initial list from API (GET /desktop/recent-files).
 * - Order overlay persists in shell_state.recent_file_ids (replaces localStorage).
 * - Optionally listens to global desktop-file-opened events from apps.
 */
export function useRecentFiles(options?: {
	listenToExternalEvents?: boolean;
	loadFromApi?: boolean;
}) {
	const { state } = useDesktopStateContext();
	const { setRecentFiles } = useDesktopStateActions();
	const { listenToExternalEvents = false, loadFromApi = true } = options ?? {};
	/** After first load attempt finishes (success or failure), allow debounced PATCH. */
	const allowRecentFilesPersistRef = useRef(false);
	const inflightAbortRef = useRef<AbortController | null>(null);

	const loadRecentFilesFromApi = useCallback(async () => {
		inflightAbortRef.current?.abort();
		const ac = new AbortController();
		inflightAbortRef.current = ac;
		const { signal } = ac;
		try {
			const { ensureDesktopShellBootstrap, peekDesktopShellBootstrap } =
				await import('../services/desktopShellBootstrap');
			await ensureDesktopShellBootstrap({ forceDesktop: true });
			const bootFiles = peekDesktopShellBootstrap()?.recent_files;
			const [shell, res] = await Promise.all([
				fetchDesktopShellStateDeduplicated(),
				bootFiles
					? Promise.resolve(bootFiles)
					: api.get<unknown>('/desktop/recent-files', {
							...DESKTOP_REQUEST_OPTIONS,
							params: { limit: RECENT_FILES_LIMIT },
							signal,
						}),
			]);
			if (signal.aborted) return;
			const data: RecentFilesApiRow[] = Array.isArray(res)
				? (res as RecentFilesApiRow[])
				: res !== null &&
						typeof res === 'object' &&
						'data' in res &&
						Array.isArray((res as { data: unknown }).data)
					? (res as { data: RecentFilesApiRow[] }).data
					: [];
			let mapped: RecentFile[] = mapApiRowsToRecentFiles(data);

			let orderIds = (shell.recent_file_ids ?? []).filter(
				(x): x is string => typeof x === 'string' && x.length > 0
			);
			if (orderIds.length === 0) {
				try {
					const savedRaw = localStorage.getItem(STORAGE_KEYS.RECENT_FILES);
					const fromLs = savedRaw ? (JSON.parse(savedRaw) as unknown) : [];
					const parsed = Array.isArray(fromLs)
						? fromLs.filter((x): x is string => typeof x === 'string')
						: [];
					if (parsed.length > 0) {
						orderIds = parsed;
						scheduleShellStateMutation({
							source: 'mru',
							merge: () => ({
								recent_file_ids: parsed.slice(0, RECENT_FILES_LIMIT),
							}),
							immediate: true,
						});
						await flushShellStatePipelineNow('mru').catch(() => {});
					}
					localStorage.removeItem(STORAGE_KEYS.RECENT_FILES);
				} catch {
					try {
						localStorage.removeItem(STORAGE_KEYS.RECENT_FILES);
					} catch {
						/* ignore */
					}
				}
			}
			if (signal.aborted) return;
			mapped = applyRecentFileOrder(mapped, orderIds);
			setRecentFiles(mapped);
		} catch (e) {
			if (signal.aborted || isHttpRequestAbortLikeError(e)) {
				return;
			}
			console.warn('[useRecentFiles] Load recent-files failed', e);
		} finally {
			if (!signal.aborted) {
				allowRecentFilesPersistRef.current = true;
			}
		}
	}, [setRecentFiles]);

	useEffect(() => {
		if (!loadFromApi) return;
		void loadRecentFilesFromApi();
		return () => {
			inflightAbortRef.current?.abort();
		};
	}, [loadFromApi, loadRecentFilesFromApi]);

	useEffect(() => {
		if (!loadFromApi || !allowRecentFilesPersistRef.current) return;
		const ids = state.recentFiles.map((f) => f.id).slice(0, RECENT_FILES_LIMIT);
		scheduleShellStateMutation({
			source: 'mru',
			merge: () => ({ recent_file_ids: ids }),
		});
		void waitForShellStatePipelineFlush().catch(() => {});
	}, [state.recentFiles, loadFromApi]);

	const addRecentFile = useCallback(
		(file: RecentFile) => {
			const withoutCurrent = state.recentFiles.filter((f) => f.id !== file.id);
			const next: RecentFile = {
				...file,
				openedAt:
					file.openedAt instanceof Date
						? file.openedAt
						: new Date(file.openedAt),
			};
			setRecentFiles([next, ...withoutCurrent].slice(0, 10));
		},
		[setRecentFiles, state.recentFiles]
	);

	const removeRecentFile = useCallback(
		(fileId: string) => {
			setRecentFiles(state.recentFiles.filter((f) => f.id !== fileId));
		},
		[setRecentFiles, state.recentFiles]
	);

	useEffect(() => {
		if (!listenToExternalEvents) return;
		if (typeof window === 'undefined') return;

		const handler = (event: Event) => {
			const { detail } = event as CustomEvent<
				DesktopFileOpenEventDetail | undefined
			>;
			if (!detail) return;
			const { id, name, type, path } = detail;
			if (!id || !name || !type || !path) return;
			const recent: RecentFile = {
				id,
				name,
				type,
				path,
				openedAt: new Date(),
			};
			addRecentFile(recent);
		};

		window.addEventListener(
			DESKTOP_FILE_OPENED_EVENT,
			handler as EventListener
		);
		return () =>
			window.removeEventListener(
				DESKTOP_FILE_OPENED_EVENT,
				handler as EventListener
			);
	}, [addRecentFile, listenToExternalEvents]);

	return {
		recentFiles: state.recentFiles,
		addRecentFile,
		removeRecentFile,
	};
}

/**
 * Helper for desktop apps to report that a file was opened,
 * so Desktop can keep a consistent recentFiles list.
 */
export function emitDesktopFileOpened(
	detail: DesktopFileOpenEventDetail
): void {
	if (typeof window === 'undefined') return;
	try {
		window.dispatchEvent(
			new CustomEvent<DesktopFileOpenEventDetail>(DESKTOP_FILE_OPENED_EVENT, {
				detail,
			})
		);
	} catch {
		// ignore
	}
}
