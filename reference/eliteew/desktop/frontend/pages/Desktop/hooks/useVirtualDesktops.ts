/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Virtual space hook for Безраздельный мир: names, active id, window membership, and shell-state persistence.
 *
 * Invariants:
 * - Server source of truth is `PATCH /desktop/shell-state` (`virtual_desktops`).
 * - Existing ids stay stable even when visible default names change.
 *
 * Related:
 * - `components/VirtualDesktops.tsx`
 * - `utils/desktopShellStateMutationPipeline.ts`
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../constants';
import {
	fetchDesktopShellStateDeduplicated,
	isDesktopShellStateConflictError,
} from '../services/desktopApi';
import { enqueueDesktopPersistShellPatch } from '../utils/desktopPersistPatchQueue';
import {
	flushShellStatePipelineNow,
	scheduleShellStateMutation,
} from '../utils/desktopShellStateMutationPipeline';

export interface VirtualDesktop {
	id: string;
	name: string;
	wallpaper?: string;
	isActive: boolean;
	windows: string[]; // IDs of windows on this desktop
}

const DEFAULT_DESKTOPS: VirtualDesktop[] = [
	{ id: 'desktop-1', name: 'Безраздельный мир 1', isActive: true, windows: [] },
];

const DEFAULT_STATE = {
	desktops: DEFAULT_DESKTOPS,
	activeDesktopId: 'desktop-1',
};

const VD_PERSIST_DEBOUNCE_MS = 450;

function scheduleDurableVirtualDesktopsPatch(
	patch: Record<string, unknown>,
	options?: {
		immediate?: boolean;
		persistSubjectKey?: string | null;
		onFailure?: () => void;
	}
): void {
	scheduleShellStateMutation({
		source: 'windows',
		merge: () => patch,
		immediate: options?.immediate,
	});
	void flushShellStatePipelineNow('windows').catch((error) => {
		options?.onFailure?.();
		if (isDesktopShellStateConflictError(error)) return;
		const subject = options?.persistSubjectKey?.trim();
		if (subject) {
			enqueueDesktopPersistShellPatch(subject, patch);
		}
	});
}

function loadLegacyVirtualDesktopsFromLocalStorage(): {
	desktops: VirtualDesktop[];
	activeDesktopId: string;
} {
	try {
		const raw =
			typeof window !== 'undefined'
				? window.localStorage.getItem(STORAGE_KEYS.VIRTUAL_DESKTOPS)
				: null;
		if (!raw) {
			return DEFAULT_STATE;
		}
		const data = JSON.parse(raw) as {
			desktops?: VirtualDesktop[];
			activeDesktopId?: string;
		};
		const desktops =
			Array.isArray(data.desktops) && data.desktops.length > 0
				? data.desktops.map((d) => ({
						id: d.id,
						name: typeof d.name === 'string' ? d.name : d.id,
						wallpaper: d.wallpaper,
						isActive: Boolean(d.isActive),
						windows: Array.isArray(d.windows) ? d.windows : [],
					}))
				: DEFAULT_DESKTOPS;
		const activeId =
			typeof data.activeDesktopId === 'string' &&
			desktops.some((d) => d.id === data.activeDesktopId)
				? data.activeDesktopId
				: desktops[0].id;
		return {
			desktops: desktops.map((d) => ({ ...d, isActive: d.id === activeId })),
			activeDesktopId: activeId,
		};
	} catch {
		return DEFAULT_STATE;
	}
}

function normalizeVirtualDesktopsFromApi(data: unknown): {
	desktops: VirtualDesktop[];
	activeDesktopId: string;
} | null {
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return null;
	}
	const rec = data as Record<string, unknown>;
	const rawDesktops = rec.desktops;
	const activeRaw = rec.activeDesktopId;
	if (!Array.isArray(rawDesktops) || rawDesktops.length === 0) {
		return null;
	}
	const desktops: VirtualDesktop[] = [];
	for (const entry of rawDesktops) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
			continue;
		}
		const d = entry as Record<string, unknown>;
		const id = typeof d.id === 'string' ? d.id : '';
		if (!id) {
			continue;
		}
		const wins = Array.isArray(d.windows)
			? d.windows.filter((x): x is string => typeof x === 'string')
			: [];
		desktops.push({
			id,
			name: typeof d.name === 'string' ? d.name : id,
			wallpaper: typeof d.wallpaper === 'string' ? d.wallpaper : undefined,
			isActive: Boolean(d.isActive),
			windows: wins,
		});
	}
	if (desktops.length === 0) {
		return null;
	}
	const activeId =
		typeof activeRaw === 'string' && desktops.some((d) => d.id === activeRaw)
			? activeRaw
			: desktops[0].id;
	return {
		desktops: desktops.map((d) => ({ ...d, isActive: d.id === activeId })),
		activeDesktopId: activeId,
	};
}

export interface UseVirtualDesktopsReturn {
	desktops: VirtualDesktop[];
	activeDesktopId: string;
	activeDesktopIndex: number;

	// Actions
	createDesktop: (name?: string) => void;
	deleteDesktop: (id: string) => void;
	switchToDesktop: (id: string) => void;
	switchToNextDesktop: () => void;
	switchToPreviousDesktop: () => void;
	moveWindowToDesktop: (windowId: string, desktopId: string) => void;
	addWindowToDesktop: (windowId: string) => void;
	removeWindowFromDesktop: (windowId: string) => void;
	updateDesktopName: (id: string, name: string) => void;
	updateDesktopWallpaper: (id: string, wallpaper: string) => void;

	// Helpers
	getDesktopById: (id: string) => VirtualDesktop | undefined;
	getWindowsOnDesktop: (desktopId: string) => string[];
}

export function useVirtualDesktops(
	persistSubjectKey?: string | null
): UseVirtualDesktopsReturn {
	const [state, setState] = useState(DEFAULT_STATE);
	const desktops = state.desktops;
	const activeDesktopId = state.activeDesktopId;

	const allowPersistRef = useRef(false);
	const lastSentJsonRef = useRef<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void fetchDesktopShellStateDeduplicated()
			.then((s) => {
				if (cancelled) {
					return;
				}
				const fromApi = normalizeVirtualDesktopsFromApi(s.virtual_desktops);
				if (fromApi) {
					lastSentJsonRef.current = JSON.stringify({
						desktops: fromApi.desktops,
						activeDesktopId: fromApi.activeDesktopId,
					});
					setState(fromApi);
					allowPersistRef.current = true;
					return;
				}
				const legacy = loadLegacyVirtualDesktopsFromLocalStorage();
				const hasLegacy =
					typeof window !== 'undefined' &&
					Boolean(window.localStorage.getItem(STORAGE_KEYS.VIRTUAL_DESKTOPS));
				if (hasLegacy && legacy.desktops.length > 0) {
					setState(legacy);
					const payload = {
						desktops: legacy.desktops,
						activeDesktopId: legacy.activeDesktopId,
					};
					lastSentJsonRef.current = JSON.stringify(payload);
					scheduleDurableVirtualDesktopsPatch(
						{
							virtual_desktops: payload as Record<string, unknown>,
						},
						{ immediate: true, persistSubjectKey }
					);
					try {
						localStorage.removeItem(STORAGE_KEYS.VIRTUAL_DESKTOPS);
					} catch {
						/* ignore */
					}
				}
				allowPersistRef.current = true;
			})
			.catch(() => {
				if (!cancelled) {
					allowPersistRef.current = true;
				}
			});
		return () => {
			cancelled = true;
		};
	}, [persistSubjectKey]);

	useEffect(() => {
		if (!allowPersistRef.current) {
			return;
		}
		const payload = JSON.stringify({ desktops, activeDesktopId });
		if (payload === lastSentJsonRef.current) {
			return;
		}
		const timer = setTimeout(() => {
			lastSentJsonRef.current = payload;
			scheduleDurableVirtualDesktopsPatch(
				{
					virtual_desktops: JSON.parse(payload) as Record<string, unknown>,
				},
				{
					persistSubjectKey,
					onFailure: () => {
						lastSentJsonRef.current = null;
					},
				}
			);
		}, VD_PERSIST_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [desktops, activeDesktopId, persistSubjectKey]);

	const activeDesktopIndex = desktops.findIndex(
		(d) => d.id === activeDesktopId
	);

	// Create new desktop
	const createDesktop = useCallback(
		(name?: string) => {
			const newId = `desktop-${Date.now()}`;
			const newDesktop: VirtualDesktop = {
				id: newId,
				name: name || `Безраздельный мир ${desktops.length + 1}`,
				isActive: false,
				windows: [],
			};
			setState((prev) => ({
				...prev,
				desktops: [...prev.desktops, newDesktop],
			}));
		},
		[desktops.length]
	);

	// Delete desktop (can't delete the last one or active one)
	const deleteDesktop = useCallback(
		(id: string) => {
			if (desktops.length <= 1) return;
			if (id === activeDesktopId) return;
			setState((prev) => {
				const updated = prev.desktops.filter((d) => d.id !== id);
				const deletedDesktop = prev.desktops.find((d) => d.id === id);
				const nextDesktops = deletedDesktop
					? updated.map((d) =>
							d.id === prev.activeDesktopId
								? { ...d, windows: [...d.windows, ...deletedDesktop.windows] }
								: d
						)
					: updated;
				return { ...prev, desktops: nextDesktops };
			});
		},
		[desktops.length, activeDesktopId]
	);

	// Switch to desktop
	const switchToDesktop = useCallback((id: string) => {
		setState((prev) => ({
			...prev,
			activeDesktopId: id,
			desktops: prev.desktops.map((d) => ({ ...d, isActive: d.id === id })),
		}));
	}, []);

	// Switch to next desktop
	const switchToNextDesktop = useCallback(() => {
		const nextIndex = (activeDesktopIndex + 1) % desktops.length;
		switchToDesktop(desktops[nextIndex].id);
	}, [activeDesktopIndex, desktops, switchToDesktop]);

	// Switch to previous desktop
	const switchToPreviousDesktop = useCallback(() => {
		const prevIndex =
			activeDesktopIndex === 0 ? desktops.length - 1 : activeDesktopIndex - 1;
		switchToDesktop(desktops[prevIndex].id);
	}, [activeDesktopIndex, desktops, switchToDesktop]);

	// Move window to desktop
	const moveWindowToDesktop = useCallback(
		(windowId: string, desktopId: string) => {
			setState((prev) => {
				const updated = prev.desktops.map((d) => ({
					...d,
					windows: d.windows.filter((id) => id !== windowId),
				}));
				const targetIdx = updated.findIndex((d) => d.id === desktopId);
				if (targetIdx !== -1) {
					updated[targetIdx] = {
						...updated[targetIdx],
						windows: [...updated[targetIdx].windows, windowId],
					};
				}
				return { ...prev, desktops: updated };
			});
		},
		[]
	);

	// Add window to current desktop
	const addWindowToDesktop = useCallback((windowId: string) => {
		setState((prev) => {
			const activeDesktop = prev.desktops.find(
				(d) => d.id === prev.activeDesktopId
			);
			if (!activeDesktop || activeDesktop.windows.includes(windowId))
				return prev;
			const desktops = prev.desktops.map((d) =>
				d.id === prev.activeDesktopId
					? { ...d, windows: [...d.windows, windowId] }
					: d
			);
			return { ...prev, desktops };
		});
	}, []);

	// Remove window from all desktops
	const removeWindowFromDesktop = useCallback((windowId: string) => {
		setState((prev) => ({
			...prev,
			desktops: prev.desktops.map((d) => ({
				...d,
				windows: d.windows.filter((id) => id !== windowId),
			})),
		}));
	}, []);

	// Update desktop name
	const updateDesktopName = useCallback((id: string, name: string) => {
		setState((prev) => ({
			...prev,
			desktops: prev.desktops.map((d) => (d.id === id ? { ...d, name } : d)),
		}));
	}, []);

	// Update desktop wallpaper
	const updateDesktopWallpaper = useCallback(
		(id: string, wallpaper: string) => {
			setState((prev) => ({
				...prev,
				desktops: prev.desktops.map((d) =>
					d.id === id ? { ...d, wallpaper } : d
				),
			}));
		},
		[]
	);

	// Get desktop by ID
	const getDesktopById = useCallback(
		(id: string) => {
			return desktops.find((d) => d.id === id);
		},
		[desktops]
	);

	// Get windows on desktop
	const getWindowsOnDesktop = useCallback(
		(desktopId: string) => {
			const desktop = getDesktopById(desktopId);
			return desktop?.windows || [];
		},
		[getDesktopById]
	);

	return {
		desktops,
		activeDesktopId,
		activeDesktopIndex,
		createDesktop,
		deleteDesktop,
		switchToDesktop,
		switchToNextDesktop,
		switchToPreviousDesktop,
		moveWindowToDesktop,
		addWindowToDesktop,
		removeWindowFromDesktop,
		updateDesktopName,
		updateDesktopWallpaper,
		getDesktopById,
		getWindowsOnDesktop,
	};
}
