/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Constants and step anchors for Clipboard Manager desktop window guided tour (GT-9f).
 *
 * Related:
 * - ClipboardManager.tsx, public/audio/clipboard-guide/
 */

import type { GuideStepDef } from '@/components/guided-tour/useBuiltGuideSteps';
import { guideTourWavUrl } from '@/components/guided-tour/guideTourWavUrl';

export const CLIPBOARD_GUIDE_ROOT_ID = 'clipboard-guide-root';
export const CLIPBOARD_GUIDE_AUDIO_LS_KEY = 'clipboard-guide-audio-enabled';
export const CLIPBOARD_GUIDE_TOUR_FOLDER = 'clipboard-guide';

export const CLIPBOARD_GUIDE_STEP_DEFS: readonly GuideStepDef[] = [
	{ id: 'intro', highlightSelector: null },
	{ id: 'header', highlightSelector: '[data-cb-guide="header"]' },
	{ id: 'search', highlightSelector: '[data-cb-guide="search"]' },
	{ id: 'history', highlightSelector: '[data-cb-guide="history"]' },
	{ id: 'outro', highlightSelector: null },
] as const;

export function clipboardGuideWavUrl(stepId: string): string {
	return guideTourWavUrl(CLIPBOARD_GUIDE_TOUR_FOLDER, stepId);
}
