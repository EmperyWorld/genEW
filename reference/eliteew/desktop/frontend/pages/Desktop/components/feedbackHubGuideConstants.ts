/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Constants and step anchors for Feedback Hub guided tour (GT-10b).
 *
 * Related:
 * - FeedbackHubApp.tsx, public/audio/feedback-hub-guide/
 */

import type { GuideStepDef } from '@/components/guided-tour/useBuiltGuideSteps';
import { guideTourWavUrl } from '@/components/guided-tour/guideTourWavUrl';

export const FEEDBACK_HUB_GUIDE_ROOT_ID = 'feedback-hub-guide-root';
export const FEEDBACK_HUB_GUIDE_AUDIO_LS_KEY =
	'feedback-hub-guide-audio-enabled';
export const FEEDBACK_HUB_GUIDE_TOUR_FOLDER = 'feedback-hub-guide';

export const FEEDBACK_HUB_GUIDE_STEP_DEFS: readonly GuideStepDef[] = [
	{ id: 'intro', highlightSelector: null },
	{ id: 'header', highlightSelector: '[data-feedback-hub-guide="header"]' },
	{ id: 'stats', highlightSelector: '[data-feedback-hub-guide="stats"]' },
	{
		id: 'ticket-list',
		highlightSelector: '[data-feedback-hub-guide="ticket-list"]',
	},
	{
		id: 'list-filters',
		highlightSelector: '[data-feedback-hub-guide="list-filters"]',
	},
	{
		id: 'compose-kind',
		highlightSelector: '[data-feedback-hub-guide="compose-kind"]',
	},
	{
		id: 'compose-form',
		highlightSelector: '[data-feedback-hub-guide="compose-form"]',
	},
	{ id: 'preview', highlightSelector: '[data-feedback-hub-guide="preview"]' },
	{ id: 'send-bar', highlightSelector: '[data-feedback-hub-guide="send-bar"]' },
	{ id: 'outro', highlightSelector: null },
] as const;

export function feedbackHubGuideWavUrl(stepId: string): string {
	return guideTourWavUrl(FEEDBACK_HUB_GUIDE_TOUR_FOLDER, stepId);
}
