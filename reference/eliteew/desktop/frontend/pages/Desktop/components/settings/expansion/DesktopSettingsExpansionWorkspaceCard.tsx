/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Workspace profiles and layout presets card.
 *
 * Invariants:
 * - Lazy-loaded from `DesktopSettingsExpansionSection`.
 *
 * Related:
 * - `desktopSettingsExpansionSection.types.ts`
 * - `DesktopChromeTooltip.tsx`
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DesktopAppButton } from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import { DESKTOP_WORKSPACE_PROFILE_TEMPLATES } from '../../../constants/desktopWorkspaceProfileTemplates';
import { DESKTOP_CURATED_WORKSPACE_LAYOUTS } from '../../../constants/desktopCuratedWorkspaceLayoutTemplates';
import { DESKTOP_SCENARIO_WINDOW_LAYOUTS } from '../../../constants/desktopScenarioWindowLayouts';
import { DESKTOP_TYPOGRAPHY } from '../../../constants';
import { buildDesktopSettingsFieldElementId } from '../../../utils/desktopSettingsFieldElementIds';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import type { ExpansionSettingsSectionProps } from './desktopSettingsExpansionSection.types';
import {
	ExpansionCounters,
	ExpansionList,
	WorkspaceProfilesExpansionList,
} from './desktopSettingsExpansionLists';

export function DesktopSettingsExpansionWorkspaceCard({
	expansionSettings,
	shell,
	onBringWindowsToWorkArea,
	workspaceProfileEditorContext,
	workspaceProfilesShellContext,
	profileAppCatalog,
}: Pick<
	ExpansionSettingsSectionProps,
	| 'expansionSettings'
	| 'shell'
	| 'onBringWindowsToWorkArea'
	| 'workspaceProfileEditorContext'
	| 'workspaceProfilesShellContext'
	| 'profileAppCatalog'
>) {
	const { t } = useTranslation('desktopUi');
	return (
		<SettingsFormCard
			id={buildDesktopSettingsFieldElementId(
				'shell_state',
				'workspace_profiles'
			)}
			title={t('settingsPanel.cardWorkspaceProfilesTitle')}
			windowStyle={shell.windowStyle}
		>
			<ExpansionCounters
				shell={shell}
				items={[
					{
						label: t('settingsPanel.expansionCounterWorkspaces'),
						value: expansionSettings.workspaceProfiles.length,
					},
					{
						label: t('settingsPanel.expansionCounterLayouts'),
						value: expansionSettings.windowLayoutPresets.length,
					},
				]}
			/>
			<p
				className={cn(DESKTOP_TYPOGRAPHY.caption, 'text-(--desktop-text-dim)')}
			>
				{t('settingsPanel.expansionWorkspaceTemplatesHint')}
			</p>
			<div className="rounded-xl border border-[rgb(var(--desktop-accent-rgb)/0.25)] bg-[rgb(var(--desktop-accent-rgb)/0.06)] px-3 py-3">
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'text-(--desktop-text-secondary)'
					)}
				>
					{t('settingsPanel.expansionSaveCurrentWorkspaceHint')}
				</p>
				<DesktopChromeTooltip
					content={t('settingsPanel.expansionSaveCurrentWorkspace')}
					placement="top"
					offsetExtra={4}
				>
					<DesktopAppButton
						type="button"
						variant="accent"
						className="mt-2"
						disabled={expansionSettings.isSaving}
						onClick={() =>
							void expansionSettings.addWorkspaceProfileFromOpenWindows()
						}
					>
						{t('settingsPanel.expansionSaveCurrentWorkspace')}
					</DesktopAppButton>
				</DesktopChromeTooltip>
			</div>
			<div className="flex min-w-0 flex-wrap gap-2">
				{DESKTOP_WORKSPACE_PROFILE_TEMPLATES.map((tpl) => {
					const label = t(
						`settingsPanel.expansionWorkspaceTemplate.${tpl.id}.label`
					);
					return (
						<DesktopChromeTooltip
							key={tpl.id}
							content={label}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								disabled={expansionSettings.isSaving}
								onClick={() =>
									void expansionSettings.addWorkspaceProfileFromTemplate(tpl.id)
								}
							>
								{label}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					);
				})}
			</div>
			<div className="flex min-w-0 flex-wrap gap-2">
				{(
					[
						{
							key: 'addWorkspace',
							label: t('settingsPanel.expansionAddWorkspace'),
							onClick: () => void expansionSettings.addWorkspaceProfile(),
							variant: 'neutral' as const,
						},
						{
							key: 'captureSnapshot',
							label: t('settingsPanel.expansionCaptureFromSavedSnapshot'),
							onClick: () =>
								void expansionSettings.addWorkspaceProfileFromSessionSnapshot(),
							variant: 'neutral' as const,
						},
						{
							key: 'saveLayout',
							label: t('settingsPanel.expansionSaveLayout'),
							onClick: () => void expansionSettings.addWindowLayoutPreset(),
							variant: 'neutral' as const,
						},
						{
							key: 'collectWindows',
							label: t('settingsPanel.expansionCollectWindows'),
							onClick: expansionSettings.collectCurrentWorkspaceWindows,
							variant: 'ghost' as const,
						},
						...(onBringWindowsToWorkArea
							? [
									{
										key: 'bringToWorkArea',
										label: t('settingsPanel.expansionBringWindowsToWorkArea'),
										onClick: onBringWindowsToWorkArea,
										variant: 'ghost' as const,
									},
								]
							: []),
					] as const
				).map(({ key, label, onClick, variant }) => (
					<DesktopChromeTooltip
						key={key}
						content={label}
						placement="top"
						offsetExtra={4}
					>
						<DesktopAppButton
							type="button"
							variant={variant}
							onClick={onClick}
							disabled={expansionSettings.isSaving}
						>
							{label}
						</DesktopAppButton>
					</DesktopChromeTooltip>
				))}
			</div>
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.captionInherit,
					'mt-2 text-(--desktop-text-dim)'
				)}
			>
				{t('settingsPanel.expansionCuratedLayoutsHint')}
			</p>
			<div className="mt-1 flex min-w-0 flex-wrap gap-2">
				{DESKTOP_CURATED_WORKSPACE_LAYOUTS.map((tpl) => {
					const label = t(
						`settingsPanel.expansionCuratedLayout.${tpl.id}.label`
					);
					return (
						<DesktopChromeTooltip
							key={tpl.id}
							content={label}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								disabled={expansionSettings.isSaving}
								onClick={() =>
									expansionSettings.applyCuratedWorkspaceLayout(tpl.id)
								}
							>
								{label}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					);
				})}
			</div>
			<div
				id={buildDesktopSettingsFieldElementId(
					'shell_state',
					'window_layout_presets'
				)}
				className="scroll-mt-20"
				aria-hidden
			/>
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.captionInherit,
					'mt-3 text-(--desktop-text-dim)'
				)}
			>
				{t('settingsPanel.expansionCuratedSavePresetHint')}
			</p>
			<div className="mt-1 flex min-w-0 flex-wrap gap-2">
				{DESKTOP_CURATED_WORKSPACE_LAYOUTS.map((tpl) => {
					const label = t(
						`settingsPanel.expansionCuratedLayout.${tpl.id}.savePresetShort`
					);
					return (
						<DesktopChromeTooltip
							key={`save-${tpl.id}`}
							content={label}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="neutral"
								disabled={expansionSettings.isSaving}
								onClick={() =>
									void expansionSettings.addWindowLayoutPresetFromCuratedTemplate(
										tpl.id
									)
								}
							>
								{label}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					);
				})}
			</div>
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.captionInherit,
					'mt-4 text-(--desktop-text-dim)'
				)}
			>
				{t('settingsPanel.expansionLayoutScenarioHint')}
			</p>
			<div className="mt-2 flex flex-col gap-3">
				{DESKTOP_SCENARIO_WINDOW_LAYOUTS.map((scenario) => {
					const layoutLabel = t(
						`settingsPanel.expansionLayoutScenario.${scenario.id}.layoutAction`
					);
					const saveLabel = t(
						`settingsPanel.expansionLayoutScenario.${scenario.id}.saveAction`
					);
					return (
						<div key={scenario.id} className="flex min-w-0 flex-wrap gap-2">
							<DesktopChromeTooltip
								content={layoutLabel}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="sm"
									disabled={expansionSettings.isSaving}
									onClick={() =>
										expansionSettings.applyScenarioWorkspaceLayout(scenario.id)
									}
								>
									{layoutLabel}
								</DesktopAppButton>
							</DesktopChromeTooltip>
							<DesktopChromeTooltip
								content={saveLabel}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									variant="neutral"
									size="sm"
									disabled={expansionSettings.isSaving}
									onClick={() =>
										void expansionSettings.addWindowLayoutPresetFromScenario(
											scenario.id
										)
									}
								>
									{saveLabel}
								</DesktopAppButton>
							</DesktopChromeTooltip>
						</div>
					);
				})}
			</div>
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.captionInherit,
					'mt-3 text-(--desktop-text-dim)'
				)}
			>
				{t('settingsPanel.expansionWorkspaceSnapshotHint', {
					count: expansionSettings.savedSessionSnapshotWindowCount,
				})}
			</p>
			<div className="grid gap-3 lg:grid-cols-2">
				<WorkspaceProfilesExpansionList
					expansionSettings={expansionSettings}
					shell={shell}
					editorContext={workspaceProfileEditorContext}
					workspaceProfilesShellContext={workspaceProfilesShellContext}
					profileAppCatalog={profileAppCatalog}
				/>
				<ExpansionList
					title={t('settingsPanel.expansionSavedLayouts')}
					emptyLabel={t('settingsPanel.expansionEmptyLayouts')}
					items={expansionSettings.windowLayoutPresets.map((preset) => ({
						id: preset.id,
						title: preset.name,
						description:
							preset.description ??
							t('settingsPanel.expansionLayoutSummary', {
								windows: preset.windows.length,
							}),
						onApply: () => expansionSettings.applyWindowLayoutPreset(preset.id),
						onRemove: () =>
							void expansionSettings.removeWindowLayoutPreset(preset.id),
					}))}
					shell={shell}
				/>
			</div>
		</SettingsFormCard>
	);
}
