import type { CuratedWorkspaceLayoutTemplateId } from './desktopCuratedWorkspaceLayoutTemplates';

/**
 * Сценарные подписи к тем же snap-геометриям, что «кураторские» шаблоны половин/третей/четвертей:
 * сохранённые пресеты в shell_state имеют понятное имя (редактор+чат, студия и т.д.);
 * приложения всегда из текущих открытых окон пользователя по z-index (без захардкоженного набора приложений).
 */
export const DESKTOP_SCENARIO_WINDOW_LAYOUTS = [
	{
		id: 'editorChat',
		geometryTemplateId: 'halfHorizontal',
	},
	{
		id: 'studioResult',
		geometryTemplateId: 'thirdsHorizontal',
	},
	{
		id: 'reviewQuarter',
		geometryTemplateId: 'gridQuarters',
	},
] as const;

export type DesktopScenarioWindowLayoutId =
	(typeof DESKTOP_SCENARIO_WINDOW_LAYOUTS)[number]['id'];

export function scenarioGeometryTemplate(
	id: DesktopScenarioWindowLayoutId
): CuratedWorkspaceLayoutTemplateId {
	const row = DESKTOP_SCENARIO_WINDOW_LAYOUTS.find((r) => r.id === id);
	if (!row) {
		throw new Error(`Unknown scenario layout id: ${String(id)}`);
	}
	return row.geometryTemplateId;
}
