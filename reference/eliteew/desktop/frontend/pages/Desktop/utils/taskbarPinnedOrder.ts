import type { DesktopItem } from '../types/desktop.types';

/**
 * Закреплённые приложения в том же порядке, что и на таскбаре: сетка (y, затем x),
 * без дубля «Студия ГУ» в пине (как в Taskbar).
 */
export function getTaskbarPinnedApps(apps: DesktopItem[]): DesktopItem[] {
	return apps
		.filter(
			(a) => a.type === 'app' && a.isPinned && a.appComponent !== 'StudioGU'
		)
		.sort((a, b) =>
			a.position.y !== b.position.y
				? a.position.y - b.position.y
				: a.position.x - b.position.x
		)
		.slice(0, 10);
}

/** Win+1…9: первые девять закреплений — совпадают с иконками слева направо на таскбаре. */
export function getQuickLaunchPinnedApps(apps: DesktopItem[]): DesktopItem[] {
	return getTaskbarPinnedApps(apps).slice(0, 9);
}
