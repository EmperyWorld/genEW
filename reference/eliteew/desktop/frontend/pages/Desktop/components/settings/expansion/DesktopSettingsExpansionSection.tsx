/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Advanced expansion settings orchestrator: lazy-loaded cards under shell tab anchor.
 *
 * Invariants:
 * - Card modules live alongside this file; each loads via `React.lazy`.
 *
 * Related:
 * - `DesktopSettingsExpansionShellCluster.tsx`, `useDesktopExpansionSettings.ts`
 */

import { lazy, Suspense, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { DesktopSettingsMotionSection } from '../DesktopSettingsMotionSection';
import { ExpansionCardSkeleton } from '../desktopSettingsSharedUi';
import type { ExpansionSettingsSectionProps } from './desktopSettingsExpansionSection.types';

export type { ExpansionSettingsSectionProps } from './desktopSettingsExpansionSection.types';

const DesktopSettingsExpansionStorageCardLazy = lazy(async () => {
	const mod = await import('./DesktopSettingsExpansionStorageCard');
	return { default: mod.DesktopSettingsExpansionStorageCard };
});
const DesktopSettingsExpansionWorkspaceCardLazy = lazy(async () => {
	const mod = await import('./DesktopSettingsExpansionWorkspaceCard');
	return { default: mod.DesktopSettingsExpansionWorkspaceCard };
});
const DesktopSettingsExpansionDiscoveryCardLazy = lazy(async () => {
	const mod = await import('./DesktopSettingsExpansionDiscoveryCard');
	return { default: mod.DesktopSettingsExpansionDiscoveryCard };
});
const DesktopSettingsExpansionWidgetPanelCardLazy = lazy(async () => {
	const mod = await import('./DesktopSettingsExpansionWidgetPanelCard');
	return { default: mod.DesktopSettingsExpansionWidgetPanelCard };
});
const DesktopSettingsExpansionAssistantCardLazy = lazy(async () => {
	const mod = await import('./DesktopSettingsExpansionAssistantCard');
	return { default: mod.DesktopSettingsExpansionAssistantCard };
});

const ExpansionCardFallback: FC = () => <ExpansionCardSkeleton />;

export const ExpansionSettingsSection: FC<ExpansionSettingsSectionProps> = (
	props
) => {
	const { t } = useTranslation('desktopUi');
	const {
		anchorId,
		expansionSettings,
		shell,
		onBringWindowsToWorkArea,
		workspaceProfileEditorContext,
		workspaceProfilesShellContext,
		profileAppCatalog,
		showWidgetsPanel,
		onShowWidgetsPanelChange,
		widgetsPanelPosition,
		onWidgetsPanelPositionChange,
		compactWidgets,
		onCompactWidgetsChange,
		savedFilterShortcutDraft,
		setSavedFilterShortcutDraft,
		onStorageMapFieldNavigate,
	} = props;

	return (
		<div id={anchorId} className="scroll-mt-20 space-y-5">
			<h3 id={`${anchorId}-heading`} className="sr-only">
				{t('settingsPanel.expansionSectionTitle')}
			</h3>
			<DesktopSettingsMotionSection delaySec={0.28}>
				<Suspense fallback={<ExpansionCardFallback />}>
					<DesktopSettingsExpansionStorageCardLazy
						expansionSettings={expansionSettings}
						shell={shell}
						onStorageMapFieldNavigate={onStorageMapFieldNavigate}
					/>
				</Suspense>
			</DesktopSettingsMotionSection>
			<DesktopSettingsMotionSection delaySec={0.32}>
				<Suspense fallback={<ExpansionCardFallback />}>
					<DesktopSettingsExpansionWorkspaceCardLazy
						expansionSettings={expansionSettings}
						shell={shell}
						onBringWindowsToWorkArea={onBringWindowsToWorkArea}
						workspaceProfileEditorContext={workspaceProfileEditorContext}
						workspaceProfilesShellContext={workspaceProfilesShellContext}
						profileAppCatalog={profileAppCatalog}
					/>
				</Suspense>
			</DesktopSettingsMotionSection>
			<DesktopSettingsMotionSection delaySec={0.36}>
				<Suspense fallback={<ExpansionCardFallback />}>
					<DesktopSettingsExpansionDiscoveryCardLazy
						expansionSettings={expansionSettings}
						shell={shell}
						savedFilterShortcutDraft={savedFilterShortcutDraft}
						setSavedFilterShortcutDraft={setSavedFilterShortcutDraft}
					/>
				</Suspense>
			</DesktopSettingsMotionSection>
			<DesktopSettingsMotionSection delaySec={0.4}>
				<Suspense fallback={<ExpansionCardFallback />}>
					<DesktopSettingsExpansionWidgetPanelCardLazy
						expansionSettings={expansionSettings}
						shell={shell}
						showWidgetsPanel={showWidgetsPanel}
						onShowWidgetsPanelChange={onShowWidgetsPanelChange}
						widgetsPanelPosition={widgetsPanelPosition}
						onWidgetsPanelPositionChange={onWidgetsPanelPositionChange}
						compactWidgets={compactWidgets}
						onCompactWidgetsChange={onCompactWidgetsChange}
					/>
				</Suspense>
			</DesktopSettingsMotionSection>
			<DesktopSettingsMotionSection delaySec={0.44}>
				<Suspense fallback={<ExpansionCardFallback />}>
					<DesktopSettingsExpansionAssistantCardLazy
						expansionSettings={expansionSettings}
						shell={shell}
					/>
				</Suspense>
			</DesktopSettingsMotionSection>
		</div>
	);
};
