/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Assistant selection rail + EWA companion shell bridge snapshots for DesktopWorkspaceContent.
 *
 * Invariants:
 * - Companion snapshot always uses includeAllVirtualDesktops: true for /ewa/companion-chat.
 * - Rail returns null when mobile, empty root selection, or no enabled actions.
 *
 * Related:
 * - utils/buildEwaCompanionShellContext.ts
 * - components/DesktopAssistantSelectionRail.tsx
 * - DesktopWorkspaceContent.tsx
 */

import * as React from 'react';
import { DesktopAssistantSelectionRail } from '../components/DesktopAssistantSelectionRail';
import type { DesktopAssistantContextAction } from '../types/desktopExpansion.types';
import type { DesktopItem, WindowState } from '../types/desktop.types';
import { buildEwaCompanionShellContextSnapshot } from '../utils/buildEwaCompanionShellContext';
import { isAssistantWindowContextSupported } from '../utils/desktopAssistantLaunchPayload';
import type { VirtualDesktop } from './useVirtualDesktops';

export type UseDesktopWorkspaceCompanionAndAssistantRailParams = {
	isMobile: boolean;
	items: readonly DesktopItem[];
	selected: ReadonlySet<string>;
	assistantContextActions: readonly DesktopAssistantContextAction[];
	openAssistantContextAction: (actionId: string) => void;
	activeDesktopWindow: WindowState | null | undefined;
	windowsRef:
		| React.RefObject<WindowState[] | null | undefined>
		| React.MutableRefObject<WindowState[]>;
	desktops: readonly VirtualDesktop[];
	activeDesktopId: string;
	activeDesktopWindowId: string | null | undefined;
};

export type UseDesktopWorkspaceCompanionAndAssistantRailResult = {
	assistantSelectionRail: React.ReactNode;
	companionShellBridge: {
		getSnapshot: () => ReturnType<typeof buildEwaCompanionShellContextSnapshot>;
	};
};

export function useDesktopWorkspaceCompanionAndAssistantRail(
	params: UseDesktopWorkspaceCompanionAndAssistantRailParams
): UseDesktopWorkspaceCompanionAndAssistantRailResult {
	const {
		isMobile,
		items,
		selected,
		assistantContextActions,
		openAssistantContextAction,
		activeDesktopWindow,
		windowsRef,
		desktops,
		activeDesktopId,
		activeDesktopWindowId,
	} = params;

	const assistantSelectionRail = React.useMemo(() => {
		if (isMobile) return null;
		const rootSelected = items.filter((i) => !i.parentId && selected.has(i.id));
		if (rootSelected.length === 0) return null;
		const actions = assistantContextActions.filter((a) => {
			if (!a.enabled) return false;
			if (a.id === 'summarize-window') {
				return (
					activeDesktopWindow != null &&
					isAssistantWindowContextSupported(activeDesktopWindow)
				);
			}
			return (
				a.id === 'explain-selection' ||
				a.id === 'create-task' ||
				a.id === 'send-to-gaf'
			);
		});
		if (actions.length === 0) return null;
		return (
			<DesktopAssistantSelectionRail
				actions={actions}
				onAction={openAssistantContextAction}
				selectionCount={rootSelected.length}
			/>
		);
	}, [
		isMobile,
		items,
		selected,
		assistantContextActions,
		openAssistantContextAction,
		activeDesktopWindow,
	]);

	const companionShellBridge = React.useMemo(
		() => ({
			getSnapshot: () =>
				buildEwaCompanionShellContextSnapshot({
					allWindows: windowsRef.current ?? [],
					desktops,
					activeDesktopId,
					activeWindowId: activeDesktopWindowId,
					includeAllVirtualDesktops: true,
					maxWindows: 40,
				}),
		}),
		[desktops, activeDesktopId, activeDesktopWindowId, windowsRef]
	);

	return { assistantSelectionRail, companionShellBridge };
}
