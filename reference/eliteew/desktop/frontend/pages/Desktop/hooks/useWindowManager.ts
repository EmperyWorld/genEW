/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Hook for desktop window state: open/close, focus, minimize, maximize, move, resize, restore.
 *
 * Invariants:
 * - Snap/grid geometry lives in `desktopWindowGeometry` + `useWindowManagerSnap`.
 * - Maximized bounds track `#desktop-main` work area via resize observer.
 *
 * Related:
 * - `hooks/useWindowManagerSnap.ts`, `hooks/windowManagerRestoreSnapshot.ts`
 * - `hooks/windowManagerRestoreGeometry.ts`, `hooks/windowManagerOpenPolicy.ts`
 * - `utils/desktopWindowGeometry.ts`, `documentation/product/desktop/DESKTOP-WINDOW-MIN-SIZES.md`
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { announceToScreenReader } from '../../../utils/accessibility';
import { notify as toast } from '@/notifications';
import type {
	BeforeCloseHandler,
	DesktopItem,
	PersistedWindowState,
	SnapZone,
	WindowInitialPayload,
	WindowState,
} from '../types/desktop.types';
import {
	preloadDesktopApp,
	preloadDesktopApps,
} from '../utils/preloadDesktopApp';
import { applyAlwaysOnTopLayer } from '../utils/desktopAlwaysOnTopZIndex';
import {
	getDefaultWindowCascadePosition,
	getDefaultWindowSize,
	getMaximizedWindowBounds,
} from '../utils/desktopWindowGeometry';
import { useWindowManagerSnap } from './useWindowManagerSnap';
import {
	resolveOpenWindowDedupe,
	normalizeWindowInstanceLimit,
} from './windowManagerOpenPolicy';
import type { OpenWindowReuseReason } from './windowManagerOpenPolicy';
import {
	commitWindowListPosition,
	commitWindowListSize,
	commitWindowsIntoWorkArea,
	syncMaximizedWindowsList,
	toggleWindowListMaximized,
} from './windowManagerRestoreGeometry';
import {
	normalizePersistedWindowSnapshot,
	prepareSessionRestore,
} from './windowManagerRestoreSnapshot';

export type OpenWindowOptions = {
	forceNew?: boolean;
	instancePolicy?: {
		allowMultiple: boolean;
		maxInstances: number;
	};
	restoreState?: {
		position: { x: number; y: number };
		size: { width: number; height: number };
		isMinimized: boolean;
		isMaximized: boolean;
	};
	/** Payload for the app (e.g. documentId for DocEditor). */
	initialPayload?: WindowInitialPayload;
	/** Breadcrumb segments when opening a nested folder from inside another folder window. */
	folderPathPrefix?: string[];
};

const MINIMIZE_ANIMATION_MS_FALLBACK = 320;

function createDesktopWindowId(): string {
	if (
		typeof globalThis !== 'undefined' &&
		typeof globalThis.crypto?.randomUUID === 'function'
	) {
		return `w-${globalThis.crypto.randomUUID()}`;
	}
	return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mergeWindowInitialPayloadIfChanged(
	current: WindowInitialPayload | undefined,
	patch: WindowInitialPayload
): WindowInitialPayload | undefined {
	let changed = false;
	const currentRecord = current as Record<string, unknown> | undefined;
	const next: WindowInitialPayload = { ...(current ?? {}) };
	const nextRecord = next as Record<string, unknown>;

	for (const [key, value] of Object.entries(patch)) {
		if (!Object.is(currentRecord?.[key], value)) {
			nextRecord[key] = value;
			changed = true;
		}
	}

	return changed ? next : current;
}

interface UseWindowManagerReturn {
	windows: WindowState[];
	maxZ: number;
	snapZone: SnapZone;
	/** clientX / clientY указателя в viewport */
	getSnapZoneForPosition: (clientX: number, clientY: number) => SnapZone;
	openWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
	closeWindow: (id: string) => void;
	closeAllWindows: () => void;
	minimizeWindow: (id: string) => void;
	minimizeAllWindows: () => void;
	maximizeWindow: (id: string) => void;
	focusWindow: (id: string) => void;
	toggleWindowAlwaysOnTop: (id: string) => void;
	/** Во время drag: не чаще одного setState на кадр (rAF). */
	moveWindow: (id: string, x: number, y: number) => void;
	/** Конец drag: сразу записать позицию (сбросить отложенный rAF). */
	commitWindowPosition: (id: string, x: number, y: number) => void;
	resizeWindow: (id: string, width: number, height: number) => void;
	navigateBack: (id: string) => void;
	snapWindow: (id: string, zone: SnapZone) => void;
	updateSnapZone: (clientX: number, clientY: number) => void;
	clearSnapZone: () => void;
	registerBeforeClose: (id: string, fn: BeforeCloseHandler) => void;
	unregisterBeforeClose: (id: string) => void;
	restoreWindows: (
		snapshot: PersistedWindowState[],
		items: DesktopItem[]
	) => void;
	/** Update initialPayload for an existing window (e.g. DocEditor: set documentId when user selects doc from panel). */
	updateWindowPayload: (
		windowId: string,
		payload: WindowInitialPayload
	) => void;
	/** Retarget an open folder window (tree / breadcrumb navigation). */
	retargetFolderWindow: (
		windowId: string,
		target: { folderId: string; title: string; path: string[] }
	) => void;
	/**
	 * Уместить окна в текущую рабочую область: свёрнутые не трогаем; развёрнутые —
	 * восстановление прежних границ (как при «Восстановить») и кламп позиции/размера.
	 */
	bringWindowsIntoWorkArea: (predicate?: (w: WindowState) => boolean) => void;
}

export function useWindowManager(
	addWindowToDesktop?: (windowId: string) => void,
	removeWindowFromDesktop?: (windowId: string) => void,
	moveWindowToDesktop?: (windowId: string, desktopId: string) => void,
	openAppsMaximizedByDefault = true,
	minimizeAnimationMs = MINIMIZE_ANIMATION_MS_FALLBACK
): UseWindowManagerReturn {
	const [windows, setWindows] = useState<WindowState[]>([]);
	const {
		snapZone,
		updateSnapZone,
		clearSnapZone,
		snapWindow,
		getSnapZoneForPosition,
	} = useWindowManagerSnap(setWindows);
	const beforeCloseRef = useRef<Map<string, BeforeCloseHandler>>(new Map());
	/** Monotonic source for next z-index to avoid races with rapid focus/open. */
	const maxZRef = useRef(0);
	const { t } = useTranslation('desktopUi');
	const lastWindowLimitToastRef = useRef<{ key: string; ts: number } | null>(
		null
	);
	/** Drag: не вызывать setWindows на каждый пиксель — один коммит на кадр. */
	const pendingDragRef = useRef<{ id: string; x: number; y: number } | null>(
		null
	);
	const dragRafRef = useRef<number | null>(null);

	const showWindowOpenPolicyToast = useCallback(
		(
			appName: string,
			kind: 'at_limit' | OpenWindowReuseReason,
			maxInstances?: number
		) => {
			const key = `${appName}:${kind}:${maxInstances ?? 0}`;
			const now = Date.now();
			const last = lastWindowLimitToastRef.current;
			if (last && last.key === key && now - last.ts < 300) {
				return;
			}
			lastWindowLimitToastRef.current = { key, ts: now };
			if (kind === 'same_document') {
				toast.info(
					t('windowChrome.openPolicy.sameDocumentTitle'),
					t('windowChrome.openPolicy.sameDocumentBody', { appName })
				);
				return;
			}
			if (kind === 'same_app') {
				toast.info(
					t('windowChrome.openPolicy.focusExistingTitle'),
					t('windowChrome.openPolicy.focusExistingBody', { appName })
				);
				return;
			}
			if (maxInstances === 1) {
				toast.warning(
					t('windowChrome.openPolicy.singleWindowTitle'),
					t('windowChrome.openPolicy.singleWindowBody', { appName })
				);
				return;
			}
			toast.warning(
				t('windowChrome.openPolicy.limitTitle'),
				t('windowChrome.openPolicy.limitBody', {
					appName,
					count: maxInstances ?? 1,
				})
			);
		},
		[t]
	);

	useEffect(() => {
		return () => {
			if (dragRafRef.current != null) {
				cancelAnimationFrame(dragRafRef.current);
				dragRafRef.current = null;
			}
		};
	}, []);

	const maxZ = useMemo(
		() => Math.max(0, ...windows.map((w) => w.zIndex)),
		[windows]
	);

	// Close all windows
	const closeAllWindows = useCallback(() => {
		setWindows([]);
	}, []);

	// Minimize all windows (Show Desktop)
	const minimizeAllWindows = useCallback(() => {
		setWindows((prev) =>
			prev.map((w) => ({ ...w, isMinimized: true, isMinimizing: false }))
		);
	}, []);

	// Open a new window or focus existing. options.forceNew = true always creates a new instance. options.restoreState restores position/size/state.
	const commitOpenWindow = useCallback(
		(item: DesktopItem, options?: OpenWindowOptions) => {
			const forceNew = options?.forceNew === true;
			const restore = options?.restoreState;
			const initialPayload = options?.initialPayload;

			setWindows((prev) => {
				const currentMax =
					prev.length === 0 ? 0 : Math.max(...prev.map((w) => w.zIndex));
				const nextZ = Math.max(maxZRef.current, currentMax) + 1;
				maxZRef.current = nextZ;

				const dedupe = resolveOpenWindowDedupe({
					prev,
					item,
					forceNew,
					instancePolicy: options?.instancePolicy,
					initialPayload,
					nextZ,
				});
				if (dedupe.action === 'reuse' || dedupe.action === 'at_limit') {
					if (dedupe.action === 'at_limit') {
						showWindowOpenPolicyToast(
							item.name,
							'at_limit',
							dedupe.maxInstances
						);
					} else if (dedupe.reuseReason === 'same_document') {
						showWindowOpenPolicyToast(item.name, 'same_document');
					} else if (
						normalizeWindowInstanceLimit(options?.instancePolicy) <= 1
					) {
						showWindowOpenPolicyToast(item.name, 'same_app');
					}
					return dedupe.windows;
				}

				const newId = createDesktopWindowId();
				const isAppWindow = item.type === 'app';
				const defaultSize = getDefaultWindowSize(
					isAppWindow ? 'app' : 'folder',
					item.appComponent
				);
				const defaultPosition = getDefaultWindowCascadePosition(prev.length);
				const maximizedBounds = getMaximizedWindowBounds();
				/** Folders use the same “open maximized” preference as apps (desktop work area). */
				const shouldOpenMaximized =
					(isAppWindow || item.type === 'folder') &&
					!restore &&
					openAppsMaximizedByDefault;
				const newWindow: WindowState = {
					id: newId,
					title: item.name,
					type: isAppWindow ? 'app' : 'folder',
					position:
						restore?.position ??
						(shouldOpenMaximized ? maximizedBounds.position : defaultPosition),
					size:
						restore?.size ??
						(shouldOpenMaximized ? maximizedBounds.size : defaultSize),
					restoreBounds:
						restore && !restore.isMaximized
							? {
									position: restore.position,
									size: restore.size,
								}
							: shouldOpenMaximized
								? {
										position: defaultPosition,
										size: defaultSize,
									}
								: null,
					isMinimized: restore?.isMinimized ?? false,
					isMaximized: restore?.isMaximized ?? shouldOpenMaximized,
					zIndex: nextZ,
					folderId: item.id,
					path: [...(options?.folderPathPrefix ?? []), item.name],
					appComponent: item.appComponent,
					icon: item.icon,
					...(initialPayload != null && { initialPayload }),
				};

				if (addWindowToDesktop) {
					addWindowToDesktop(newId);
				}
				return [...prev, newWindow];
			});
		},
		[addWindowToDesktop, openAppsMaximizedByDefault, showWindowOpenPolicyToast]
	);

	const openWindow = useCallback(
		(item: DesktopItem, options?: OpenWindowOptions) => {
			const pendingPreload =
				item.type === 'app' ? preloadDesktopApp(item.appComponent) : null;

			if (pendingPreload) {
				void pendingPreload
					.catch(() => undefined)
					.finally(() => {
						commitOpenWindow(item, options);
					});
				return;
			}

			commitOpenWindow(item, options);
		},
		[commitOpenWindow]
	);

	const doCloseWindow = useCallback(
		(id: string) => {
			beforeCloseRef.current.delete(id);
			setWindows((prev) => {
				const win = prev.find((w) => w.id === id);
				if (win)
					announceToScreenReader(
						t('windowChrome.screenReader.windowClosed', {
							title: win.title,
						}),
						'polite'
					);
				return prev.filter((w) => w.id !== id);
			});
			if (removeWindowFromDesktop) removeWindowFromDesktop(id);
		},
		[removeWindowFromDesktop, t]
	);

	const registerBeforeClose = useCallback(
		(id: string, fn: BeforeCloseHandler) => {
			beforeCloseRef.current.set(id, fn);
		},
		[]
	);

	const unregisterBeforeClose = useCallback((id: string) => {
		beforeCloseRef.current.delete(id);
	}, []);

	// Close window; runs beforeClose handler if registered (confirm unsaved, etc.)
	const closeWindow = useCallback(
		(id: string) => {
			const fn = beforeCloseRef.current.get(id);
			if (fn) {
				Promise.resolve(fn()).then((ok) => {
					if (ok) doCloseWindow(id);
				});
				return;
			}
			doCloseWindow(id);
		},
		[doCloseWindow]
	);

	// Minimize window: start animation (isMinimizing), then set isMinimized after animation
	const minimizeWindow = useCallback((id: string) => {
		setWindows((prev) =>
			prev.map((w) =>
				w.id === id && !w.isMinimized ? { ...w, isMinimizing: true } : w
			)
		);
	}, []);

	const hasMinimizingWindows = useMemo(
		() => windows.some((w) => w.isMinimizing),
		[windows]
	);

	useEffect(() => {
		if (!hasMinimizingWindows) return;
		const t = setTimeout(() => {
			setWindows((prev) =>
				prev.map((w) =>
					w.isMinimizing ? { ...w, isMinimized: true, isMinimizing: false } : w
				)
			);
		}, minimizeAnimationMs);
		return () => clearTimeout(t);
	}, [hasMinimizingWindows, minimizeAnimationMs]);

	// Keep maximized windows flush with `#desktop-main` after viewport / safe-area changes
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const syncMaximized = () => {
			setWindows((prev) => syncMaximizedWindowsList(prev));
		};
		window.addEventListener('resize', syncMaximized);
		const root = document.getElementById('desktop-main');
		const ro =
			typeof ResizeObserver !== 'undefined' && root
				? new ResizeObserver(() => syncMaximized())
				: null;
		if (ro && root) {
			ro.observe(root);
		}
		return () => {
			window.removeEventListener('resize', syncMaximized);
			ro?.disconnect();
		};
	}, []);

	// Maximize/restore window
	const maximizeWindow = useCallback((id: string) => {
		setWindows((prev) => toggleWindowListMaximized(prev, id));
	}, []);

	// Focus window (bring to front). Monotonic z via maxZRef to avoid races with rapid switching / many windows.
	const focusWindow = useCallback((id: string) => {
		setWindows((prev) => {
			const currentMax =
				prev.length === 0 ? 0 : Math.max(...prev.map((w) => w.zIndex));
			const nextZ = Math.max(maxZRef.current, currentMax) + 1;
			maxZRef.current = nextZ;
			const focused = prev.find((w) => w.id === id);
			if (focused?.zIndex === currentMax && !focused.isMinimized) {
				return applyAlwaysOnTopLayer(prev);
			}
			const raised = prev.map((w) =>
				w.id === id
					? { ...w, zIndex: nextZ, isMinimized: false, isMinimizing: false }
					: w
			);
			const layered = applyAlwaysOnTopLayer(raised);
			maxZRef.current = Math.max(...layered.map((w) => w.zIndex));
			return layered;
		});
	}, []);

	const toggleWindowAlwaysOnTop = useCallback((id: string) => {
		setWindows((prev) => {
			const target = prev.find((w) => w.id === id);
			if (!target) return prev;
			const nextAlwaysOnTop = !target.alwaysOnTop;
			const currentMax =
				prev.length === 0 ? 0 : Math.max(...prev.map((w) => w.zIndex));
			const nextZ = Math.max(maxZRef.current, currentMax) + 1;
			maxZRef.current = nextZ;
			const toggled = prev.map((w) =>
				w.id === id
					? {
							...w,
							alwaysOnTop: nextAlwaysOnTop,
							zIndex: nextZ,
							isMinimized: false,
							isMinimizing: false,
						}
					: w
			);
			const layered = applyAlwaysOnTopLayer(toggled);
			maxZRef.current = Math.max(...layered.map((w) => w.zIndex));
			return layered;
		});
	}, []);

	const flushPendingDragRaf = useCallback(() => {
		dragRafRef.current = null;
		const p = pendingDragRef.current;
		if (!p) return;
		setWindows((prev) => {
			const p = pendingDragRef.current;
			if (!p) return prev;
			return commitWindowListPosition(prev, p.id, p.x, p.y);
		});
	}, []);

	// Move window (throttled to one React update per animation frame while dragging)
	const moveWindow = useCallback(
		(id: string, x: number, y: number) => {
			pendingDragRef.current = { id, x, y };
			if (dragRafRef.current != null) return;
			dragRafRef.current = requestAnimationFrame(() => {
				flushPendingDragRaf();
			});
		},
		[flushPendingDragRaf]
	);

	const commitWindowPosition = useCallback(
		(id: string, x: number, y: number) => {
			if (dragRafRef.current != null) {
				cancelAnimationFrame(dragRafRef.current);
				dragRafRef.current = null;
			}
			pendingDragRef.current = null;
			setWindows((prev) => commitWindowListPosition(prev, id, x, y));
		},
		[]
	);

	// Resize window
	const resizeWindow = useCallback(
		(id: string, width: number, height: number) => {
			setWindows((prev) => commitWindowListSize(prev, id, width, height));
		},
		[]
	);

	// Navigate back in folder
	const navigateBack = useCallback((id: string) => {
		setWindows((prev) =>
			prev.map((w) =>
				w.id === id && w.path.length > 1
					? { ...w, path: w.path.slice(0, -1) }
					: w
			)
		);
	}, []);

	// Restore windows from persisted snapshot (session restore)
	// Legacy voice windows are never restored so they do not open automatically on load
	const restoreWindows = useCallback(
		(snapshot: PersistedWindowState[], items: DesktopItem[]) => {
			const filtered = normalizePersistedWindowSnapshot(snapshot);
			if (filtered.length === 0) return;

			void preloadDesktopApps(
				filtered
					.filter((windowState) => windowState.type === 'app')
					.map((windowState) => windowState.appComponent)
			).finally(() => {
				const restored = prepareSessionRestore(
					snapshot,
					items,
					(index) => `w-${Date.now()}-${index}`
				);
				if (!restored) return;
				maxZRef.current = Math.max(maxZRef.current, restored.maxZ);
				setWindows(restored.windows);
				restored.windows.forEach((w, i) => {
					if (addWindowToDesktop) addWindowToDesktop(w.id);
					const targetDesktopId = restored.desktopIds[i];
					if (targetDesktopId && moveWindowToDesktop) {
						setTimeout(() => moveWindowToDesktop(w.id, targetDesktopId), 0);
					}
				});
			});
		},
		[addWindowToDesktop, moveWindowToDesktop]
	);

	const updateWindowPayload = useCallback(
		(windowId: string, payload: WindowInitialPayload) => {
			setWindows((prev) => {
				let changed = false;
				const next = prev.map((w) => {
					if (w.id !== windowId) return w;
					const merged = mergeWindowInitialPayloadIfChanged(
						w.initialPayload,
						payload
					);
					if (merged === w.initialPayload) return w;
					changed = true;
					return { ...w, initialPayload: merged };
				});
				return changed ? next : prev;
			});
		},
		[]
	);

	const retargetFolderWindow = useCallback(
		(
			windowId: string,
			target: { folderId: string; title: string; path: string[] }
		) => {
			setWindows((prev) =>
				prev.map((w) =>
					w.id === windowId && w.type === 'folder'
						? {
								...w,
								folderId: target.folderId,
								title: target.title,
								path: target.path,
							}
						: w
				)
			);
		},
		[]
	);

	const bringWindowsIntoWorkArea = useCallback(
		(predicate?: (w: WindowState) => boolean) => {
			setWindows((prev) =>
				commitWindowsIntoWorkArea(prev, undefined, predicate)
			);
		},
		[]
	);

	return {
		windows,
		maxZ,
		snapZone,
		getSnapZoneForPosition,
		openWindow,
		closeWindow,
		closeAllWindows,
		registerBeforeClose,
		unregisterBeforeClose,
		minimizeWindow,
		minimizeAllWindows,
		maximizeWindow,
		focusWindow,
		toggleWindowAlwaysOnTop,
		moveWindow,
		commitWindowPosition,
		resizeWindow,
		navigateBack,
		snapWindow,
		updateSnapZone,
		clearSnapZone,
		restoreWindows,
		updateWindowPayload,
		retargetFolderWindow,
		bringWindowsIntoWorkArea,
	};
}

export default useWindowManager;
