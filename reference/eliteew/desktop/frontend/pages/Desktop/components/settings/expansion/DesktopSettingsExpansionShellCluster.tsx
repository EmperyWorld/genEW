/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shell tab body facade: VD, windows/widgets, apps, sync, and expansion cards.
 *
 * Invariants:
 * - Anchor ids match `DESKTOP_SETTINGS_SHELL_ANCHORS`.
 *
 * Related:
 * - `DesktopSettingsShellTab.tsx`
 * - `DesktopSettingsExpansionSection.tsx`
 */

import type { FC } from 'react';
import { DESKTOP_SETTINGS_SHELL_ANCHORS } from '../../../constants/desktopSettingsShellAnchors';
import { buildDesktopSettingsFieldElementId } from '../../../utils/desktopSettingsFieldElementIds';
import { DesktopSettingsMenuModeCard } from '../DesktopSettingsMenuModeCard';
import { DesktopSettingsMotionSection } from '../DesktopSettingsMotionSection';
import { DesktopSettingsShellSyncPrefsCard } from '../DesktopSettingsShellSyncPrefsCard';
import { ExpansionSettingsSection } from './DesktopSettingsExpansionSection';
import { DesktopSettingsExpansionShellAppsCard } from './DesktopSettingsExpansionShellAppsCard';
import { DesktopSettingsExpansionShellSyncDataCard } from './DesktopSettingsExpansionShellSyncDataCard';
import { DesktopSettingsExpansionShellVirtualDesktopsCard } from './DesktopSettingsExpansionShellVirtualDesktopsCard';
import { DesktopSettingsExpansionShellWindowsWidgetsSection } from './DesktopSettingsExpansionShellWindowsWidgetsSection';
import type { DesktopSettingsExpansionShellClusterProps } from './desktopSettingsExpansionShellCluster.types';

export const DesktopSettingsExpansionShellCluster: FC<
	DesktopSettingsExpansionShellClusterProps
> = (props) => {
	const {
		desktopOpenAppsMaximized,
		onDesktopOpenAppsMaximizedChange,
		desktopFloatingWidgetVisible,
		onDesktopFloatingWidgetVisibleChange,
		desktopWidgetsStyle,
		onDesktopWidgetsStyleChange,
		showWidgetsPanel,
		onShowWidgetsPanelChange,
		widgetsPanelPosition,
		onWidgetsPanelPositionChange,
		compactWidgets,
		onCompactWidgetsChange,
		expansionSettings,
		settingsCenterBridge,
		shell,
		visualLabels,
		workspaceProfilesShellContext,
		onStorageMapFieldNavigate,
		savedFilterShortcutDraft,
		setSavedFilterShortcutDraft,
		onScrollToShellAnchor,
	} = props;

	return (
		<>
			<div
				id={DESKTOP_SETTINGS_SHELL_ANCHORS.workspaces}
				className="scroll-mt-20 space-y-5"
			>
				<DesktopSettingsMotionSection>
					<DesktopSettingsExpansionShellVirtualDesktopsCard
						settingsCenterBridge={settingsCenterBridge}
						shell={shell}
					/>
				</DesktopSettingsMotionSection>
			</div>

			<div
				id={DESKTOP_SETTINGS_SHELL_ANCHORS.windows}
				className="scroll-mt-20 space-y-5"
			>
				<DesktopSettingsExpansionShellWindowsWidgetsSection
					desktopOpenAppsMaximized={desktopOpenAppsMaximized}
					onDesktopOpenAppsMaximizedChange={onDesktopOpenAppsMaximizedChange}
					desktopFloatingWidgetVisible={desktopFloatingWidgetVisible}
					onDesktopFloatingWidgetVisibleChange={
						onDesktopFloatingWidgetVisibleChange
					}
					desktopWidgetsStyle={desktopWidgetsStyle}
					onDesktopWidgetsStyleChange={onDesktopWidgetsStyleChange}
					shell={shell}
					visualLabels={visualLabels}
					onScrollToWidgetPanelSettings={
						onScrollToShellAnchor
							? () => {
									onScrollToShellAnchor(
										buildDesktopSettingsFieldElementId(
											'shell_state',
											'widgets_layout'
										)
									);
								}
							: undefined
					}
				/>
			</div>

			<div
				id={DESKTOP_SETTINGS_SHELL_ANCHORS.apps}
				className="scroll-mt-20 space-y-5"
			>
				<DesktopSettingsMotionSection delaySec={0.16}>
					<DesktopSettingsExpansionShellAppsCard
						settingsCenterBridge={settingsCenterBridge}
						shell={shell}
					/>
				</DesktopSettingsMotionSection>
			</div>

			<div
				id={DESKTOP_SETTINGS_SHELL_ANCHORS.menuMode}
				className="scroll-mt-20 space-y-5"
			>
				<DesktopSettingsMotionSection delaySec={0.18}>
					<DesktopSettingsMenuModeCard shell={shell} />
				</DesktopSettingsMotionSection>
			</div>

			<div
				id={DESKTOP_SETTINGS_SHELL_ANCHORS.sync}
				className="scroll-mt-20 space-y-5"
			>
				<DesktopSettingsMotionSection delaySec={0.2}>
					<DesktopSettingsShellSyncPrefsCard
						syncPrefs={settingsCenterBridge.syncPrefs}
						shell={shell}
					/>
				</DesktopSettingsMotionSection>
				<DesktopSettingsMotionSection delaySec={0.24}>
					<DesktopSettingsExpansionShellSyncDataCard
						settingsCenterBridge={settingsCenterBridge}
						expansionSettings={expansionSettings}
						shell={shell}
					/>
				</DesktopSettingsMotionSection>
			</div>

			<ExpansionSettingsSection
				anchorId={DESKTOP_SETTINGS_SHELL_ANCHORS.advanced}
				expansionSettings={expansionSettings}
				shell={shell}
				onBringWindowsToWorkArea={
					settingsCenterBridge.windows.onBringWindowsIntoWorkArea
				}
				workspaceProfileEditorContext={{
					virtualDesktops: settingsCenterBridge.virtualDesktops.desktops,
					globalWallpaper: settingsCenterBridge.virtualDesktops.globalWallpaper,
				}}
				workspaceProfilesShellContext={workspaceProfilesShellContext}
				profileAppCatalog={settingsCenterBridge.apps.installedApps}
				showWidgetsPanel={showWidgetsPanel}
				onShowWidgetsPanelChange={onShowWidgetsPanelChange}
				widgetsPanelPosition={widgetsPanelPosition}
				onWidgetsPanelPositionChange={onWidgetsPanelPositionChange}
				compactWidgets={compactWidgets}
				onCompactWidgetsChange={onCompactWidgetsChange}
				savedFilterShortcutDraft={savedFilterShortcutDraft}
				setSavedFilterShortcutDraft={setSavedFilterShortcutDraft}
				onStorageMapFieldNavigate={onStorageMapFieldNavigate}
			/>
		</>
	);
};
