/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Constants and step anchors for Notifications desktop app guided tour (GT-9d).
 *
 * Related:
 * - NotificationsDesktopApp.tsx, public/audio/notifications-guide/
 */

import type { GuideStepDef } from '@/components/guided-tour/useBuiltGuideSteps';
import { guideTourWavUrl } from '@/components/guided-tour/guideTourWavUrl';

export const NOTIFICATIONS_GUIDE_ROOT_ID = 'notifications-guide-root';
export const NOTIFICATIONS_GUIDE_AUDIO_LS_KEY =
	'notifications-guide-audio-enabled';
export const NOTIFICATIONS_GUIDE_TOUR_FOLDER = 'notifications-guide';

export const NOTIFICATIONS_GUIDE_STEP_DEFS: readonly GuideStepDef[] = [
	{ id: 'intro', highlightSelector: null },
	{ id: 'filters', highlightSelector: '[data-nc-guide="filters"]' },
	{ id: 'feed', highlightSelector: '[data-nc-guide="feed"]' },
	{ id: 'footer', highlightSelector: '[data-nc-guide="footer"]' },
	{ id: 'outro', highlightSelector: null },
] as const;

export function notificationsGuideWavUrl(stepId: string): string {
	return guideTourWavUrl(NOTIFICATIONS_GUIDE_TOUR_FOLDER, stepId);
}
