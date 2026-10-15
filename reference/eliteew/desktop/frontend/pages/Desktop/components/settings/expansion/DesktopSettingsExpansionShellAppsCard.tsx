/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Installed apps shortcuts card in shell tab (apps anchor).
 *
 * Invariants:
 * - Lists at most 32 installed apps for scroll performance.
 *
 * Related:
 * - `DesktopSettingsExpansionShellCluster.tsx`
 */

import { cn } from '@/utils/cn';
import { useTranslation } from 'react-i18next';
import { BuildingStorefrontIcon } from '@heroicons/react/24/outline';
import { DesktopAppButton } from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import { getDesktopShellToolbarClusterInsetControlClassName } from '../../../utils/desktopVisualSystem';
import type { DesktopSettingsCenterBridge } from '../../../types/desktopSettingsCenterBridge.types';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import type { DesktopSettingsShellHelpers } from '../desktopSettingsShared.types';

export function DesktopSettingsExpansionShellAppsCard({
	settingsCenterBridge,
	shell,
}: {
	settingsCenterBridge: DesktopSettingsCenterBridge;
	shell: DesktopSettingsShellHelpers;
}) {
	const { t } = useTranslation('desktopUi');

	return (
		<SettingsFormCard
			title={t('settingsPanel.settingsCenterAppsTitle')}
			windowStyle={shell.windowStyle}
		>
			<div className="mb-3">
				<DesktopChromeTooltip
					content={t('settingsPanel.settingsCenterOpenAppStore')}
					placement="top"
					offsetExtra={4}
				>
					<DesktopAppButton
						type="button"
						variant="accent"
						onClick={() => settingsCenterBridge.apps.onOpenAppStore()}
					>
						<BuildingStorefrontIcon className="size-4" aria-hidden />
						{t('settingsPanel.settingsCenterOpenAppStore')}
					</DesktopAppButton>
				</DesktopChromeTooltip>
			</div>
			<ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
				{settingsCenterBridge.apps.installedApps.slice(0, 32).map((app) => {
					const onDesk = settingsCenterBridge.apps.isAppShortcutOnDesktop(app);
					return (
						<li
							key={app.id}
							className={cn(
								getDesktopShellToolbarClusterInsetControlClassName(
									shell.windowStyle
								),
								'flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2'
							)}
						>
							<span className="min-w-0 truncate text-sm text-(--desktop-text-primary)">
								{app.name}
							</span>
							{onDesk ? (
								<DesktopChromeTooltip
									content={`${app.name} — ${t('settingsPanel.settingsCenterAppRemoveFromDesktop')}`}
									placement="top"
									offsetExtra={4}
								>
									<DesktopAppButton
										type="button"
										variant="ghost"
										onClick={() =>
											settingsCenterBridge.apps.onRemoveAppFromDesktop(app)
										}
									>
										{t('settingsPanel.settingsCenterAppRemoveFromDesktop')}
									</DesktopAppButton>
								</DesktopChromeTooltip>
							) : (
								<DesktopChromeTooltip
									content={`${app.name} — ${t('settingsPanel.settingsCenterAppAddToDesktop')}`}
									placement="top"
									offsetExtra={4}
								>
									<DesktopAppButton
										type="button"
										variant="neutral"
										onClick={() =>
											settingsCenterBridge.apps.onAddAppToDesktop(app)
										}
									>
										{t('settingsPanel.settingsCenterAppAddToDesktop')}
									</DesktopAppButton>
								</DesktopChromeTooltip>
							)}
						</li>
					);
				})}
			</ul>
		</SettingsFormCard>
	);
}
