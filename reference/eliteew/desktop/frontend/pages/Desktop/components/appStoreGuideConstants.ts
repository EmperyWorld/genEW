/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Constants and step anchors for App Store desktop window guided tour (GT-9e).
 *
 * Related:
 * - AppStoreWindowContent.tsx, public/audio/app-store-guide/
 */

import type { GuideStepDef } from '@/components/guided-tour/useBuiltGuideSteps';
import { guideTourWavUrl } from '@/components/guided-tour/guideTourWavUrl';

export const APP_STORE_GUIDE_ROOT_ID = 'app-store-guide-root';
export const APP_STORE_GUIDE_AUDIO_LS_KEY = 'app-store-guide-audio-enabled';
export const APP_STORE_GUIDE_TOUR_FOLDER = 'app-store-guide';

export const APP_STORE_GUIDE_STEP_DEFS: readonly GuideStepDef[] = [
	{ id: 'intro', highlightSelector: null },
	{ id: 'catalog', highlightSelector: '[data-as-guide="catalog"]' },
	{ id: 'sidebar', highlightSelector: '[data-as-guide="sidebar"]' },
	{ id: 'outro', highlightSelector: null },
] as const;

export function appStoreGuideWavUrl(stepId: string): string {
	return guideTourWavUrl(APP_STORE_GUIDE_TOUR_FOLDER, stepId);
}
