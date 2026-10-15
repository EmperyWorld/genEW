/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Constants and step anchors for EWDesk guided tour (GT-9b).
 *
 * Related:
 * - EWDeskApp.tsx, public/audio/ewdesk-guide/
 */

import type { GuideStepDef } from '@/components/guided-tour/useBuiltGuideSteps';
import { guideTourWavUrl } from '@/components/guided-tour/guideTourWavUrl';

export const EW_DESK_GUIDE_ROOT_ID = 'ewdesk-guide-root';
export const EW_DESK_GUIDE_AUDIO_LS_KEY = 'ewdesk-guide-audio-enabled';
export const EW_DESK_GUIDE_TOUR_FOLDER = 'ewdesk-guide';

export const EW_DESK_GUIDE_STEP_DEFS: readonly GuideStepDef[] = [
	{ id: 'intro', highlightSelector: null },
	{ id: 'header', highlightSelector: '[data-ed-guide="header"]' },
	{ id: 'feed-list', highlightSelector: '[data-ed-guide="feed-list"]' },
	{ id: 'feed-detail', highlightSelector: '[data-ed-guide="feed-detail"]' },
	{ id: 'outro', highlightSelector: null },
] as const;

export function ewDeskGuideWavUrl(stepId: string): string {
	return guideTourWavUrl(EW_DESK_GUIDE_TOUR_FOLDER, stepId);
}
