import type { SnapZone } from '../types/desktop.types';

/** Зоны snap без null — для массивов кураторских раскладок. */
export type SnapZoneConcrete = Exclude<SnapZone, null>;

/**
 * Шаблоны раскладки открытых окон текущего стола (половины / трети / четверти).
 * Применение: по убыванию z-index первое окно занимает первую зону в {@link zones}.
 */
export const DESKTOP_CURATED_WORKSPACE_LAYOUTS = [
	{
		id: 'halfHorizontal',
		zones: ['left', 'right'] as SnapZoneConcrete[],
	},
	{
		id: 'thirdsHorizontal',
		zones: ['left-third', 'center-third', 'right-third'] as SnapZoneConcrete[],
	},
	{
		id: 'gridQuarters',
		zones: [
			'top-left',
			'top-right',
			'bottom-left',
			'bottom-right',
		] as SnapZoneConcrete[],
	},
] as const;

export type CuratedWorkspaceLayoutTemplateId =
	(typeof DESKTOP_CURATED_WORKSPACE_LAYOUTS)[number]['id'];

export function curatedLayoutZones(
	id: CuratedWorkspaceLayoutTemplateId
): readonly SnapZoneConcrete[] {
	const row = DESKTOP_CURATED_WORKSPACE_LAYOUTS.find((x) => x.id === id);
	return row ? [...row.zones] : [];
}
