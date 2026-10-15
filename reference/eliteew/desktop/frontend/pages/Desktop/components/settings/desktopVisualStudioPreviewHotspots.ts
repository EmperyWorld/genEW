/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Hotspot ids and button chrome for Visual Studio interactive preview regions.
 *
 * Invariants:
 * - Region ids match anchors registered from `DesktopVisualStudioPreview`.
 *
 * Related:
 * - `DesktopVisualStudioPreview.tsx`, `DesktopVisualStudioPreviewInteractive.tsx`
 */

import { cn } from '@/utils/cn';
import { buildDesktopSettingsFieldElementId } from '../../utils/desktopSettingsFieldElementIds';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '../DesktopAppChrome';
import type { TabId } from './desktopSettingsShared.types';

export type VisualStudioPreviewHotspotId =
	| 'scene'
	| 'displayFont'
	| 'bodyFont'
	| 'window'
	| 'taskbar'
	| 'widget'
	| 'morph'
	| 'motion';

export type VisualStudioPreviewHotspotHandlers = {
	activeHotspot: VisualStudioPreviewHotspotId | null;
	onHotspotClick: (id: VisualStudioPreviewHotspotId) => void;
	/** Pause morph demo while a popover is open or the preview is hovered. */
	pauseMorphDemo: boolean;
	registerAnchor: (
		id: VisualStudioPreviewHotspotId,
		element: HTMLElement | null
	) => void;
};

export const VISUAL_STUDIO_PREVIEW_HOTSPOT_ORDER: readonly VisualStudioPreviewHotspotId[] =
	[
		'bodyFont',
		'displayFont',
		'scene',
		'window',
		'taskbar',
		'widget',
		'morph',
		'motion',
	] as const;

export const VISUAL_STUDIO_HOTSPOT_HINT_KEY: Record<
	VisualStudioPreviewHotspotId,
	| 'hotspotHintBodyFont'
	| 'hotspotHintDisplayFont'
	| 'hotspotHintScene'
	| 'hotspotHintWindow'
	| 'hotspotHintTaskbar'
	| 'hotspotHintWidget'
	| 'hotspotHintMorph'
	| 'hotspotHintMotion'
> = {
	bodyFont: 'hotspotHintBodyFont',
	displayFont: 'hotspotHintDisplayFont',
	scene: 'hotspotHintScene',
	window: 'hotspotHintWindow',
	taskbar: 'hotspotHintTaskbar',
	widget: 'hotspotHintWidget',
	morph: 'hotspotHintMorph',
	motion: 'hotspotHintMotion',
};

export const VISUAL_STUDIO_HOTSPOT_LEGEND_KEY: Record<
	VisualStudioPreviewHotspotId,
	| 'hotspotLegendBodyFont'
	| 'hotspotLegendDisplayFont'
	| 'hotspotLegendScene'
	| 'hotspotLegendWindow'
	| 'hotspotLegendTaskbar'
	| 'hotspotLegendWidget'
	| 'hotspotLegendMorph'
	| 'hotspotLegendMotion'
> = {
	bodyFont: 'hotspotLegendBodyFont',
	displayFont: 'hotspotLegendDisplayFont',
	scene: 'hotspotLegendScene',
	window: 'hotspotLegendWindow',
	taskbar: 'hotspotLegendTaskbar',
	widget: 'hotspotLegendWidget',
	morph: 'hotspotLegendMorph',
	motion: 'hotspotLegendMotion',
};

export type VisualStudioSettingsNavigateTarget = {
	tab: TabId;
	elementId: string;
};

export function visualStudioHotspotNavigateTarget(
	id: VisualStudioPreviewHotspotId
): VisualStudioSettingsNavigateTarget {
	switch (id) {
		case 'window':
			return {
				tab: 'chrome',
				elementId: buildDesktopSettingsFieldElementId(
					'profile_ui',
					'desktop_window_style'
				),
			};
		case 'taskbar':
			return {
				tab: 'chrome',
				elementId: buildDesktopSettingsFieldElementId(
					'profile_ui',
					'desktop_taskbar_style'
				),
			};
		case 'widget':
			return {
				tab: 'shell',
				elementId: buildDesktopSettingsFieldElementId(
					'profile_ui',
					'desktop_widgets_style'
				),
			};
		case 'bodyFont':
			return {
				tab: 'personalize',
				elementId: buildDesktopSettingsFieldElementId(
					'profile_ui',
					'desktop_font_body'
				),
			};
		case 'displayFont':
			return {
				tab: 'personalize',
				elementId: buildDesktopSettingsFieldElementId(
					'profile_ui',
					'desktop_font_display'
				),
			};
		case 'scene':
			return {
				tab: 'personalize',
				elementId: buildDesktopSettingsFieldElementId(
					'profile_ui',
					'desktop_scene_depth'
				),
			};
		case 'morph':
		case 'motion':
			return {
				tab: 'personalize',
				elementId: buildDesktopSettingsFieldElementId(
					'profile_ui',
					'desktop_shell_motion'
				),
			};
		default:
			return {
				tab: 'personalize',
				elementId: buildDesktopSettingsFieldElementId(
					'profile_ui',
					'visual_studio_preview'
				),
			};
	}
}

export function visualStudioPreviewHotspotButtonClass(
	active: boolean,
	withChipLabel = false
): string {
	return cn(
		'absolute inset-0 z-20 rounded-lg border border-transparent bg-transparent outline-none',
		'transition-[background-color,box-shadow] duration-150',
		DESKTOP_CHROME_FOCUS_VISIBLE,
		'group-hover/hotspot:bg-[rgb(var(--desktop-accent-rgb)/0.07)]',
		'group-hover/hotspot:shadow-[inset_0_0_0_1px_rgb(var(--desktop-accent-rgb)/0.32)]',
		'group-focus-within/hotspot:bg-[rgb(var(--desktop-accent-rgb)/0.07)]',
		'group-focus-within/hotspot:shadow-[inset_0_0_0_1px_rgb(var(--desktop-accent-rgb)/0.32)]',
		active &&
			'bg-[rgb(var(--desktop-accent-rgb)/0.14)] shadow-[inset_0_0_0_1px_rgb(var(--desktop-accent-rgb)/0.55),0_0_12px_rgb(var(--desktop-accent-rgb)/0.18)]',
		withChipLabel &&
			'flex items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-white/85'
	);
}
