/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Layers on the desktop canvas: scene decor, welcome, floating widget, sync, grid,
 * context menus, icons, empty state, rubber-band selection. No window layer / taskbar.
 *
 * Invariants:
 * - Floating widget placement hints (`iconReservedViewportBounds`) apply only to free viewport coords.
 * - Icon layer props are passed through unchanged; motion policy lives in `DesktopIconLayer`.
 *
 * Related:
 * - `hooks/useDesktopWorkspaceShellCanvasProps.ts`
 */
import { AnimatePresence } from 'framer-motion';
import * as React from 'react';
import type { DesktopWidgetsStyle } from '../../../types/profile';
import {
	DESKTOP_GRID,
	DESKTOP_GRID_STEPS,
	type GridStepPreference,
	type IconSizePreference,
} from '../constants';
import type { ViewportRect } from '../utils/desktopFloatingWidgetPlacement';
import type { DesktopItem } from '../types/desktop.types';
import type { DesktopAssistantContextAction } from '../types/desktopExpansion.types';
import type { DesktopIconLayerProps } from './DesktopIconLayer';
import { DesktopIconLayer } from './DesktopIconLayer';
import {
	DesktopSyncStatus,
	type DesktopSyncStatusProps,
} from './DesktopSyncStatus';
import {
	DesktopWelcomeScreen,
	type DesktopWelcomeCompleteOptions,
} from './DesktopWelcomeScreen';
import {
	DesktopWorkspaceFloatingWidget,
	type DesktopWorkspaceFloatingWidgetProps,
} from './DesktopWorkspaceFloatingWidget';
import { DesktopWorkspaceEmptyState } from './DesktopWorkspaceEmptyState';
import { DesktopWorkspaceOfflineBanner } from './DesktopWorkspaceOfflineBanner';
import {
	DesktopWorkspaceSceneDecor,
	type DesktopWorkspaceSceneDecorProps,
} from './DesktopWorkspaceSceneDecor';
import { EnhancedContextMenu } from './EnhancedContextMenu';
import { GridOverlay } from './GridOverlay';
import { ItemPropertiesModal } from './ItemPropertiesModal';
import { SelectionBox } from './SelectionBox';

import {
	DesktopWidgetsPanel,
	type DesktopWidgetsPanelProps,
} from './DesktopWidgetsPanel';

export interface DesktopWorkspaceCanvasProps {
	sceneDecor: DesktopWorkspaceSceneDecorProps;
	welcome: {
		show: boolean;
		onComplete: (options: DesktopWelcomeCompleteOptions) => void;
	};
	showFloatingWidget: boolean;
	floatingWidget: {
		performance: DesktopWorkspaceFloatingWidgetProps['performance'];
		suspendTelemetry?: boolean;
		deferRealtimeUpdates?: boolean;
		windowCount: number;
		notifications: DesktopWorkspaceFloatingWidgetProps['notifications'];
		avatarUrl: string | null;
		onOpenProfile: () => void;
		onHide: () => void;
		onOpenPerformanceSettings?: () => void;
		onOpenNotificationCenter?: () => void;
		widgetsStyle: DesktopWidgetsStyle;
		widgetPosition: { x: number; y: number };
		onWidgetPositionCommit?: (next: { x: number; y: number }) => void;
		/** Viewport bounds of the desktop icon grid; used to nudge free-positioned widget. */
		iconReservedViewportBounds?: ViewportRect | null;
	};
	sync: Pick<
		DesktopSyncStatusProps,
		| 'isOnline'
		| 'isSyncing'
		| 'error'
		| 'tabConflictDetected'
		| 'staleShellStateConflict'
		| 'shellStatePipelinePhase'
		| 'onRefresh'
		| 'onDismissConflict'
		| 'onRecoverStaleShellState'
		| 'onRetry'
		| 'pendingQueuedPatches'
		| 'onPersistQueueRetry'
	>;
	isDraggingIcon: boolean;
	gridStep: GridStepPreference;
	enhancedContextMenu: React.ComponentProps<typeof EnhancedContextMenu>;
	properties: {
		item: DesktopItem | null;
		pathLabel: string;
		onClose: () => void;
		assistantActions: DesktopAssistantContextAction[];
		onAssistantAction: (actionId: string) => void;
	};
	iconLayer: DesktopIconLayerProps;
	showEmptyState: boolean;
	emptyState: {
		title: string;
		description: string;
		appStoreLabel: string;
		onOpenAppStore: () => void;
	};
	selectionBox: {
		items: DesktopItem[];
		onSelectionChange: (ids: Set<string> | null) => void;
		containerRef: React.RefObject<HTMLElement | null>;
		selectedIds: Set<string>;
		iconSize: IconSizePreference;
	};
	/** Закреплённая панель слотов виджетов; `null` — не показывать. */
	widgetsPanel: DesktopWidgetsPanelProps | null;
}

export const DesktopWorkspaceCanvas: React.FC<DesktopWorkspaceCanvasProps> = ({
	sceneDecor,
	welcome,
	showFloatingWidget,
	floatingWidget,
	sync,
	isDraggingIcon,
	gridStep,
	enhancedContextMenu,
	properties,
	iconLayer,
	showEmptyState,
	emptyState,
	selectionBox,
	widgetsPanel,
}) => (
	<>
		<DesktopWorkspaceSceneDecor {...sceneDecor} />
		<AnimatePresence>
			{welcome.show && <DesktopWelcomeScreen onComplete={welcome.onComplete} />}
		</AnimatePresence>

		{showFloatingWidget && (
			<DesktopWorkspaceFloatingWidget
				performance={floatingWidget.performance}
				suspendTelemetry={floatingWidget.suspendTelemetry}
				deferRealtimeUpdates={floatingWidget.deferRealtimeUpdates}
				windowCount={floatingWidget.windowCount}
				notifications={floatingWidget.notifications}
				avatarUrl={floatingWidget.avatarUrl}
				onOpenProfile={floatingWidget.onOpenProfile}
				onHide={floatingWidget.onHide}
				onOpenPerformanceSettings={floatingWidget.onOpenPerformanceSettings}
				onOpenNotificationCenter={floatingWidget.onOpenNotificationCenter}
				widgetsStyle={floatingWidget.widgetsStyle}
				widgetPosition={floatingWidget.widgetPosition}
				onWidgetPositionCommit={floatingWidget.onWidgetPositionCommit}
				iconReservedViewportBounds={floatingWidget.iconReservedViewportBounds}
			/>
		)}

		{!sync.isOnline ? (
			<DesktopWorkspaceOfflineBanner onRetry={sync.onRetry} />
		) : null}

		<DesktopSyncStatus
			isOnline={sync.isOnline}
			isSyncing={sync.isSyncing}
			shellStatePipelinePhase={sync.shellStatePipelinePhase}
			error={sync.error}
			tabConflictDetected={sync.tabConflictDetected}
			staleShellStateConflict={sync.staleShellStateConflict}
			onRefresh={sync.onRefresh}
			onDismissConflict={sync.onDismissConflict}
			onRecoverStaleShellState={sync.onRecoverStaleShellState}
			onRetry={sync.onRetry}
			pendingQueuedPatches={sync.pendingQueuedPatches}
			onPersistQueueRetry={sync.onPersistQueueRetry}
		/>

		<GridOverlay
			visible={isDraggingIcon}
			gridSize={DESKTOP_GRID_STEPS[gridStep]}
			offset={DESKTOP_GRID.OFFSET}
		/>

		<EnhancedContextMenu
			key={
				enhancedContextMenu.isVisible
					? `${enhancedContextMenu.position.x}-${enhancedContextMenu.position.y}-${enhancedContextMenu.contextType}`
					: 'desktop-ctx-hidden'
			}
			{...enhancedContextMenu}
		/>

		{properties.item && (
			<ItemPropertiesModal
				item={properties.item}
				pathLabel={properties.pathLabel}
				onClose={properties.onClose}
				assistantActions={properties.assistantActions}
				onAssistantAction={properties.onAssistantAction}
			/>
		)}

		<DesktopIconLayer {...iconLayer} />

		{showEmptyState && (
			<DesktopWorkspaceEmptyState
				title={emptyState.title}
				description={emptyState.description}
				appStoreLabel={emptyState.appStoreLabel}
				onOpenAppStore={emptyState.onOpenAppStore}
			/>
		)}

		<SelectionBox
			enabled={true}
			items={selectionBox.items}
			onSelectionChange={selectionBox.onSelectionChange}
			containerRef={selectionBox.containerRef}
			selectedIds={selectionBox.selectedIds}
			iconSize={selectionBox.iconSize}
		/>
		{widgetsPanel ? <DesktopWidgetsPanel {...widgetsPanel} /> : null}
	</>
);
