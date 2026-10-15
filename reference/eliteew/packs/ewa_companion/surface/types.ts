/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Types for companion universal output surface modes.
 *
 * Invariants:
 * - ``mode`` values mirror server ``output_surface.mode`` contract.
 * - ``file_list`` renders server-provided EwaFile rows; ``document_editor`` opens a selected item.
 *
 * Related:
 * - src/features/ewa/companionOutputSurface/CompanionOutputSurface.tsx
 */

export type CompanionOutputSurfaceMode =
	| 'chat'
	| 'workflow_builder'
	| 'workflow_dag_builder'
	| 'workflow_edit'
	| 'file_list'
	| 'document_editor'
	| 'music_xl_base_wizard'
	| 'roadmap'
	| 'script'
	| 'my_phrases';

export type CompanionOutputSurfaceState = {
	mode: CompanionOutputSurfaceMode;
	payload?: Record<string, unknown>;
};

export const COMPANION_OUTPUT_SURFACE_MODES: readonly CompanionOutputSurfaceMode[] =
	[
		'chat',
		'workflow_builder',
		'workflow_dag_builder',
		'workflow_edit',
		'file_list',
		'document_editor',
		'music_xl_base_wizard',
		'roadmap',
		'script',
		'my_phrases',
	] as const;

export function isCompanionOutputSurfaceMode(
	value: string | null | undefined
): value is CompanionOutputSurfaceMode {
	return COMPANION_OUTPUT_SURFACE_MODES.includes(
		value as CompanionOutputSurfaceMode
	);
}

export function coerceCompanionOutputSurface(
	raw: unknown
): CompanionOutputSurfaceState | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const mode = (raw as { mode?: unknown }).mode;
	if (!isCompanionOutputSurfaceMode(String(mode || ''))) return null;
	const payload = (raw as { payload?: unknown }).payload;
	return {
		mode: mode as CompanionOutputSurfaceMode,
		payload:
			payload && typeof payload === 'object' && !Array.isArray(payload)
				? (payload as Record<string, unknown>)
				: undefined,
	};
}
