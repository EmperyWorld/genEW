/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Constants and step anchors for Widget Shelf (notes/todos) guided tour (GT-10d).
 *
 * Related:
 * - DesktopWidgetShelfApp.tsx, public/audio/widget-shelf-guide/
 */

import type { GuideStepDef } from '@/components/guided-tour/useBuiltGuideSteps';
import { guideTourWavUrl } from '@/components/guided-tour/guideTourWavUrl';

export const WIDGET_SHELF_GUIDE_ROOT_ID = 'widget-shelf-guide-root';
export const WIDGET_SHELF_GUIDE_AUDIO_LS_KEY =
	'widget-shelf-guide-audio-enabled';
export const WIDGET_SHELF_GUIDE_TOUR_FOLDER = 'widget-shelf-guide';

export const WIDGET_SHELF_GUIDE_STEP_DEFS: readonly GuideStepDef[] = [
	{ id: 'intro', highlightSelector: null },
	{ id: 'tabs', highlightSelector: '[data-widget-shelf-guide="tabs"]' },
	{
		id: 'notes-pane',
		highlightSelector: '[data-widget-shelf-guide="notes-pane"]',
	},
	{
		id: 'todos-pane',
		highlightSelector: '[data-widget-shelf-guide="todos-pane"]',
	},
	{
		id: 'local-hint',
		highlightSelector: '[data-widget-shelf-guide="local-hint"]',
	},
	{ id: 'outro', highlightSelector: null },
] as const;

export function widgetShelfGuideWavUrl(stepId: string): string {
	return guideTourWavUrl(WIDGET_SHELF_GUIDE_TOUR_FOLDER, stepId);
}
