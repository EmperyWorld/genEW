/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * User-facing widget slot labels and optional help copy for Settings Center.
 *
 * Invariants:
 * - Slot type ids match `DesktopWidgetLayoutSlot.type` wire keys.
 *
 * Related:
 * - `desktopSettingsExpansionWidgetSlots.tsx`
 * - `DesktopSettingsExpansionWidgetPanelCard.tsx`
 */

import type { DesktopWidgetLayoutSlot } from '../../../types/desktopExpansion.types';

export const DESKTOP_WIDGET_SLOT_TYPE_IDS = [
	'notes',
	'todos',
	'favorites',
	'ewdesk',
	'notifications',
	'now-playing',
	'project-shortcuts',
	'recent-content',
] as const;

export type DesktopWidgetSlotTypeId =
	(typeof DESKTOP_WIDGET_SLOT_TYPE_IDS)[number];

type WidgetSlotTranslate = (
	key: string,
	options?: { defaultValue?: string }
) => string;

export function resolveDesktopWidgetSlotTypeId(
	slot: Pick<DesktopWidgetLayoutSlot, 'id' | 'type'>
): string {
	return slot.type ?? slot.id;
}

export function buildDesktopWidgetSlotLabel(
	t: WidgetSlotTranslate,
	slotTypeId: string
): string {
	return t(`settingsPanel.widgetSlot.${slotTypeId}`, {
		defaultValue: slotTypeId,
	});
}

/** Returns undefined when no localized help exists for the slot type. */
export function buildDesktopWidgetSlotHelpText(
	t: WidgetSlotTranslate,
	slotTypeId: string
): string | undefined {
	const key = `settingsPanel.widgetSlotDesc.${slotTypeId}`;
	const text = t(key);
	return text === key ? undefined : text;
}
