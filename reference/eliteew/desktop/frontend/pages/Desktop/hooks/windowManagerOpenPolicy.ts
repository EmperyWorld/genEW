/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure open-window instance policy for desktop window manager: normalize per-app limits and dedupe/focus
 * existing windows before creating a new instance (folders, single-instance apps, DocEditor targets, caps).
 *
 * Invariants:
 * - `forceNew` bypasses default reuse; instance caps still focus the top same-app window when at limit.
 * - DocEditor reuse matches by resolved document/unified-content target, not window id alone.
 *
 * Related:
 * - `hooks/useWindowManager.ts`, `utils/desktopOpenPayloads.ts`
 * - `documentation/product/desktop/DESKTOP-STATE-PERSISTENCE.md`
 */

import {
	mergeDocEditorPayload,
	resolveDocEditorPayloadTarget,
	windowPayloadContainsDocEditorTarget,
} from '../utils/desktopOpenPayloads';
import type {
	DesktopItem,
	WindowInitialPayload,
	WindowState,
} from '../types/desktop.types';

export type WindowInstancePolicy = {
	allowMultiple: boolean;
	maxInstances: number;
};

export type ResolveOpenWindowDedupeInput = {
	prev: WindowState[];
	item: DesktopItem;
	forceNew: boolean;
	instancePolicy?: WindowInstancePolicy;
	initialPayload?: WindowInitialPayload;
	nextZ: number;
};

export type OpenWindowReuseReason = 'same_app' | 'same_document';

export type ResolveOpenWindowDedupeResult =
	| { action: 'reuse'; windows: WindowState[]; reuseReason: OpenWindowReuseReason }
	| { action: 'at_limit'; windows: WindowState[]; maxInstances: number }
	| { action: 'open_new' };

export function normalizeWindowInstanceLimit(
	policy: WindowInstancePolicy | undefined
): number {
	if (!policy?.allowMultiple) {
		return 1;
	}
	const raw = Number(policy.maxInstances);
	if (!Number.isFinite(raw)) {
		return 1;
	}
	return Math.max(1, Math.trunc(raw));
}

function raiseFocusedWindow(
	prev: WindowState[],
	windowId: string,
	nextZ: number,
	initialPayload?: WindowInitialPayload
): WindowState[] {
	return prev.map((w) =>
		w.id === windowId
			? {
					...w,
					isMinimized: false,
					isMinimizing: false,
					zIndex: nextZ,
					...(initialPayload != null && {
						initialPayload: {
							...w.initialPayload,
							...initialPayload,
						},
					}),
				}
			: w
	);
}

function collectSameAppWindows(
	prev: WindowState[],
	item: DesktopItem
): WindowState[] {
	return prev
		.filter(
			(w) =>
				w.type === 'app' &&
				(w.folderId === item.id ||
					(Boolean(item.appComponent) && w.appComponent === item.appComponent))
		)
		.sort((a, b) => b.zIndex - a.zIndex);
}

export function resolveOpenWindowDedupe(
	input: ResolveOpenWindowDedupeInput
): ResolveOpenWindowDedupeResult {
	const { prev, item, forceNew, instancePolicy, initialPayload, nextZ } = input;
	const maxInstances = normalizeWindowInstanceLimit(instancePolicy);

	const shouldFocusExistingByDefault =
		!forceNew && (item.type !== 'app' || maxInstances <= 1);
	if (shouldFocusExistingByDefault) {
		const existing = prev.find((w) => w.folderId === item.id);
		if (existing) {
			return {
				action: 'reuse',
				reuseReason: 'same_app',
				windows: raiseFocusedWindow(prev, existing.id, nextZ, initialPayload),
			};
		}
	}

	if (item.appComponent === 'DocEditor' && initialPayload) {
		const incomingTarget = resolveDocEditorPayloadTarget(initialPayload);
		if (incomingTarget) {
			const existingDocWindow = prev.find(
				(w) =>
					w.appComponent === 'DocEditor' &&
					windowPayloadContainsDocEditorTarget(w.initialPayload, incomingTarget)
			);
			if (existingDocWindow) {
				return {
					action: 'reuse',
					reuseReason: 'same_document',
					windows: prev.map((w) =>
						w.id === existingDocWindow.id
							? {
									...w,
									isMinimized: false,
									isMinimizing: false,
									zIndex: nextZ,
									initialPayload: mergeDocEditorPayload(
										w.initialPayload,
										incomingTarget
									),
								}
							: w
					),
				};
			}
		}
	}

	if (item.type === 'app') {
		const sameAppWindows = collectSameAppWindows(prev, item);
		if (sameAppWindows.length >= maxInstances) {
			const fallback = sameAppWindows[0];
			if (fallback) {
				return {
					action: 'at_limit',
					maxInstances,
					windows: raiseFocusedWindow(prev, fallback.id, nextZ, initialPayload),
				};
			}
		}
	}

	return { action: 'open_new' };
}
