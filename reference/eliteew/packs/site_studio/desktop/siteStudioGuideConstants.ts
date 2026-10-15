/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Constants and step anchors for Site Studio guided tour (GT-3).
 *
 * Related:
 * - features/site-studio/desktop/UserSiteStudioApp.tsx, public/audio/site-studio-guide/
 */

import type { GuideStepDef } from '@/components/guided-tour/useBuiltGuideSteps';
import { guideTourWavUrl } from '@/components/guided-tour/guideTourWavUrl';

export const SITE_STUDIO_GUIDE_ROOT_ID = 'site-studio-guide-root';
export const SITE_STUDIO_GUIDE_AUDIO_LS_KEY = 'site-studio-guide-audio-enabled';
export const SITE_STUDIO_GUIDE_TOUR_FOLDER = 'site-studio-guide';

export const SITE_STUDIO_GUIDE_STEP_DEFS: readonly GuideStepDef[] = [
	{ id: 'intro', highlightSelector: null },
	{ id: 'header', highlightSelector: '[data-ss-guide="header"]' },
	{ id: 'tabs', highlightSelector: '[data-ss-guide="tabs"]' },
	{
		id: 'checklist',
		highlightSelector: '[data-ss-guide="checklist"]',
	},
	{ id: 'runtime', highlightSelector: '[data-ss-guide="runtime"]' },
	{ id: 'outro', highlightSelector: null },
] as const;

export const SITE_STUDIO_GUIDE_TAB_BY_STEP: Partial<
	Record<(typeof SITE_STUDIO_GUIDE_STEP_DEFS)[number]['id'], 'setup'>
> = {
	intro: 'setup',
	header: 'setup',
	tabs: 'setup',
	checklist: 'setup',
	runtime: 'setup',
};

export function siteStudioGuideWavUrl(stepId: string): string {
	return guideTourWavUrl(SITE_STUDIO_GUIDE_TOUR_FOLDER, stepId);
}
