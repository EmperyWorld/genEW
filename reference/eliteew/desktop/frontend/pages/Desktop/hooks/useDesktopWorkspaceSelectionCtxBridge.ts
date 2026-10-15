import { useCallback, useRef } from 'react';
import { coerceDesktopSelectionSet } from '../context/DesktopStateContext';
import type { ContextMenuState } from '../types/desktop.types';

export function useDesktopWorkspaceSelectionCtxBridge(params: {
	selectedRaw: unknown;
	ctx: ContextMenuState;
	setSelectedToStore: (selected: Set<string>) => void;
	setCtxToStore: (ctx: ContextMenuState) => void;
}) {
	const { selectedRaw, ctx, setSelectedToStore, setCtxToStore } = params;

	const selected = coerceDesktopSelectionSet(selectedRaw);
	const selectedSyncRef = useRef<Set<string>>(selected);
	selectedSyncRef.current = selected;

	const setSelected = useCallback(
		(updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
			const prev = coerceDesktopSelectionSet(selectedSyncRef.current);
			const next =
				typeof updater === 'function' ? updater(new Set(prev)) : updater;
			const resolved = coerceDesktopSelectionSet(next ?? new Set<string>());
			selectedSyncRef.current = resolved;
			setSelectedToStore(resolved);
		},
		[setSelectedToStore]
	);

	const setCtx = useCallback(
		(
			updater: ContextMenuState | ((prev: ContextMenuState) => ContextMenuState)
		) => {
			const next = typeof updater === 'function' ? updater(ctx) : updater;
			setCtxToStore(next);
		},
		[ctx, setCtxToStore]
	);

	return {
		selected,
		selectedSyncRef,
		setSelected,
		ctx,
		setCtx,
	};
}
