/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Constants and step anchors for Desktop Shell Settings guided tour (GT-11a).
 *
 * Related:
 * - DesktopSettingsPanel.tsx, public/audio/desktop-shell-settings-guide/
 */

import type { GuideStepDef } from '@/components/guided-tour/useBuiltGuideSteps';
import { guideTourWavUrl } from '@/components/guided-tour/guideTourWavUrl';

export const DESKTOP_SHELL_SETTINGS_GUIDE_ROOT_ID =
	'desktop-shell-settings-guide-root';
export const DESKTOP_SHELL_SETTINGS_GUIDE_AUDIO_LS_KEY =
	'desktop-shell-settings-guide-audio-enabled';
export const DESKTOP_SHELL_SETTINGS_GUIDE_TOUR_FOLDER =
	'desktop-shell-settings-guide';

export const DESKTOP_SHELL_SETTINGS_GUIDE_STEP_DEFS: readonly GuideStepDef[] = [
	{ id: 'intro', highlightSelector: null },
	{
		id: 'header',
		highlightSelector: '[data-desktop-settings-guide="tabs-nav"]',
	},
	{
		id: 'tabs-nav',
		highlightSelector: '[data-desktop-settings-guide="tabs-nav"]',
	},
	{
		id: 'personalize',
		highlightSelector: '[data-desktop-settings-guide="tab-personalize"]',
	},
	{
		id: 'icons',
		highlightSelector: '[data-desktop-settings-guide="tab-icons"]',
	},
	{
		id: 'chrome',
		highlightSelector: '[data-desktop-settings-guide="tab-chrome"]',
	},
	{
		id: 'shell',
		highlightSelector: '[data-desktop-settings-guide="tab-shell"]',
	},
	{
		id: 'performance',
		highlightSelector: '[data-desktop-settings-guide="tab-performance"]',
	},
	{ id: 'outro', highlightSelector: null },
] as const;

export function desktopShellSettingsGuideWavUrl(stepId: string): string {
	return guideTourWavUrl(DESKTOP_SHELL_SETTINGS_GUIDE_TOUR_FOLDER, stepId);
}
