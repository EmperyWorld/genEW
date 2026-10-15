/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared helpers and class tokens for companion output surface panels.
 *
 * Related:
 * - CompanionSurfacePanel.tsx
 * - EwaCompanionChatPanel.tsx
 * - CompanionSlimChatDock.tsx
 */

import type { CompanionOutputSurfaceMode } from '@/features/ewa/companionOutputSurface/types';

/** Modes where the full transcript composer and image attach are shown. */
export const COMPANION_COMPOSER_MODES: readonly CompanionOutputSurfaceMode[] = [
	'chat',
] as const;

/** Modes where the slim chat dock keeps the orchestrator available. */
export const COMPANION_SLIM_CHAT_DOCK_MODES: readonly CompanionOutputSurfaceMode[] =
	[
		'document_editor',
		'file_list',
		'workflow_builder',
		'workflow_dag_builder',
		'workflow_edit',
		'music_xl_base_wizard',
		'roadmap',
		'script',
		'my_phrases',
	] as const;

export function isCompanionComposerVisible(
	mode: CompanionOutputSurfaceMode
): boolean {
	return COMPANION_COMPOSER_MODES.includes(mode);
}

export function isCompanionSlimChatDockVisible(
	mode: CompanionOutputSurfaceMode
): boolean {
	return COMPANION_SLIM_CHAT_DOCK_MODES.includes(mode);
}

export function isCompanionSurfacePanelMode(
	mode: CompanionOutputSurfaceMode
): boolean {
	return mode !== 'chat';
}

export const COMPANION_SURFACE_FIELD_CLASS =
	'rounded-md border border-(--companion-divider) bg-(--desktop-surface-soft)/35 px-2.5 py-1.5 text-[13px] text-(--desktop-text-primary) placeholder:text-(--companion-text-soft)';

export const COMPANION_SURFACE_LABEL_CLASS =
	'text-[11px] font-medium text-(--companion-text-soft)';

export const COMPANION_SURFACE_SECTION_CLASS =
	'rounded-lg border border-(--companion-divider)/75 bg-(--desktop-surface-soft)/15 p-3';

/** Shared chrome motion for surface / slim-dock enter (respects reduced motion). */
export const COMPANION_CHROME_TRANSITION_CLASS =
	'transition-[opacity,background-color,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none';

/** Slim chat dock shell — aligned with surface section chrome. */
export const COMPANION_SLIM_CHAT_DOCK_SHELL_CLASS =
	'flex shrink-0 flex-col gap-1.5 rounded-xl border border-(--companion-divider)/80 bg-(--desktop-surface-soft)/25 px-2.5 py-2';
