/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Owns progressive-disclosure state and intent synchronization for Start Menu
 * tabs, keeping close and Escape unwind ordering outside rendered sections.
 *
 * Invariants:
 * - An intent nonce is consumed at most once and expands the required disclosure.
 * - Work intents also expand advanced work surfaces (`showWorkAdvanced`).
 * - Closing the menu resets all progressive-disclosure layers.
 *
 * Related:
 * - ../StartMenu.tsx
 * - ./__tests__/useStartMenuDisclosure.test.ts
 * - ../../types/desktopStartMenu.ts
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StartMenuTab } from '../../types/desktopStartMenu';

export type StartMenuIntent = { tab: StartMenuTab; nonce: number };

export function useStartMenuDisclosure(
	isOpen: boolean,
	intent: StartMenuIntent | undefined,
	setActiveTab: (tab: StartMenuTab) => void,
	setSearch: (search: string) => void
) {
	const [showMoreTabs, setShowMoreTabs] = useState(false);
	const [showLibraryDiscovery, setShowLibraryDiscovery] = useState(false);
	const [showWorkAdvanced, setShowWorkAdvanced] = useState(false);
	const lastIntentNonceRef = useRef(0);

	const resetDisclosure = useCallback(() => {
		setShowMoreTabs(false);
		setShowLibraryDiscovery(false);
		setShowWorkAdvanced(false);
	}, []);

	useEffect(() => {
		if (isOpen) return;
		resetDisclosure();
	}, [isOpen, resetDisclosure]);

	useEffect(() => {
		if (!isOpen || !intent || intent.nonce <= lastIntentNonceRef.current) {
			return;
		}
		lastIntentNonceRef.current = intent.nonce;
		if (
			intent.tab === 'work' ||
			intent.tab === 'pinned' ||
			intent.tab === 'all'
		) {
			setShowMoreTabs(true);
		}
		if (intent.tab === 'work') {
			setShowWorkAdvanced(true);
		}
		if (intent.tab === 'recent') {
			setShowLibraryDiscovery(true);
		}
		setActiveTab(intent.tab);
		setSearch('');
	}, [intent, isOpen, setActiveTab, setSearch]);

	return {
		showMoreTabs,
		setShowMoreTabs,
		showLibraryDiscovery,
		setShowLibraryDiscovery,
		showWorkAdvanced,
		setShowWorkAdvanced,
		resetDisclosure,
		lastIntentNonceRef,
	};
}
