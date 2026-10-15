/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Wallpaper preview and picker launch card for Personalize tab.
 *
 * Invariants:
 * - Field ids wired for storage map navigation (`desktop_config/wallpaper`).
 *
 * Related:
 * - `DesktopSettingsPersonalizeTab.tsx`
 * - `desktopSettingsPersonalize.types.ts`
 */

import { cn } from '@/utils/cn';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { PhotoIcon } from '@heroicons/react/24/outline';
import { DesktopAppButton } from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import { buildDesktopSettingsFieldElementId } from '../../../utils/desktopSettingsFieldElementIds';
import { getDesktopShellToolbarClusterInsetControlClassName } from '../../../utils/desktopVisualSystem';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import { DesktopSettingsMotionSection } from '../DesktopSettingsMotionSection';
import { DesktopSettingsWallpaperPreview } from '../desktopSettingsPreviewComponents';
import type { DesktopSettingsPersonalizeWallpaperCardProps } from './desktopSettingsPersonalize.types';

export const DesktopSettingsPersonalizeWallpaperCard: FC<
	DesktopSettingsPersonalizeWallpaperCardProps
> = ({ wallpaper, onOpenWallpaperPicker, shell, isPrimaryCta = true }) => {
	const { t: tSettings } = useTranslation('desktopUi');

	return (
		<DesktopSettingsMotionSection delaySec={0.08}>
			<SettingsFormCard
				id={buildDesktopSettingsFieldElementId('desktop_config', 'wallpaper')}
				title={tSettings('settingsPanel.cardWallpaperTitle')}
				windowStyle={shell.windowStyle}
			>
				<div
					id={buildDesktopSettingsFieldElementId(
						'desktop_config',
						'live_wallpaper'
					)}
					className="scroll-mt-20"
					aria-hidden
				/>
				<div
					id={buildDesktopSettingsFieldElementId(
						'desktop_config',
						'wallpapers_history'
					)}
					className="scroll-mt-20"
					aria-hidden
				/>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
					<DesktopSettingsWallpaperPreview
						wallpaper={wallpaper}
						fit="contain"
						className={cn(
							'flex-1 rounded-xl overflow-hidden aspect-video min-h-[140px] bg-contain bg-center bg-no-repeat',
							getDesktopShellToolbarClusterInsetControlClassName(
								shell.windowStyle
							)
						)}
					/>
					<div className="flex flex-col justify-center gap-2 sm:w-56">
						<DesktopChromeTooltip
							content={tSettings('settingsPanel.wallpaperChangeButton')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant={isPrimaryCta ? 'accent' : 'neutral'}
								data-testid="desktop-settings-wallpaper-primary-cta"
								onClick={() => {
									onOpenWallpaperPicker();
								}}
							>
								<PhotoIcon className="h-4 w-4" />
								{tSettings('settingsPanel.wallpaperChangeButton')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					</div>
				</div>
			</SettingsFormCard>
		</DesktopSettingsMotionSection>
	);
};
