/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Virtual desktops card in shell tab (workspaces anchor).
 *
 * Invariants:
 * - Uses `settingsCenterBridge.virtualDesktops` only; no direct shell_state writes.
 *
 * Related:
 * - `DesktopSettingsExpansionShellCluster.tsx`
 */

import { cn } from '@/utils/cn';
import { useTranslation } from 'react-i18next';
import { PhotoIcon, RectangleStackIcon } from '@heroicons/react/24/outline';
import { DESKTOP_INTERACTIVE, DESKTOP_TYPOGRAPHY } from '../../../constants';
import {
	DesktopAppButton,
	DESKTOP_APP_STYLE_CONTRACT,
} from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import { getDesktopShellToolbarClusterInsetControlClassName } from '../../../utils/desktopVisualSystem';
import { buildDesktopSettingsFieldElementId } from '../../../utils/desktopSettingsFieldElementIds';
import type { DesktopSettingsCenterBridge } from '../../../types/desktopSettingsCenterBridge.types';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import type { DesktopSettingsShellHelpers } from '../desktopSettingsShared.types';

export function DesktopSettingsExpansionShellVirtualDesktopsCard({
	settingsCenterBridge,
	shell,
}: {
	settingsCenterBridge: DesktopSettingsCenterBridge;
	shell: DesktopSettingsShellHelpers;
}) {
	const { t } = useTranslation('desktopUi');

	return (
		<SettingsFormCard
			id={buildDesktopSettingsFieldElementId('shell_state', 'virtual_desktops')}
			title={t('settingsPanel.settingsCenterVirtualDesktopsTitle')}
			windowStyle={shell.windowStyle}
		>
			<div className="flex min-w-0 flex-wrap gap-2 mb-3">
				<DesktopChromeTooltip
					content={t('settingsPanel.settingsCenterVdAdd')}
					placement="top"
					offsetExtra={4}
				>
					<DesktopAppButton
						type="button"
						variant="neutral"
						onClick={() =>
							settingsCenterBridge.virtualDesktops.onCreateDesktop()
						}
					>
						<RectangleStackIcon className="size-4" aria-hidden />
						{t('settingsPanel.settingsCenterVdAdd')}
					</DesktopAppButton>
				</DesktopChromeTooltip>
			</div>
			<div className="space-y-3">
				{settingsCenterBridge.virtualDesktops.desktops.map((d) => (
					<div
						key={d.id}
						className={cn(
							getDesktopShellToolbarClusterInsetControlClassName(
								shell.windowStyle
							),
							'rounded-xl px-3 py-3 space-y-2'
						)}
					>
						<div className="flex flex-wrap items-center gap-2 justify-between">
							<span className="text-xs font-semibold text-(--desktop-text-dim)">
								{d.id === settingsCenterBridge.virtualDesktops.activeDesktopId
									? t('settingsPanel.settingsCenterVdActive')
									: t('settingsPanel.settingsCenterVdInactive')}
							</span>
							<div className="flex flex-wrap gap-1">
								<DesktopChromeTooltip
									content={t('settingsPanel.settingsCenterVdSwitch')}
									placement="top"
									offsetExtra={4}
								>
									<DesktopAppButton
										type="button"
										variant="ghost"
										size="sm"
										onClick={() =>
											settingsCenterBridge.virtualDesktops.onSwitchDesktop(d.id)
										}
									>
										{t('settingsPanel.settingsCenterVdSwitch')}
									</DesktopAppButton>
								</DesktopChromeTooltip>
								<DesktopChromeTooltip
									content={t('settingsPanel.settingsCenterVdRemove')}
									placement="top"
									offsetExtra={4}
								>
									<DesktopAppButton
										type="button"
										variant="ghost"
										size="sm"
										disabled={
											settingsCenterBridge.virtualDesktops.desktops.length < 2
										}
										onClick={() =>
											settingsCenterBridge.virtualDesktops.onDeleteDesktop(d.id)
										}
									>
										{t('settingsPanel.settingsCenterVdRemove')}
									</DesktopAppButton>
								</DesktopChromeTooltip>
							</div>
						</div>
						<label className="block space-y-1">
							<span className={DESKTOP_TYPOGRAPHY.caption}>
								{t('settingsPanel.settingsCenterVdName')}
							</span>
							<input
								type="text"
								value={d.name}
								onChange={(e) =>
									settingsCenterBridge.virtualDesktops.onRenameDesktop(
										d.id,
										e.target.value
									)
								}
								className={cn(
									DESKTOP_APP_STYLE_CONTRACT.searchField,
									'w-full rounded-lg px-3 py-2 text-sm',
									DESKTOP_INTERACTIVE.inputFocus
								)}
							/>
						</label>
						<DesktopChromeTooltip
							content={t('settingsPanel.settingsCenterVdUseGlobalWallpaper')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								onClick={() =>
									settingsCenterBridge.virtualDesktops.onApplyGlobalWallpaperToDesktop(
										d.id
									)
								}
							>
								<PhotoIcon className="size-4" aria-hidden />
								{t('settingsPanel.settingsCenterVdUseGlobalWallpaper')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					</div>
				))}
			</div>
		</SettingsFormCard>
	);
}
