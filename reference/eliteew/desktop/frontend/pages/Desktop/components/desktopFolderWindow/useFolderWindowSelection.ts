/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Multi-select Set state for Desktop folder window library rows and nested desktop shortcuts.
 *
 * Invariants:
 * - Selection sets are independent per hook instance (library vs nested).
 *
 * Related:
 * - DesktopFolderWindow.tsx
 */

import { useCallback, useState } from 'react';

export function useFolderWindowSelection() {
	const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
	const clear = useCallback(() => {
		setSelectedIds(new Set());
	}, []);
	const setOne = useCallback((id: string) => {
		setSelectedIds(new Set([id]));
	}, []);
	const toggle = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const n = new Set(prev);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});
	}, []);
	const addAll = useCallback((ids: string[]) => {
		setSelectedIds((prev) => {
			const n = new Set(prev);
			for (const id of ids) n.add(id);
			return n;
		});
	}, []);
	const setAll = useCallback((ids: Iterable<string>) => {
		setSelectedIds(new Set(ids));
	}, []);
	return {
		selectedIds,
		setSelectedIds,
		clear,
		setOne,
		toggle,
		addAll,
		setAll,
	};
}
