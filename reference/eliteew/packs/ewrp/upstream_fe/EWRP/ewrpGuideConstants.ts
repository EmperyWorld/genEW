/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Constants and step anchors for EWRP guided tour (GT-4).
 *
 * Related:
 * - components/EWRP/EWRPGeneratorMain.tsx, public/audio/ewrp-guide/
 */

import type { GuideStepDef } from '@/components/guided-tour/useBuiltGuideSteps';
import { guideTourWavUrl } from '@/components/guided-tour/guideTourWavUrl';

export const EWRP_GUIDE_ROOT_ID = 'ewrp-guide-root';
export const EWRP_GUIDE_AUDIO_LS_KEY = 'ewrp-guide-audio-enabled';
export const EWRP_GUIDE_TOUR_FOLDER = 'ewrp-guide';

export const EWRP_GUIDE_STEP_DEFS: readonly GuideStepDef[] = [
	{ id: 'intro', highlightSelector: null },
	{ id: 'tabs', highlightSelector: '[data-ewrp-guide="tabs"]' },
	{
		id: 'outline-form',
		highlightSelector: '[data-ewrp-guide="outline-form"]',
	},
	{
		id: 'doc-picker',
		highlightSelector: '[data-ewrp-guide="doc-picker"]',
	},
	{ id: 'history', highlightSelector: '[data-ewrp-guide="history"]' },
	{ id: 'launch', highlightSelector: '[data-ewrp-guide="launch"]' },
	{ id: 'outro', highlightSelector: null },
] as const;

export const EWRP_GUIDE_TAB_BY_STEP: Partial<
	Record<(typeof EWRP_GUIDE_STEP_DEFS)[number]['id'], 'generate'>
> = {
	intro: 'generate',
	tabs: 'generate',
	'outline-form': 'generate',
	'doc-picker': 'generate',
	history: 'generate',
	launch: 'generate',
};

export function ewrpGuideWavUrl(stepId: string): string {
	return guideTourWavUrl(EWRP_GUIDE_TOUR_FOLDER, stepId);
}
