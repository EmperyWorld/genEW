/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * React context bridge so **EwaApp** (nested window content) reads a live **`getSnapshot()`** compiled from
 * `DesktopWorkspaceContent` (`windowsRef` + virtual desktops). Feeds `/ewa/companion-chat` `{ shell_context }`.
 *
 * Invariants:
 * - Default Provider is noop (`getSnapshot` → `null`) when not under Desktop shell.
 * - Snapshot is fetched at send/stream time — not subscribed for every frame.
 *
 * Related:
 * - src/pages/Desktop/utils/buildEwaCompanionShellContext.ts
 * - DesktopWorkspaceShellProviders.tsx
 */

import type { EwaCompanionShellContextV1 } from '@/pages/Desktop/utils/buildEwaCompanionShellContext';
import * as React from 'react';
import { createContext, useContext } from 'react';

export type EwaCompanionShellBridgeValue = {
	getSnapshot: () => EwaCompanionShellContextV1 | null;
};

const defaultValue: EwaCompanionShellBridgeValue = {
	getSnapshot: () => null,
};

export const EwaCompanionShellBridgeContext =
	createContext<EwaCompanionShellBridgeValue>(defaultValue);

export function EwaCompanionShellBridgeProvider({
	value,
	children,
}: {
	value: EwaCompanionShellBridgeValue;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<EwaCompanionShellBridgeContext.Provider value={value}>
			{children}
		</EwaCompanionShellBridgeContext.Provider>
	);
}

export function useEwaCompanionShellBridge(): EwaCompanionShellBridgeValue {
	return useContext(EwaCompanionShellBridgeContext);
}
