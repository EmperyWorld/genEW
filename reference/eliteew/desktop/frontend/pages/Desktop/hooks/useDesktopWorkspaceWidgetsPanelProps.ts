/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T32 widgets panel bridge — openWidgetSlotExpanded callback and memoized
 * DesktopWidgetsPanelProps for the canvas layout slice.
 *
 * Invariants:
 * - Returns null panel props when mobile or widgets panel disabled in config.
 * - Slot expansion routes through openDesktopAppByComponent with stable payloads.
 *
 * Related:
 * - DesktopWorkspaceContent.tsx
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import * as React from 'react';
import type { DesktopWidgetsPanelProps } from '../components/DesktopWidgetsPanel';
import type { DesktopWidgetsStyle } from '@/types/profile';
import type { DesktopWidgetLayoutSlot } from '../types/desktopExpansion.types';
import type { RecentFile } from '../types/desktop.types';
import { CONTENT_MANAGER_WINDOW_PAYLOAD_RESET } from '../utils/desktopOpenPayloads';
import { normalizeDesktopWidgetsPanelPosition } from '../utils/normalizeDesktopWidgetsPanelPosition';
import type { useDesktopExpansionSettings } from './useDesktopExpansionSettings';

export function useDesktopWorkspaceWidgetsPanelProps(params: {
	isMobile: boolean;
	config: {
		show_widgets_panel?: boolean;
		widgets_panel_position?: DesktopWidgetsPanelProps['panelPosition'];
		compact_widgets?: boolean;
	} | null;
	expansionSettings: Pick<
		ReturnType<typeof useDesktopExpansionSettings>,
		| 'widgetsLayout'
		| 'workspaceProfiles'
		| 'appCollections'
		| 'contentShortcuts'
		| 'setWidgetsPanelOffset'
		| 'setWidgetSlotPosition'
		| 'nudgeAllWidgetSlotPositions'
		| 'ensureFreeWidgetSlotPositions'
	>;
	activeDesktopId: string;
	desktopWidgetsStyle: DesktopWidgetsStyle;
	recentLibraryOpened: RecentFile[];
	desktopUnreadCount: number;
	markAllAsRead: () => void;
	bumpNotificationCenterOpen: () => void;
	openDesktopAppByComponent: (
		component: string,
		opts?: { initialPayload?: Record<string, unknown> }
	) => void;
	openContentShortcut: (id: string) => void;
	openAppCollection: (id: string) => void;
	openRecentDesktopFile: (file: RecentFile) => void;
}): {
	desktopWidgetsPanelProps: DesktopWidgetsPanelProps | null;
	openWidgetSlotExpanded: (type: DesktopWidgetLayoutSlot['type']) => void;
} {
	const {
		isMobile,
		config,
		expansionSettings,
		activeDesktopId,
		desktopWidgetsStyle,
		recentLibraryOpened,
		desktopUnreadCount,
		markAllAsRead,
		bumpNotificationCenterOpen,
		openDesktopAppByComponent,
		openContentShortcut,
		openAppCollection,
		openRecentDesktopFile,
	} = params;

	const openWidgetSlotExpanded = React.useCallback(
		(type: DesktopWidgetLayoutSlot['type']) => {
			switch (type) {
				case 'notes':
					openDesktopAppByComponent('DesktopWidgetShelfApp', {
						initialPayload: { widgetShelfTab: 'notes' },
					});
					break;
				case 'todos':
					openDesktopAppByComponent('DesktopWidgetShelfApp', {
						initialPayload: { widgetShelfTab: 'todos' },
					});
					break;
				case 'favorites':
					openDesktopAppByComponent('DesktopDashboardFavoritesApp');
					break;
				case 'ewdesk':
					openDesktopAppByComponent('EWDeskApp');
					break;
				case 'notifications':
					openDesktopAppByComponent('NotificationsApp');
					break;
				case 'now-playing':
					openDesktopAppByComponent('MusicPlayer');
					break;
				case 'project-shortcuts':
				case 'recent-content':
					openDesktopAppByComponent('ContentManagerPro', {
						initialPayload: { ...CONTENT_MANAGER_WINDOW_PAYLOAD_RESET },
					});
					break;
				default:
					break;
			}
		},
		[openDesktopAppByComponent]
	);

	const desktopWidgetsPanelProps =
		React.useMemo((): DesktopWidgetsPanelProps | null => {
			if (isMobile || !config?.show_widgets_panel) {
				return null;
			}
			const panelPosition = normalizeDesktopWidgetsPanelPosition(
				config.widgets_panel_position
			);
			return {
				widgetsLayout: expansionSettings.widgetsLayout,
				workspaceProfiles: expansionSettings.workspaceProfiles,
				activeDesktopId,
				panelPosition,
				compactWidgetsGlobal: config.compact_widgets ?? false,
				widgetsStyle: desktopWidgetsStyle,
				appCollections: expansionSettings.appCollections,
				contentShortcuts: expansionSettings.contentShortcuts,
				recentOpened: recentLibraryOpened,
				desktopUnreadCount,
				markAllAsRead,
				onOpenNotificationCenter: bumpNotificationCenterOpen,
				onOpenEwDesk: () => {
					openDesktopAppByComponent('EWDeskApp');
				},
				onOpenMusicPlayer: () => {
					openDesktopAppByComponent('MusicPlayer');
				},
				onOpenContentShortcut: openContentShortcut,
				onOpenAppCollection: openAppCollection,
				onOpenRecentFile: openRecentDesktopFile,
				panelOffset: {
					x: expansionSettings.widgetsLayout.panelOffset?.x ?? 0,
					y: expansionSettings.widgetsLayout.panelOffset?.y ?? 0,
				},
				onPanelOffsetCommit: (next) => {
					void expansionSettings.setWidgetsPanelOffset(next);
				},
				onSlotPositionCommit: (slotId, next) => {
					void expansionSettings.setWidgetSlotPosition(slotId, next);
				},
				onAllWidgetSlotsOffsetCommit: (delta) => {
					void expansionSettings.nudgeAllWidgetSlotPositions(delta);
				},
				onEnsureFreeSlotPositions: () => {
					void expansionSettings.ensureFreeWidgetSlotPositions();
				},
				onOpenWidgetSlotExpanded: openWidgetSlotExpanded,
			};
		}, [
			isMobile,
			config?.show_widgets_panel,
			config?.widgets_panel_position,
			config?.compact_widgets,
			expansionSettings.widgetsLayout,
			expansionSettings.workspaceProfiles,
			expansionSettings.appCollections,
			expansionSettings.contentShortcuts,
			expansionSettings.setWidgetsPanelOffset,
			expansionSettings.setWidgetSlotPosition,
			expansionSettings.nudgeAllWidgetSlotPositions,
			expansionSettings.ensureFreeWidgetSlotPositions,
			openWidgetSlotExpanded,
			activeDesktopId,
			desktopWidgetsStyle,
			recentLibraryOpened,
			desktopUnreadCount,
			markAllAsRead,
			bumpNotificationCenterOpen,
			openDesktopAppByComponent,
			openContentShortcut,
			openAppCollection,
			openRecentDesktopFile,
		]);

	return { desktopWidgetsPanelProps, openWidgetSlotExpanded };
}
