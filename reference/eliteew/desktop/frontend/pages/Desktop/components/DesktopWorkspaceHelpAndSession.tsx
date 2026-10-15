/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Idle-safe help/session chrome near the taskbar (no QuickSearch/TaskSwitcher imports).
 *
 * Invariants:
 * - Must stay out of the search-overlays chunk so idle `#desktop` does not pull QuickSearch.
 *
 * Related:
 * - DesktopWorkspaceSearchOverlays.tsx, DesktopWorkspaceShellLayout.tsx
 */

import * as React from 'react';
import AuthStatusIndicator from '../../../components/ui/AuthStatusIndicator';
import { useSocketConnectionState } from '@/services/communication/socketConnectionStore';
import type { DesktopWindowStyle } from '@/types/profile';
import { ShortcutsHelpModal } from './ShortcutsHelpModal';

export interface DesktopWorkspaceHelpAndSessionProps {
	shortcutsHelp: { isOpen: boolean; onClose: () => void };
	showSessionInfoPanel: boolean;
	shellWindowStyle: DesktopWindowStyle;
	onCloseSessionPanel: () => void;
	onOpenProfile?: () => void;
}

export const DesktopWorkspaceHelpAndSession: React.FC<
	DesktopWorkspaceHelpAndSessionProps
> = ({
	shortcutsHelp,
	showSessionInfoPanel,
	shellWindowStyle,
	onCloseSessionPanel,
	onOpenProfile,
}) => {
	const { connected: socketConnected } = useSocketConnectionState();

	return (
		<>
			<ShortcutsHelpModal
				isOpen={shortcutsHelp.isOpen}
				onClose={shortcutsHelp.onClose}
			/>
			{showSessionInfoPanel && (
				<AuthStatusIndicator
					mode="floating"
					defaultExpanded
					shellWindowStyle={shellWindowStyle}
					onFloatingPanelClose={onCloseSessionPanel}
					realtimeConnected={socketConnected}
					onOpenProfile={onOpenProfile}
				/>
			)}
		</>
	);
};
