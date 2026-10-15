/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Module-level MRU for desktop apps (`recent_app_ids`, `recent_app_ids_by_desktop`) with shell persist.
 *
 * Invariants:
 * - Writes go through shell-state mutation pipeline; in-memory state is shared across hook instances.
 *
 * Related:
 * - `useDesktopWorkspaceAppLaunch.ts`, `desktopShellStateMutationPipeline.ts`
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { STORAGE_KEYS } from '../constants';
import type { DesktopItem } from '../types/desktop.types';
import {
	fetchDesktopShellStateDeduplicated,
	isDesktopShellStateConflictError,
} from '../services/desktopApi';
import { enqueueDesktopPersistShellPatch } from '../utils/desktopPersistPatchQueue';
import {
	flushShellStatePipelineNow,
	resetShellStatePipeline,
	scheduleShellStateMutation,
} from '../utils/desktopShellStateMutationPipeline';

export const DESKTOP_RECENT_APPS_MAX = 10;
const DESKTOP_RECENT_APPS_BY_DESKTOP_MAX_KEYS = 32;
const DESKTOP_RECENT_APPS_EVENT = 'desktop-recent-apps-updated';

let sharedRecentIds: string[] = [];
/** Per virtual desktop id — MRU app item ids (shell_state.recent_app_ids_by_desktop). */
let sharedRecentByDesktop: Record<string, string[]> = {};
let hydrateDone = false;
let hydrateInflight: Promise<void> | null = null;

const listeners = new Set<() => void>();

/** Tests only */
export function __resetDesktopRecentAppsModuleForTests(): void {
	sharedRecentIds = [];
	sharedRecentByDesktop = {};
	hydrateDone = false;
	hydrateInflight = null;
	resetShellStatePipeline();
	listeners.clear();
}

function emitRecentAppsUpdated(): void {
	listeners.forEach((fn) => {
		try {
			fn();
		} catch {
			/* ignore */
		}
	});
	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent<string[]>(DESKTOP_RECENT_APPS_EVENT, {
				detail: [...sharedRecentIds],
			})
		);
	}
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}

function canUseBrowserStorage(): boolean {
	return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function sanitizeRecentAppIds(value: unknown, max: number): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.filter(
			(entry): entry is string => typeof entry === 'string' && entry.length > 0
		)
		.map((s) => s.trim())
		.filter((s) => s.length > 0 && s.length <= 120)
		.filter((s, i, a) => a.indexOf(s) === i)
		.slice(0, max);
}

function sanitizeRecentAppIdsByDesktopFromServer(
	raw: unknown,
	maxPerList: number
): Record<string, string[]> {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {};
	}
	const out: Record<string, string[]> = {};
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		if (Object.keys(out).length >= DESKTOP_RECENT_APPS_BY_DESKTOP_MAX_KEYS) {
			break;
		}
		if (typeof k !== 'string') continue;
		const dk = k.trim();
		if (!dk || dk.length > 120) continue;
		const ids = sanitizeRecentAppIds(v, maxPerList);
		if (ids.length > 0) {
			out[dk] = ids;
		}
	}
	return out;
}

function snapshotRecentByDesktop(): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const [k, v] of Object.entries(sharedRecentByDesktop)) {
		out[k] = [...v];
	}
	return out;
}

function readLegacyLocalRecentIds(max: number): string[] {
	if (!canUseBrowserStorage()) {
		return [];
	}
	try {
		return sanitizeRecentAppIds(
			JSON.parse(localStorage.getItem(STORAGE_KEYS.RECENT_APPS) ?? '[]'),
			max
		);
	} catch {
		return [];
	}
}

function schedulePersistRecentApps(
	max: number,
	persistSubjectKey?: string | null
): void {
	const patch = {
		recent_app_ids: sharedRecentIds.slice(0, max),
		recent_app_ids_by_desktop: snapshotRecentByDesktop(),
	};
	scheduleShellStateMutation({
		source: 'mru',
		merge: () => patch,
	});
	void flushShellStatePipelineNow('mru').catch((error) => {
		if (isDesktopShellStateConflictError(error)) return;
		const subject = persistSubjectKey?.trim();
		if (subject) {
			enqueueDesktopPersistShellPatch(subject, patch);
		}
	});
}

function hydrateRecentAppsOnce(max: number): Promise<void> {
	if (hydrateDone) {
		return Promise.resolve();
	}
	if (hydrateInflight) {
		return hydrateInflight;
	}
	hydrateInflight = (async () => {
		try {
			const s = await fetchDesktopShellStateDeduplicated();
			let ids = sanitizeRecentAppIds(s.recent_app_ids, max);
			sharedRecentByDesktop = sanitizeRecentAppIdsByDesktopFromServer(
				s.recent_app_ids_by_desktop,
				max
			);
			if (ids.length === 0) {
				const legacy = readLegacyLocalRecentIds(max);
				if (legacy.length > 0) {
					ids = legacy;
					try {
						scheduleShellStateMutation({
							source: 'mru',
							merge: () => ({ recent_app_ids: ids }),
							immediate: true,
						});
						await flushShellStatePipelineNow('mru');
					} catch {
						/* ignore */
					}
					try {
						localStorage.removeItem(STORAGE_KEYS.RECENT_APPS);
					} catch {
						/* ignore */
					}
				}
			}
			sharedRecentIds = ids;
			emitRecentAppsUpdated();
		} catch {
			/* offline / 401: остаёмся in-memory только для сессии */
		} finally {
			hydrateDone = true;
			hydrateInflight = null;
		}
	})();
	return hydrateInflight;
}

export function resolveRecentDesktopItems(
	items: DesktopItem[],
	recentIds: readonly string[],
	max = DESKTOP_RECENT_APPS_MAX
): DesktopItem[] {
	const byId = new Map(items.map((item) => [item.id, item] as const));
	return recentIds
		.slice(0, max)
		.map((id) => byId.get(id))
		.filter((item): item is DesktopItem => item != null);
}

export function useDesktopRecentApps(
	max = DESKTOP_RECENT_APPS_MAX,
	persistSubjectKey?: string | null
): {
	recentIds: string[];
	recentIdsByDesktop: Record<string, string[]>;
	recentItems: (items: DesktopItem[]) => DesktopItem[];
	recordRecentApp: (appId: string, desktopId?: string | null) => void;
	clearRecentApps: () => void;
} {
	const [bundle, setBundle] = useState(() => ({
		recentIds: [...sharedRecentIds],
		recentIdsByDesktop: snapshotRecentByDesktop(),
	}));

	useEffect(
		() =>
			subscribe(() => {
				setBundle({
					recentIds: [...sharedRecentIds],
					recentIdsByDesktop: snapshotRecentByDesktop(),
				});
			}),
		[]
	);

	useEffect(() => {
		void hydrateRecentAppsOnce(max);
	}, [max]);

	const recordRecentApp = useCallback(
		(appId: string, desktopId?: string | null) => {
			const normalizedId = appId.trim();
			if (!normalizedId) {
				return;
			}
			const next = [
				normalizedId,
				...sharedRecentIds.filter((id) => id !== normalizedId),
			].slice(0, max);
			sharedRecentIds = next;
			const desk = desktopId?.trim();
			if (desk) {
				const cur = sharedRecentByDesktop[desk] ?? [];
				sharedRecentByDesktop[desk] = [
					normalizedId,
					...cur.filter((id) => id !== normalizedId),
				].slice(0, max);
			}
			emitRecentAppsUpdated();
			schedulePersistRecentApps(max, persistSubjectKey);
		},
		[max, persistSubjectKey]
	);

	const clearRecentApps = useCallback(() => {
		sharedRecentIds = [];
		sharedRecentByDesktop = {};
		emitRecentAppsUpdated();
		schedulePersistRecentApps(max, persistSubjectKey);
	}, [max, persistSubjectKey]);

	const recentItems = useCallback(
		(items: DesktopItem[]) =>
			resolveRecentDesktopItems(items, bundle.recentIds, max),
		[max, bundle.recentIds]
	);

	return useMemo(
		() => ({
			recentIds: bundle.recentIds,
			recentIdsByDesktop: bundle.recentIdsByDesktop,
			recentItems,
			recordRecentApp,
			clearRecentApps,
		}),
		[
			bundle.recentIds,
			bundle.recentIdsByDesktop,
			clearRecentApps,
			recentItems,
			recordRecentApp,
		]
	);
}
