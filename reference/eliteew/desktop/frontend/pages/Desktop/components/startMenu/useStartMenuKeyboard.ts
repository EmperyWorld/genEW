/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Keyboard surface for Start Menu: Escape layer unwind, Tab cycle, and
 * arrow/Home/End navigation across searchable app cards.
 *
 * Invariants:
 * - Escape order: appCtx → search clear → workAdvanced → libraryDiscovery →
 *   moreTabs → shortcuts → onClose (capture `onLayer` skips appCtx/onClose).
 * - ArrowDown/Home from non-app focus lands on the first app card.
 * - Categories tab uses compact-grid step when `cols < COLS_DEFAULT`.
 *
 * Related:
 * - ../StartMenu.tsx
 * - ../../hooks/useShellCaptureKeyboard.ts
 * - ../__tests__/StartMenu.keyboard.contract.test.ts
 * - ./__tests__/unwindStartMenuEscapeLayer.test.ts
 */

import * as React from 'react';
import { useCallback, type RefObject } from 'react';
import { consumeEscapeForSearchClear } from '../../hooks/useShellCaptureKeyboard';
import type { StartMenuTab } from '../../types/desktopStartMenu';

const COLS_DEFAULT = 5;

export type StartMenuEscapeLayerState = {
	search: string;
	showWorkAdvanced: boolean;
	showLibraryDiscovery: boolean;
	showMoreTabs: boolean;
	showShortcuts: boolean;
};

export type StartMenuEscapeLayerActions = {
	clearSearch: () => void;
	setShowWorkAdvanced: (value: boolean) => void;
	setShowLibraryDiscovery: (value: boolean) => void;
	setShowMoreTabs: (value: boolean) => void;
	setShowShortcuts: (value: boolean) => void;
};

/**
 * Shared Escape unwind for progressive layers (search + disclosure + shortcuts).
 * Used by panel keydown and `useShellCaptureEscape` `onLayer` so order cannot drift.
 * Returns true when a layer consumed Escape (caller must not close the menu).
 */
export function unwindStartMenuEscapeLayer(
	state: StartMenuEscapeLayerState,
	actions: StartMenuEscapeLayerActions
): boolean {
	if (consumeEscapeForSearchClear(state.search, actions.clearSearch)) {
		return true;
	}
	if (state.showWorkAdvanced) {
		actions.setShowWorkAdvanced(false);
		return true;
	}
	if (state.showLibraryDiscovery) {
		actions.setShowLibraryDiscovery(false);
		return true;
	}
	if (state.showMoreTabs) {
		actions.setShowMoreTabs(false);
		return true;
	}
	if (state.showShortcuts) {
		actions.setShowShortcuts(false);
		return true;
	}
	return false;
}

export type UseStartMenuKeyboardOptions = {
	panelRef: RefObject<HTMLElement | null>;
	appCtx: unknown;
	setAppCtx: (value: null) => void;
	search: string;
	setSearch: (value: string) => void;
	showWorkAdvanced: boolean;
	setShowWorkAdvanced: (value: boolean) => void;
	showLibraryDiscovery: boolean;
	setShowLibraryDiscovery: (value: boolean) => void;
	showMoreTabs: boolean;
	setShowMoreTabs: (value: boolean) => void;
	showShortcuts: boolean;
	setShowShortcuts: (value: boolean) => void;
	onClose: () => void;
	activeTab: StartMenuTab;
	cols: number;
};

export function useStartMenuKeyboard({
	panelRef,
	appCtx,
	setAppCtx,
	search,
	setSearch,
	showWorkAdvanced,
	setShowWorkAdvanced,
	showLibraryDiscovery,
	setShowLibraryDiscovery,
	showMoreTabs,
	setShowMoreTabs,
	showShortcuts,
	setShowShortcuts,
	onClose,
	activeTab,
	cols,
}: UseStartMenuKeyboardOptions) {
	const getFocusables = useCallback(() => {
		const el = panelRef.current;
		if (!el) return [];
		const nodes = el.querySelectorAll<HTMLElement>(
			'input:not([disabled]), button:not([disabled])'
		);
		return Array.from(nodes);
	}, [panelRef]);

	const captureEscapeOnLayer = useCallback(() => {
		return unwindStartMenuEscapeLayer(
			{
				search,
				showWorkAdvanced,
				showLibraryDiscovery,
				showMoreTabs,
				showShortcuts,
			},
			{
				clearSearch: () => setSearch(''),
				setShowWorkAdvanced,
				setShowLibraryDiscovery,
				setShowMoreTabs,
				setShowShortcuts,
			}
		);
	}, [
		search,
		showWorkAdvanced,
		showLibraryDiscovery,
		showMoreTabs,
		showShortcuts,
		setSearch,
		setShowWorkAdvanced,
		setShowLibraryDiscovery,
		setShowMoreTabs,
		setShowShortcuts,
	]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				if (appCtx) {
					setAppCtx(null);
					return;
				}
				if (captureEscapeOnLayer()) {
					return;
				}
				onClose();
				return;
			}

			const focusables = getFocusables();
			if (focusables.length === 0) {
				return;
			}

			const appIndices = focusables
				.map((el, i) =>
					(el as HTMLElement).dataset.startAppId != null &&
					(el as HTMLElement).dataset.startAppId !== ''
						? i
						: -1
				)
				.filter((i) => i >= 0);

			const currentIndex = focusables.indexOf(
				document.activeElement as HTMLElement
			);

			if (e.key === 'Tab') {
				e.preventDefault();
				const next = e.shiftKey
					? (currentIndex - 1 + focusables.length) % focusables.length
					: (currentIndex + 1) % focusables.length;
				(focusables[next] as HTMLInputElement | HTMLButtonElement)?.focus();
				return;
			}

			const len = appIndices.length;
			if (len === 0) {
				return;
			}

			const posInApps = appIndices.indexOf(currentIndex);
			if (posInApps < 0) {
				if (e.key === 'ArrowDown' || e.key === 'Home') {
					e.preventDefault();
					focusables[appIndices[0] as number]?.focus();
					return;
				}
				if (e.key === 'ArrowUp' || e.key === 'End') {
					e.preventDefault();
					focusables[appIndices[len - 1] as number]?.focus();
					return;
				}
				return;
			}

			const isCategories = activeTab === 'categories';
			const useCompactGridNavigation = cols < COLS_DEFAULT;

			if (e.key === 'Home') {
				e.preventDefault();
				focusables[appIndices[0] as number]?.focus();
				return;
			}
			if (e.key === 'End') {
				e.preventDefault();
				focusables[appIndices[len - 1] as number]?.focus();
				return;
			}

			if (e.key === 'ArrowRight') {
				e.preventDefault();
				const next = (posInApps + 1) % len;
				focusables[appIndices[next] as number]?.focus();
				return;
			}
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				const next = (posInApps - 1 + len) % len;
				focusables[appIndices[next] as number]?.focus();
				return;
			}

			if (isCategories) {
				if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
					e.preventDefault();
					const direction = e.key === 'ArrowDown' ? 1 : -1;
					const step = useCompactGridNavigation ? Math.max(cols, 1) : 1;
					const candidate = posInApps + direction * step;
					const next = useCompactGridNavigation
						? Math.min(Math.max(candidate, 0), len - 1)
						: (candidate + len) % len;
					focusables[appIndices[next] as number]?.focus();
				}
				return;
			}

			if (e.key === 'ArrowDown') {
				e.preventDefault();
				const next = Math.min(posInApps + cols, len - 1);
				focusables[appIndices[next] as number]?.focus();
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				const next = Math.max(posInApps - cols, 0);
				focusables[appIndices[next] as number]?.focus();
			}
		},
		[
			appCtx,
			setAppCtx,
			captureEscapeOnLayer,
			onClose,
			getFocusables,
			activeTab,
			cols,
		]
	);

	return {
		handleKeyDown,
		captureEscapeOnLayer,
		getFocusables,
	};
}
