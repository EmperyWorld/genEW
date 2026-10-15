/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Restore open windows from **`GET shell_state`** (or legacy LocalStorage) and debounced‑persist **`windows_snapshot`**
 * via **`PATCH shell_state`**, plus auto-derived **`ewa_hints`** when shell-state cache is hydrated (avoids clobbering server
 * hints before the first GET).
 *
 * Invariants:
 * - Transient **`companionSurfaceExcerpt`** is stripped before persistence — see **`sanitizeWindowPayloadForShellPersistence`**.
 *
 * Related:
 * - `src/features/ewa/ewaShellHintsDerive.ts`
 * - `useWindowManager.ts`, `sanitizePersistedDesktopWindowPayload.ts`, `desktopApi.ts`
 */

import { mergeEwaShellHintsForPersistedWindows } from '@/features/ewa/ewaShellHintsDerive';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
	fetchDesktopShellStateDeduplicated,
	isDesktopShellStateConflictError,
	type DesktopShellStatePatch,
	peekDesktopShellStateCache,
} from '../services/desktopApi';
import { enqueueDesktopPersistShellPatch } from '../utils/desktopPersistPatchQueue';
import {
	flushShellStatePipelineNow,
	scheduleShellStateMutation,
} from '../utils/desktopShellStateMutationPipeline';
import { STORAGE_KEYS } from '../constants';
import type {
	DesktopItem,
	PersistedWindowState,
	WindowState,
} from '../types/desktop.types';
import { canResolveInstalledDesktopApps } from '../utils/desktopOpenPayloads';
import {
	isEphemeralDesktopWindowComponent,
	isLegacyHiddenDesktopAppComponent,
} from '../utils/desktopAppRegistry';
import { assessWindowsSnapshotRestore } from '../utils/desktopWindowsSnapshot';
import { sanitizeWindowPayloadForShellPersistence } from '../utils/sanitizePersistedDesktopWindowPayload';

type VirtualDesktopLike = { id: string; windows: string[] };

export type DesktopShellToast = {
	info: (title: string, message: string) => void;
};

const PERSIST_DEBOUNCE_MS = 1500;

function scheduleDurableWindowsShellPatch(
	patch: DesktopShellStatePatch,
	options?: {
		immediate?: boolean;
		persistSubjectKey?: string | null;
		debounceMs?: number;
	}
): void {
	scheduleShellStateMutation({
		source: 'windows',
		merge: () => patch as Record<string, unknown>,
		immediate: options?.immediate,
		debounceMs: options?.immediate
			? 0
			: (options?.debounceMs ?? PERSIST_DEBOUNCE_MS),
	});
	if (options?.immediate) {
		void flushShellStatePipelineNow('windows').catch((error) => {
			if (isDesktopShellStateConflictError(error)) return;
			const subject = options?.persistSubjectKey?.trim();
			if (subject) {
				enqueueDesktopPersistShellPatch(
					subject,
					patch as Record<string, unknown>
				);
			}
		});
	}
}

export function useDesktopShellWindowPersistence(params: {
	windows: WindowState[];
	desktops: VirtualDesktopLike[];
	activeDesktopId: string;
	installedApps: { appComponent?: string | null }[];
	installedAppsLoading: boolean;
	storeApps: unknown;
	items: DesktopItem[];
	restoreWindows: (
		windows: PersistedWindowState[],
		items: DesktopItem[]
	) => void;
	switchToDesktop: (id: string) => void;
	desktopToast: DesktopShellToast;
	persistSubjectKey?: string | null;
}): void {
	const { t } = useTranslation('desktopUi');
	const {
		windows,
		desktops,
		activeDesktopId,
		installedApps,
		installedAppsLoading,
		storeApps,
		items,
		restoreWindows,
		switchToDesktop,
		desktopToast,
		persistSubjectKey,
	} = params;

	const hasRestoredWindowsRef = useRef(false);
	const latestSnapshotRef = useRef<{
		activeDesktopId: string;
		windows: PersistedWindowState[];
	} | null>(null);
	const lastScheduledSnapshotJsonRef = useRef<string | null>(null);

	// Restore window layout from server shell_state (или одноразово из legacy localStorage)
	useEffect(() => {
		if (!canResolveInstalledDesktopApps(installedAppsLoading, storeApps))
			return;
		if (hasRestoredWindowsRef.current || items.length === 0) return;
		let cancelled = false;

		const applyRestore = (
			assessment: ReturnType<typeof assessWindowsSnapshotRestore>
		): void => {
			if (assessment.status !== 'ok') return;
			if (assessment.activeDesktopId) {
				switchToDesktop(assessment.activeDesktopId);
			}
			restoreWindows(assessment.windows, items);
			if (assessment.skippedCount > 0) {
				desktopToast.info(
					t('workspace.sessionRestorePartialTitle'),
					t('workspace.sessionRestorePartialBody', {
						restored: assessment.windows.length,
						skipped: assessment.skippedCount,
					})
				);
			} else {
				desktopToast.info(
					t('workspace.sessionRestoredTitle'),
					t('workspace.sessionRestoredBody', {
						count: assessment.windows.length,
					})
				);
			}
		};

		const notifyRestoreSkipped = (reason: 'corrupt' | 'unavailable'): void => {
			desktopToast.info(
				t('workspace.sessionRestoreSkippedTitle'),
				t(
					reason === 'corrupt'
						? 'workspace.sessionRestoreSkippedCorruptBody'
						: 'workspace.sessionRestoreSkippedUnavailableBody'
				)
			);
		};

		const restoreLegacySnapshot = (): boolean => {
			try {
				const raw = localStorage.getItem(STORAGE_KEYS.WINDOWS);
				if (!raw) {
					return false;
				}
				const parsed = JSON.parse(raw) as {
					activeDesktopId?: string;
					windows?: PersistedWindowState[];
				};
				const assessment = assessWindowsSnapshotRestore(parsed, installedApps);
				if (assessment.status === 'corrupt') {
					try {
						localStorage.removeItem(STORAGE_KEYS.WINDOWS);
					} catch {
						/* ignore */
					}
					notifyRestoreSkipped('corrupt');
					return true;
				}
				if (assessment.status === 'ok') {
					applyRestore(assessment);
					scheduleDurableWindowsShellPatch(
						{
							windows_snapshot: {
								activeDesktopId: parsed.activeDesktopId,
								windows: parsed.windows,
							},
						},
						{ immediate: true, persistSubjectKey }
					);
					try {
						localStorage.removeItem(STORAGE_KEYS.WINDOWS);
					} catch {
						/* ignore */
					}
					return true;
				}
			} catch {
				notifyRestoreSkipped('corrupt');
				return true;
			}
			return false;
		};

		void fetchDesktopShellStateDeduplicated()
			.then((s) => {
				if (cancelled) return;
				const ws = s.windows_snapshot;
				if (
					ws &&
					typeof ws === 'object' &&
					'windows' in ws &&
					Array.isArray((ws as { windows?: unknown }).windows)
				) {
					const parsed = ws as {
						activeDesktopId?: string;
						windows: PersistedWindowState[];
					};
					const assessment = assessWindowsSnapshotRestore(
						parsed,
						installedApps
					);
					if (assessment.status === 'ok' || assessment.status === 'corrupt') {
						if (assessment.status === 'ok') {
							applyRestore(assessment);
						} else {
							notifyRestoreSkipped('corrupt');
						}
						hasRestoredWindowsRef.current = true;
						return;
					}
					// empty: try legacy localStorage below
				}
				restoreLegacySnapshot();
				hasRestoredWindowsRef.current = true;
			})
			.catch(() => {
				if (!cancelled) {
					const restoredLegacy = restoreLegacySnapshot();
					if (!restoredLegacy) {
						notifyRestoreSkipped('unavailable');
					}
					hasRestoredWindowsRef.current = true;
				}
			});
		return () => {
			cancelled = true;
		};
	}, [
		desktopToast,
		t,
		installedApps,
		installedAppsLoading,
		items,
		restoreWindows,
		storeApps,
		switchToDesktop,
		persistSubjectKey,
	]);

	// Persist window layout to server shell_state (pipeline debounce + pagehide flush)
	useEffect(() => {
		const snapshot: PersistedWindowState[] = windows
			.filter(
				(w) =>
					!isLegacyHiddenDesktopAppComponent(w.appComponent) &&
					!isEphemeralDesktopWindowComponent(w.appComponent)
			)
			.map((w) => {
				const desktopId = desktops.find((d) => d.windows.includes(w.id))?.id;
				return {
					folderId: w.folderId,
					path: w.path ?? [],
					appComponent: w.appComponent,
					title: w.title,
					type: w.type,
					position: w.position,
					size: w.size,
					isMinimized: w.isMinimized,
					isMaximized: w.isMaximized,
					zIndex: w.zIndex,
					desktopId,
					initialPayload: sanitizeWindowPayloadForShellPersistence(
						w.initialPayload
					),
				};
			});
		const snapshotEnvelope = { activeDesktopId, windows: snapshot };
		const snapshotJson = JSON.stringify(snapshotEnvelope);
		latestSnapshotRef.current = snapshotEnvelope;
		if (lastScheduledSnapshotJsonRef.current === snapshotJson) return;
		lastScheduledSnapshotJsonRef.current = snapshotJson;

		const buildPatchBody = (): DesktopShellStatePatch => {
			const snap = latestSnapshotRef.current;
			if (!snap) return {};
			const cachedShell = peekDesktopShellStateCache();
			const body: DesktopShellStatePatch = {
				windows_snapshot: {
					activeDesktopId: snap.activeDesktopId,
					windows: snap.windows,
				},
			};
			if (cachedShell) {
				const prevRoot = cachedShell.ewa_hints;
				body.ewa_hints = mergeEwaShellHintsForPersistedWindows(
					snap.windows,
					prevRoot && typeof prevRoot === 'object' && !Array.isArray(prevRoot)
						? (prevRoot as Record<string, unknown>)
						: null
				);
			}
			return body;
		};

		scheduleShellStateMutation({
			source: 'windows',
			merge: () => buildPatchBody() as Record<string, unknown>,
			debounceMs: PERSIST_DEBOUNCE_MS,
		});

		const onPageHide = (): void => {
			scheduleDurableWindowsShellPatch(buildPatchBody(), {
				immediate: true,
				persistSubjectKey,
			});
		};
		window.addEventListener('pagehide', onPageHide);

		return () => {
			window.removeEventListener('pagehide', onPageHide);
		};
	}, [windows, desktops, activeDesktopId, persistSubjectKey]);
}
