/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Fallback mapping from restored desktop window titles to `appComponent` when metadata is missing.
 *
 * Invariants:
 * - Keys are human-visible titles; duplicates map to the same component intentionally for localization drift.
 * - Legacy titles **AMKA** / **EWA** both resolve to **EwaApp** after the platform rename.
 *
 * Related:
 * - src/pages/Desktop/types/desktop.types.ts
 */

import type { WindowState } from '../types/desktop.types';

/** Fallback: resolve appComponent by window title when appComponent is missing (e.g. corrupted restore). */
export const DESKTOP_WINDOW_TITLE_TO_APP_COMPONENT: Record<string, string> = {
	'Музыкальный плеер': 'MusicPlayer',
	'Контент Менеджер': 'ContentManagerPro',
	Транскрибация: 'StudioGU',
	ЮГСтудия: 'UGS',
	'Студия Аудио': 'StudioGU',
	'Студия ГУ': 'StudioGU',
	'Редактор Документов': 'DocEditor',
	'Веб-студия изображений': 'ImageStudio',
	'Студия изображений (UGS)': 'ImageStudio',
	'Голосовой Штаб': 'StudioGU',
	'Генератор песен': 'MusicForgeApp',
	'Эволюционная студия песен': 'MusicForgeApp',
	'Студия песен': 'MusicForgeApp',
	MusicForge: 'MusicForgeApp',
	'Новая студия песен': 'MusicForgeApp',
	'Студия изображений': 'ImageStudio',
	'Студия видео': 'VideoStudio',
	'GAF Chat': 'GAFChatApp',
	'Elite Chat': 'GAFChatApp',
	EliteChat: 'GAFChatApp',
	ГАФМе: 'GAFChatApp',
	GAF: 'GAFChatApp',
	ГАФ: 'GAFChatApp',
	'GAF Me': 'GAFChatApp',
	'ГАФ Ме': 'GAFChatApp',
	'GAF Ме': 'GAFChatApp',
	Связи: 'SocialHubApp',
	Connections: 'SocialHubApp',
	Друзья: 'SocialHubApp',
	'Буфер обмена': 'ClipboardManager',
	Профиль: 'SocialHubApp',
	Дашборд: 'UGS',
	'Магазин приложений': 'AppStore',
	'Настройки рабочего стола': 'DesktopShellSettings',
	'Настройки Безраздельного мира': 'DesktopShellSettings',
	'Content Manager': 'ContentManagerPro',
	'Music Player': 'MusicPlayer',
	'Music Evolution': 'MusicForgeApp',
	'Music Forge': 'MusicForgeApp',
	POEMMA: 'PoemmaApp',
	'Карта бизнеса': 'PoemmaApp',
	'О проекте': 'ProjectAboutApp',
	'Empery Nexus': 'EmperyNexusChronicleApp',
	'Voice Studio': 'StudioGU',
	'Doc Editor': 'DocEditor',
	'Image Studio': 'ImageStudio',
	'Video Studio': 'VideoStudio',
	Clipboard: 'ClipboardManager',
	'User Profile': 'SocialHubApp',
	Friends: 'SocialHubApp',
	'Elite Dashboard V3': 'UGS',
	'UGS Хаб': 'UGSHubApp',
	'UGS Hub': 'UGSHubApp',
	'App Store': 'AppStore',
	'Desktop settings': 'DesktopShellSettings',
	'Админ-панель': 'UnifiedAdminApp',
	'Site Studio': 'UserSiteStudio',
	'Мой сайт': 'KirsClientSite',
	'Сайт заказчика': 'KirsClientSite',
	'Центр уведомлений': 'NotificationsApp',
	'Notification center': 'NotificationsApp',
	EWA: 'EwaApp',
	AMKA: 'EwaApp',
	EWRP: 'EWRP',
	Presentations: 'EWRP',
	Презентации: 'EWRP',
};

export function resolveDesktopWindowAppComponent(
	componentName?: string,
	windowState?: WindowState
): string | null {
	if (componentName && componentName.trim() !== '') {
		return componentName;
	}
	if (windowState?.title) {
		return DESKTOP_WINDOW_TITLE_TO_APP_COMPONENT[windowState.title] ?? null;
	}
	return null;
}
