/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Widget panel settings and slot ordering.
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
import type { WidgetsPanelPosition } from '../../../types/desktop.types';
import { DESKTOP_TYPOGRAPHY } from '../../../constants';
import { DesktopAppButton, DesktopNativeSelect } from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import { buildDesktopSettingsFieldElementId } from '../../../utils/desktopSettingsFieldElementIds';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import type { ExpansionSettingsSectionProps } from './desktopSettingsExpansionSection.types';
import { SortableWidgetSlotsBlock } from './desktopSettingsExpansionWidgetSlots';

export function DesktopSettingsExpansionWidgetPanelCard({
	expansionSettings,
	shell,
	showWidgetsPanel,
	onShowWidgetsPanelChange,
	widgetsPanelPosition,
	onWidgetsPanelPositionChange,
	compactWidgets,
	onCompactWidgetsChange,
}: Pick<
	ExpansionSettingsSectionProps,
	| 'expansionSettings'
	| 'shell'
	| 'showWidgetsPanel'
	| 'onShowWidgetsPanelChange'
	| 'widgetsPanelPosition'
	| 'onWidgetsPanelPositionChange'
	| 'compactWidgets'
	| 'onCompactWidgetsChange'
>) {
	const { t } = useTranslation('desktopUi');
	return (
		<SettingsFormCard
			id={buildDesktopSettingsFieldElementId('shell_state', 'widgets_layout')}
			title={t('settingsPanel.cardWidgetPanelTitle')}
			windowStyle={shell.windowStyle}
		>
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.captionInherit,
					'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2 text-(--desktop-text-dim)'
				)}
			>
				{t('settingsPanel.cardWidgetPanelTaxonomyNote')}
			</p>
			<div
				id={buildDesktopSettingsFieldElementId(
					'desktop_config',
					'show_widgets_panel'
				)}
				className="scroll-mt-20"
				aria-hidden
			/>
			<div
				id={buildDesktopSettingsFieldElementId(
					'desktop_config',
					'widgets_panel_position'
				)}
				className="scroll-mt-20"
				aria-hidden
			/>
			<div
				id={buildDesktopSettingsFieldElementId(
					'desktop_config',
					'compact_widgets'
				)}
				className="scroll-mt-20"
				aria-hidden
			/>
			<div
				id={buildDesktopSettingsFieldElementId('desktop_config', 'show_widget')}
				className="scroll-mt-20"
				aria-hidden
			/>
			<div
				id={buildDesktopSettingsFieldElementId(
					'desktop_config',
					'widget_position'
				)}
				className="scroll-mt-20"
				aria-hidden
			/>
			<div className="grid gap-3 sm:grid-cols-2">
				<label className="inline-flex items-center gap-2 text-sm text-(--desktop-text-secondary) cursor-pointer">
					<input
						type="checkbox"
						className={shell.checkboxClass}
						checked={showWidgetsPanel}
						onChange={(event) => onShowWidgetsPanelChange(event.target.checked)}
					/>
					{t('settingsPanel.widgetsPanel.showOnDesktop')}
				</label>
				<label className="inline-flex items-center gap-2 text-sm text-(--desktop-text-secondary) cursor-pointer">
					<input
						type="checkbox"
						className={shell.checkboxClass}
						checked={compactWidgets}
						onChange={(event) => onCompactWidgetsChange(event.target.checked)}
					/>
					{t('settingsPanel.widgetsPanel.compactAllSlots')}
				</label>
			</div>
			<label
				htmlFor="desktop-settings-widgets-panel-position"
				className="mt-3 block text-sm text-(--desktop-text-secondary)"
			>
				{t('settingsPanel.widgetsPanel.panelPosition')}
				<DesktopNativeSelect
					id="desktop-settings-widgets-panel-position"
					shellFrame={shell.windowStyle}
					className="mt-1.5 max-w-md"
					value={widgetsPanelPosition}
					onChange={(event) =>
						onWidgetsPanelPositionChange(
							event.target.value as WidgetsPanelPosition
						)
					}
				>
					<option value="top-right">
						{t('settingsPanel.widgetsPanel.positionTopRight')}
					</option>
					<option value="top-left">
						{t('settingsPanel.widgetsPanel.positionTopLeft')}
					</option>
					<option value="bottom-right">
						{t('settingsPanel.widgetsPanel.positionBottomRight')}
					</option>
					<option value="bottom-left">
						{t('settingsPanel.widgetsPanel.positionBottomLeft')}
					</option>
				</DesktopNativeSelect>
			</label>
			<div className="mt-2 flex flex-wrap items-center gap-2">
				<DesktopChromeTooltip
					content={t('settingsPanel.widgetsPanel.resetPanelPosition')}
					placement="top"
					offsetExtra={4}
				>
					<DesktopAppButton
						type="button"
						variant="ghost"
						size="sm"
						disabled={expansionSettings.isSaving || !showWidgetsPanel}
						onClick={() =>
							void expansionSettings.setWidgetsPanelOffset({ x: 0, y: 0 })
						}
					>
						{t('settingsPanel.widgetsPanel.resetPanelPosition')}
					</DesktopAppButton>
				</DesktopChromeTooltip>
			</div>
			<label className="mt-3 inline-flex items-center gap-2 text-sm text-(--desktop-text-secondary) cursor-pointer">
				<input
					type="checkbox"
					className={shell.checkboxClass}
					checked={expansionSettings.widgetsLayout.slotPlacement === 'free'}
					disabled={expansionSettings.isSaving || !showWidgetsPanel}
					onChange={(event) =>
						void expansionSettings.setWidgetsSlotPlacement(
							event.target.checked ? 'free' : 'stacked'
						)
					}
				/>
				{t('settingsPanel.widgetsPanel.freePlacement')}
			</label>
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.caption,
					'mt-1 max-w-xl text-(--desktop-text-dim)'
				)}
			>
				{t('settingsPanel.widgetsPanel.freePlacementDesc')}
			</p>
			<label className="mt-4 inline-flex items-center gap-2 text-sm text-(--desktop-text-secondary) cursor-pointer">
				<input
					type="checkbox"
					className={shell.checkboxClass}
					checked={expansionSettings.widgetsLayout.perWorkspace}
					onChange={(event) =>
						void expansionSettings.toggleWidgetsPerWorkspace(
							event.target.checked
						)
					}
				/>
				{t('settingsPanel.widgetsPerWorkspace')}
			</label>
			<div className="mt-4">
				<SortableWidgetSlotsBlock
					expansionSettings={expansionSettings}
					perWorkspace={expansionSettings.widgetsLayout.perWorkspace}
					windowStyle={shell.windowStyle}
					segmentClusterClass={shell.segmentClusterClass}
					segmentTabClass={shell.segmentTabClass}
				/>
			</div>
		</SettingsFormCard>
	);
}
