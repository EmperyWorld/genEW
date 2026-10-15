/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Constants and step anchors for Assistant (Справочник) guided tour (GT-10a).
 *
 * Related:
 * - AssistantApp.tsx, public/audio/assistant-guide/
 */

import type { GuideStepDef } from '@/components/guided-tour/useBuiltGuideSteps';
import { guideTourWavUrl } from '@/components/guided-tour/guideTourWavUrl';

export const ASSISTANT_GUIDE_ROOT_ID = 'assistant-guide-root';
export const ASSISTANT_GUIDE_AUDIO_LS_KEY = 'assistant-guide-audio-enabled';
export const ASSISTANT_GUIDE_TOUR_FOLDER = 'assistant-guide';

export const ASSISTANT_GUIDE_STEP_DEFS: readonly GuideStepDef[] = [
	{ id: 'intro', highlightSelector: null },
	{ id: 'header', highlightSelector: '[data-assistant-guide="header"]' },
	{
		id: 'faq-search',
		highlightSelector: '[data-assistant-guide="faq-search"]',
	},
	{ id: 'faq-list', highlightSelector: '[data-assistant-guide="faq-list"]' },
	{
		id: 'chat-panel',
		highlightSelector: '[data-assistant-guide="chat-panel"]',
	},
	{
		id: 'chat-messages',
		highlightSelector: '[data-assistant-guide="chat-messages"]',
	},
	{ id: 'composer', highlightSelector: '[data-assistant-guide="composer"]' },
	{
		id: 'overflow-menu',
		highlightSelector: '[data-assistant-guide="overflow-menu"]',
	},
	{ id: 'shortcuts', highlightSelector: '[data-assistant-guide="shortcuts"]' },
	{ id: 'outro', highlightSelector: null },
] as const;

export function assistantGuideWavUrl(stepId: string): string {
	return guideTourWavUrl(ASSISTANT_GUIDE_TOUR_FOLDER, stepId);
}
