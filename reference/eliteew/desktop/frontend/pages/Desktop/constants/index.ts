/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop constants, default app shortcuts, visual defaults, and shell app behavior flags.
 *
 * Invariants:
 * - Default app ids and appComponent names are stable once migrations reference them.
 * - Domain app data stays outside desktop_configs.shell_state.
 *
 * Related:
 * - src/pages/Desktop/utils/desktopAppRegistry.ts
 */

import {
	ArrowDownTrayIcon,
	CircleStackIcon,
	DocumentTextIcon,
	MusicalNoteIcon,
	PhotoIcon,
	PresentationChartBarIcon,
	SparklesIcon,
	Squares2X2Icon,
	TrashIcon,
} from '@heroicons/react/24/outline';
import * as React from 'react';
import type { DesktopItem, FolderColor } from '../types/desktop.types';
import { getDesktopAppIconNode } from '../utils/desktopVisualSystem';
import { DESKTOP_ICON_SVG_QUALITY } from './lucideDesktop';

export {
	builtinDesktopWallpaperPath,
	DEFAULT_DESKTOP_WALLPAPER_STYLE,
	DESKTOP_WALLPAPER_PUBLIC_BASE,
	isBuiltInWallpaperStyle,
	WALLPAPER_COUNT,
	WALLPAPERS,
} from './wallpapers';

/** Folder swatches: muted gradients so they read as accents, not a second rainbow layer. */
export const FOLDER_COLORS: FolderColor[] = [
	{
		id: 'yellow',
		color: 'text-yellow-400/90',
		gradient: 'from-yellow-500/85 to-amber-600/85',
	},
	{
		id: 'blue',
		color: 'text-blue-400/90',
		gradient: 'from-blue-500/85 to-cyan-600/85',
	},
	{
		id: 'green',
		color: 'text-green-400/90',
		gradient: 'from-green-500/85 to-emerald-600/85',
	},
	{
		id: 'pink',
		color: 'text-pink-400/90',
		gradient: 'from-pink-500/85 to-rose-600/85',
	},
	{
		id: 'purple',
		color: 'text-purple-400/90',
		gradient: 'from-purple-500/85 to-violet-600/85',
	},
	{
		id: 'orange',
		color: 'text-orange-400/90',
		gradient: 'from-orange-500/85 to-red-600/85',
	},
	{
		id: 'cyan',
		color: 'text-cyan-400/90',
		gradient: 'from-cyan-500/85 to-teal-600/85',
	},
];

export const ACCENT_COLORS = [
	{
		id: 'blue',
		name: 'Синий',
		className: 'bg-blue-500',
		hex: '#3b82f6',
		rgb: '59 130 246',
	},
	{
		id: 'purple',
		name: 'Фиолетовый',
		className: 'bg-purple-500',
		hex: '#a855f7',
		rgb: '168 85 247',
	},
	{
		id: 'pink',
		name: 'Розовый',
		className: 'bg-pink-500',
		hex: '#ec4899',
		rgb: '236 72 153',
	},
	{
		id: 'green',
		name: 'Зеленый',
		className: 'bg-green-500',
		hex: '#10b981',
		rgb: '16 185 129',
	},
	{
		id: 'orange',
		name: 'Оранжевый',
		className: 'bg-orange-500',
		hex: '#f97316',
		rgb: '249 115 22',
	},
	{
		id: 'cyan',
		name: 'Голубой',
		className: 'bg-cyan-500',
		hex: '#06b6d4',
		rgb: '6 182 212',
	},
	{
		id: 'gray',
		name: 'Серый',
		className: 'bg-gray-500',
		hex: '#6b7280',
		rgb: '107 114 128',
	},
	{
		id: 'steel',
		name: 'Стальной',
		className: 'bg-slate-500',
		hex: '#64748b',
		rgb: '100 116 139',
	},
	{
		id: 'charcoal',
		name: 'Светло-чёрный',
		className: 'bg-zinc-700',
		hex: '#3f3f46',
		rgb: '63 63 70',
	},
] as const;

/**
 * Приложения с фоновой логикой (провайдеры): при сворачивании попадают в область уведомлений;
 * крестик закрывает окно, процессы на уровне Desktop при этом могут продолжаться.
 */
export const PERSISTENT_APP_COMPONENTS = new Set<string>([
	'MusicPlayer',
	'GAFChatApp',
	'VideoCallApp',
	'FriendsApp',
	'SocialHubApp',
	'UGSHubApp',
]);

export function isPersistentDesktopApp(
	appComponent: string | null | undefined
): boolean {
	return (
		typeof appComponent === 'string' &&
		appComponent.length > 0 &&
		PERSISTENT_APP_COMPONENTS.has(appComponent)
	);
}

export const DEFAULT_APPS: DesktopItem[] = [
	{
		id: 'app-store',
		name: 'Магазин приложений',
		type: 'app',
		color: 'text-indigo-400',
		gradient: 'from-indigo-500 to-purple-600',
		position: { x: 130, y: 20 },
		appComponent: 'AppStore',
		icon: getDesktopAppIconNode('AppStore'),
		description: 'Установка и удаление приложений',
		isPinned: true,
	},
	{
		id: 'desktop-shell-settings',
		name: 'Настройки Безраздельного мира',
		type: 'app',
		color: 'text-violet-400',
		gradient: 'from-violet-500 to-purple-600',
		position: { x: 20, y: 520 },
		appComponent: 'DesktopShellSettings',
		icon: getDesktopAppIconNode('DesktopShellSettings'),
		description: 'Тема, обои, иконки, оболочка и производительность',
		isSystem: true,
		isPinned: false,
	},
	{
		id: 'app-content',
		name: 'Content Manager',
		type: 'app',
		color: 'text-cyan-400',
		gradient: 'from-cyan-500 to-blue-600',
		// Next grid cell on row 1: OFFSET + 3*GRID_SIZE (was duplicate with app-store at 130,20)
		position: { x: 350, y: 20 },
		appComponent: 'ContentManagerPro',
		icon: getDesktopAppIconNode('ContentManagerPro'),
		description: 'Управление файлами',
		isPinned: true,
	},
	{
		id: 'app-ugs',
		name: 'UGS Studio',
		type: 'app',
		color: 'text-(--desktop-text-muted)',
		gradient:
			'from-[rgb(var(--desktop-bg-secondary-rgb))] to-[rgb(var(--desktop-border-rgb))]',
		position: { x: 130, y: 240 },
		appComponent: 'UGS',
		icon: getDesktopAppIconNode('UGS'),
		description: 'Dashboard UGS; очередь и история — в приложении «UGS Хаб»',
		isPinned: true,
	},
	{
		id: 'app-ugs-hub',
		name: 'UGS Хаб',
		type: 'app',
		color: 'text-cyan-400',
		gradient: 'from-cyan-600 to-slate-700',
		position: { x: 130, y: 350 },
		appComponent: 'UGSHubApp',
		icon: getDesktopAppIconNode('UGSHubApp'),
		description: 'Активные задачи, история и очередь генераций',
		isPinned: true,
	},
	{
		id: 'app-ewrp',
		name: 'EWRP',
		type: 'app',
		color: 'text-cyan-400',
		gradient: 'from-cyan-500 to-teal-600',
		position: { x: 240, y: 20 },
		appComponent: 'EWRP',
		icon: getDesktopAppIconNode('EWRP'),
		description: 'Революционные презентации — лендинг, скриншоты, PDF',
		category: 'productivity',
		isPinned: true,
	},
	{
		id: 'app-studio-gu',
		name: 'Студия ГУ',
		type: 'app',
		color: 'text-emerald-400',
		gradient: 'from-emerald-500 to-teal-600',
		position: { x: 240, y: 130 },
		appComponent: 'StudioGU',
		icon: getDesktopAppIconNode('StudioGU'),
		description: 'Голосовой диалог, штаб, Live Voice и транскрипция файлов',
		isPinned: true,
	},
	{
		id: 'app-docs',
		name: 'Doc Editor',
		type: 'app',
		color: 'text-amber-400',
		gradient: 'from-amber-500 to-yellow-600',
		position: { x: 240, y: 240 },
		appComponent: 'DocEditor',
		icon: getDesktopAppIconNode('DocEditor'),
		isPinned: true,
	},
	{
		id: 'app-doc-editor-v2',
		name: 'Редактор документов V2',
		type: 'app',
		color: 'text-amber-200',
		gradient: 'from-amber-400 via-orange-500 to-yellow-600',
		position: { x: 350, y: 240 },
		appComponent: 'DocEditorV2',
		icon: getDesktopAppIconNode('DocEditorV2'),
		description:
			'Новый редактор документов: совместная работа, ЕВА рядом, импорт и экспорт',
		category: 'productivity',
		allowMultipleWindows: true,
		maxWindowInstances: 4,
		isPinned: false,
		isFeaturedNew: true,
	},
	{
		id: 'app-image-studio',
		name: 'Студия изображений',
		type: 'app',
		color: 'text-violet-400',
		gradient: 'from-violet-500 to-fuchsia-600',
		position: { x: 240, y: 400 },
		appComponent: 'ImageStudio',
		icon: getDesktopAppIconNode('ImageStudio'),
		description: 'Генерация по тексту и редактирование по инструкции',
		category: 'productivity',
	},
	{
		id: 'app-video-studio',
		name: 'Студия видео',
		type: 'app',
		color: 'text-violet-400',
		gradient: 'from-violet-500 to-fuchsia-600',
		position: { x: 240, y: 520 },
		appComponent: 'VideoStudio',
		icon: getDesktopAppIconNode('VideoStudio'),
		description: 'Изображение → видео (Wan 2.2 I2V)',
		category: 'productivity',
	},
	// DocEditor is the single document surface on Desktop.
	{
		id: 'app-social-hub',
		name: 'Связи',
		type: 'app',
		color: 'text-emerald-400',
		gradient: 'from-emerald-500 to-cyan-600',
		position: { x: 460, y: 350 },
		appComponent: 'SocialHubApp',
		icon: getDesktopAppIconNode('SocialHubApp'),
		description:
			'Заявки, контакты, списки, приватность и приложение на телефоне',
		category: 'communication',
	},
	{
		id: 'app-gaf-chat',
		name: 'GAF Chat',
		type: 'app',
		color: 'text-teal-400',
		gradient: 'from-teal-500 via-cyan-600 to-sky-600',
		position: { x: 460, y: 460 },
		appComponent: 'GAFChatApp',
		icon: getDesktopAppIconNode('GAFChatApp'),
		description:
			'Личные чаты 1:1 с друзьями: переписка, история, индикатор непрочитанного, открытие из уведомлений',
		category: 'communication',
	},
	{
		id: 'app-video-call',
		name: 'Видеозвонок',
		type: 'app',
		color: 'text-sky-300',
		gradient: 'from-sky-500 via-indigo-600 to-violet-600',
		position: { x: 570, y: 460 },
		appComponent: 'VideoCallApp',
		icon: getDesktopAppIconNode('VideoCallApp'),
		description: 'Внутренние видеозвонки между пользователями сервиса',
		category: 'communication',
		allowMultipleWindows: true,
		maxWindowInstances: 4,
	},
	{
		id: 'app-desktop-ai-chat',
		name: 'Умный чат',
		type: 'app',
		color: 'text-violet-300',
		gradient: 'from-violet-600 via-indigo-600 to-sky-600',
		position: { x: 460, y: 570 },
		appComponent: 'DesktopAiChatApp',
		icon: getDesktopAppIconNode('DesktopAiChatApp'),
		description:
			'Чат с помощником: вложения, память, проектный контекст, умные действия и голос',
		category: 'productivity',
	},
	{
		id: 'app-music-forge',
		name: 'Студия песен',
		type: 'app',
		color: 'text-fuchsia-300',
		gradient: 'from-fuchsia-500 via-amber-400 to-violet-500',
		position: { x: 350, y: 240 },
		appComponent: 'MusicForgeApp',
		icon: getDesktopAppIconNode('MusicForgeApp'),
		description:
			'Опишите идею — студия сама соберёт текст, стиль и готовый трек',
		category: 'home',
		isFeaturedNew: true,
	},
	{
		id: 'app-music-player',
		name: 'Музыкальный плеер',
		type: 'app',
		color: 'text-violet-400',
		gradient: 'from-violet-500 to-purple-600',
		position: { x: 350, y: 350 },
		appComponent: 'MusicPlayer',
		icon: getDesktopAppIconNode('MusicPlayer'),
		description: 'Воспроизведение музыки из папки Музыка',
		category: 'home',
	},
	{
		id: 'app-notifications',
		name: 'Центр уведомлений',
		type: 'app',
		color: 'text-sky-400',
		gradient: 'from-sky-500 to-indigo-600',
		position: { x: 460, y: 20 },
		appComponent: 'NotificationsApp',
		icon: getDesktopAppIconNode('NotificationsApp'),
		description:
			'Единый центр: история уведомлений, фильтры и настройки звука, GAF и UGS',
		category: 'communication',
	},
	{
		id: 'app-widget-shelf',
		name: 'Заметки и задачи',
		type: 'app',
		color: 'text-amber-400',
		gradient: 'from-amber-500 to-orange-600',
		position: { x: 570, y: 260 },
		appComponent: 'DesktopWidgetShelfApp',
		icon: getDesktopAppIconNode('DesktopWidgetShelfApp'),
		description: 'Заметки и списки задач Безраздельного мира',
		category: 'productivity',
		isSystem: true,
	},
	{
		id: 'app-dashboard-favorites',
		name: 'Избранное',
		type: 'app',
		color: 'text-pink-400',
		gradient: 'from-pink-500 to-rose-600',
		position: { x: 620, y: 320 },
		appComponent: 'DesktopDashboardFavoritesApp',
		icon: getDesktopAppIconNode('DesktopDashboardFavoritesApp'),
		description: 'Быстрые ссылки на панели виджетов рабочего стола',
		category: 'productivity',
		isSystem: true,
	},
	{
		id: 'app-ewdesk',
		name: 'EWDesk',
		type: 'app',
		color: 'text-sky-300',
		gradient: 'from-sky-500 to-blue-600',
		position: { x: 350, y: 130 },
		appComponent: 'EWDeskApp',
		icon: getDesktopAppIconNode('EWDeskApp'),
		description: 'Новости и объявления компании',
		category: 'communication',
	},
	{
		id: 'app-survey-hub',
		name: 'Опросы',
		type: 'app',
		color: 'text-indigo-300',
		gradient: 'from-indigo-500 to-violet-600',
		position: { x: 400, y: 180 },
		appComponent: 'SurveyHubApp',
		icon: getDesktopAppIconNode('SurveyHubApp'),
		description: 'Интерактивные опросы с наградами за участие',
		category: 'productivity',
	},
	{
		id: 'app-about-project',
		name: 'О проекте',
		type: 'app',
		color: 'text-violet-300',
		gradient: 'from-violet-600 via-indigo-600 to-cyan-600',
		position: { x: 900, y: 20 },
		appComponent: 'ProjectAboutApp',
		icon: getDesktopAppIconNode(
			'ProjectAboutApp',
			React.createElement(PresentationChartBarIcon, {
				className: 'h-3.5 w-3.5 text-violet-100',
				strokeWidth: DESKTOP_ICON_SVG_QUALITY.stroke,
				'aria-hidden': true,
			})
		),
		description:
			'Интерактивная презентация EliteEW: экосистема, приложения и возможности',
		category: 'productivity',
		isPinned: true,
	},
	{
		id: 'app-empery-nexus-chronicle',
		name: 'Empery Nexus',
		type: 'app',
		color: 'text-amber-200',
		gradient: 'from-stone-800 via-amber-900 to-cyan-900',
		position: { x: 900, y: 120 },
		appComponent: 'EmperyNexusChronicleApp',
		icon: getDesktopAppIconNode(
			'EmperyNexusChronicleApp',
			React.createElement(SparklesIcon, {
				className: 'h-3.5 w-3.5 text-amber-100',
				strokeWidth: DESKTOP_ICON_SVG_QUALITY.stroke,
				'aria-hidden': true,
			})
		),
		description:
			'Живая хроника экосистемы: Abyss, Nexus и слои реальности EliteEW',
		category: 'productivity',
		isPinned: true,
	},
	{
		id: 'app-marketing-cabinet',
		name: 'Зал маркетинга',
		type: 'app',
		color: 'text-amber-300',
		gradient: 'from-amber-500 to-orange-600',
		position: { x: 680, y: 20 },
		appComponent: 'MarketingCabinet',
		icon: getDesktopAppIconNode('MarketingCabinet'),
		description: 'Дом → проект → позиционирование → свидетельства → оракулы',
		category: 'productivity',
	},
	{
		id: 'app-poemma',
		name: 'POEMMA',
		type: 'app',
		color: 'text-emerald-300',
		gradient: 'from-emerald-600 via-stone-500 to-amber-500',
		position: { x: 790, y: 20 },
		appComponent: 'PoemmaApp',
		icon: getDesktopAppIconNode(
			'PoemmaApp',
			React.createElement(DocumentTextIcon, {
				className: 'h-3.5 w-3.5 text-emerald-100',
				strokeWidth: DESKTOP_ICON_SVG_QUALITY.stroke,
				'aria-hidden': true,
			})
		),
		description:
			'Наглядная карта бизнеса Зои: смысл, 90 дней, прибыль, опыт и действия',
		category: 'productivity',
		isPinned: true,
	},
	{
		id: 'app-ewa',
		name: 'Спутник стола',
		type: 'app',
		color: 'text-violet-300',
		gradient: 'from-violet-600 via-indigo-600 to-sky-700',
		position: { x: 680, y: 350 },
		appComponent: 'EwaApp',
		icon: getDesktopAppIconNode(
			'EwaApp',
			React.createElement(SparklesIcon, {
				className: 'h-3.5 w-3.5 text-violet-100',
				strokeWidth: DESKTOP_ICON_SVG_QUALITY.stroke,
				'aria-hidden': true,
			})
		),
		description:
			'Ваш постоянный спутник на столе — спокойный диалог и тёплое присутствие.',
		category: 'productivity',
	},
	{
		id: 'app-professional-worlds',
		name: 'Professional Worlds',
		type: 'app',
		color: 'text-emerald-300',
		gradient: 'from-emerald-500 to-sky-700',
		position: { x: 570, y: 20 },
		appComponent: 'ProfessionalWorlds',
		icon: getDesktopAppIconNode('ProfessionalWorlds'),
		description:
			'Мир инструментов для специалистов: профиль, обучение, объекты, клиенты и умные подсказки',
		category: 'productivity',
	},
	{
		id: 'app-site-studio',
		name: 'Студия сайтов',
		type: 'app',
		color: 'text-sky-300',
		gradient: 'from-sky-500 to-indigo-600',
		position: { x: 680, y: 130 },
		appComponent: 'UserSiteStudio',
		icon: getDesktopAppIconNode('UserSiteStudio'),
		description:
			'Соберите и опубликуйте личный сайт: контент, витрина, админка и безопасный гостевой просмотр',
		category: 'developer',
		isPinned: true,
	},
	{
		id: 'app-site-manager-ops',
		name: 'Контроль сайтов',
		type: 'app',
		color: 'text-cyan-300',
		gradient: 'from-cyan-500 to-violet-700',
		position: { x: 790, y: 130 },
		appComponent: 'SiteManagerOps',
		icon: getDesktopAppIconNode('SiteManagerOps'),
		description:
			'Операторская панель сайтов: готовность сервиса, задачи, домены, проверки публикации и журнал событий',
		category: 'developer',
	},
	{
		id: 'app-local-service',
		name: 'Local Service',
		type: 'app',
		color: 'text-sky-300',
		gradient: 'from-sky-600 to-slate-700',
		position: { x: 570, y: 130 },
		appComponent: 'LocalServiceIframeApp',
		icon: getDesktopAppIconNode('LocalServiceIframeApp'),
		description: 'Встроенное окно для UI локального сервиса на 127.0.0.1:8080',
		category: 'developer',
		isPinned: true,
	},
	{
		id: 'app-kirs',
		name: 'КИРС',
		type: 'app',
		color: 'text-violet-300',
		gradient: 'from-violet-600 to-indigo-700',
		position: { x: 680, y: 240 },
		appComponent: 'KirsCuration',
		icon: getDesktopAppIconNode('KirsCuration'),
		description:
			'Курирование сайта по проекту: шаблон, публикация и доступ клиенту',
		category: 'productivity',
	},
	{
		id: 'app-kirs-client-site',
		name: 'Мой сайт',
		type: 'app',
		color: 'text-slate-300',
		gradient: 'from-slate-600 to-zinc-700',
		position: { x: 680, y: 350 },
		appComponent: 'KirsClientSite',
		icon: getDesktopAppIconNode('KirsClientSite'),
		description: 'Просмотр витрины сайта проекта при доступе из КИРС',
		category: 'productivity',
	},
	// Widgets
	{
		id: 'widget-clipboard',
		name: 'Буфер обмена',
		type: 'app',
		color: 'text-amber-400',
		gradient: 'from-amber-500 to-orange-500',
		position: { x: 460, y: 240 },
		appComponent: 'ClipboardManager',
		icon: getDesktopAppIconNode('ClipboardManager'),
		description: 'История копирований',
	},
];

export const DEFAULT_FOLDERS: DesktopItem[] = [
	{
		id: 'documents',
		name: 'Документы',
		type: 'folder',
		color: 'text-yellow-400',
		gradient: 'from-yellow-500 to-amber-600',
		position: { x: 20, y: 20 },
		isPinned: true,
		children: [],
		icon: React.createElement(DocumentTextIcon, {
			className: 'w-3.5 h-3.5 text-(--desktop-text-primary)',
			strokeWidth: 1.35,
		}),
	},
	{
		id: 'images',
		name: 'Изображения',
		type: 'folder',
		color: 'text-pink-400',
		gradient: 'from-pink-500 to-rose-600',
		position: { x: 20, y: 130 },
		children: [],
		icon: React.createElement(PhotoIcon, {
			className: 'w-3.5 h-3.5 text-(--desktop-text-primary)',
			strokeWidth: 1.35,
		}),
	},
	{
		id: 'projects',
		name: 'Проекты',
		type: 'folder',
		color: 'text-purple-400',
		gradient: 'from-purple-500 to-violet-600',
		position: { x: 20, y: 240 },
		children: [],
		icon: React.createElement(Squares2X2Icon, {
			className: 'w-3.5 h-3.5 text-(--desktop-text-primary)',
			strokeWidth: 1.35,
		}),
	},
	{
		id: 'downloads',
		name: 'Загрузки',
		type: 'folder',
		color: 'text-green-400',
		gradient: 'from-green-500 to-emerald-600',
		position: { x: 20, y: 350 },
		children: [],
		icon: React.createElement(ArrowDownTrayIcon, {
			className: 'w-3.5 h-3.5 text-(--desktop-text-primary)',
			strokeWidth: 1.35,
		}),
	},
	{
		id: 'content',
		name: 'Content Library',
		type: 'folder',
		color: 'text-cyan-400',
		gradient: 'from-cyan-500 to-blue-600',
		position: { x: 20, y: 460 },
		children: [],
		icon: React.createElement(CircleStackIcon, {
			className: 'w-3.5 h-3.5 text-(--desktop-text-primary)',
			strokeWidth: 1.35,
		}),
	},
	{
		id: 'ewa_file',
		name: 'EwaFile',
		type: 'folder',
		color: 'text-fuchsia-400',
		gradient: 'from-violet-500 to-cyan-500',
		position: { x: 130, y: 460 },
		isSystem: true,
		systemKey: 'ewa_file',
		children: [],
		icon: React.createElement(SparklesIcon, {
			className: 'w-3.5 h-3.5 text-(--desktop-text-primary)',
			strokeWidth: 1.35,
		}),
	},
	{
		id: 'trash',
		name: 'Корзина',
		type: 'folder',
		color: 'text-(--desktop-text-muted)',
		gradient:
			'from-[rgb(var(--desktop-bg-secondary-rgb))] to-[rgb(var(--desktop-border-rgb))]',
		position: { x: 20, y: 570 },
		children: [],
		icon: React.createElement(TrashIcon, {
			className: 'w-3.5 h-3.5 text-(--desktop-text-primary)',
			strokeWidth: 1.35,
		}),
	},
	{
		id: 'music',
		name: 'Музыка',
		type: 'folder',
		color: 'text-violet-400',
		gradient: 'from-violet-500 to-purple-600',
		position: { x: 20, y: 680 },
		children: [],
		icon: React.createElement(MusicalNoteIcon, {
			className: 'w-3.5 h-3.5 text-(--desktop-text-primary)',
			strokeWidth: 1.35,
		}),
	},
];

/**
 * App categories for Start Menu and catalog (order only; labels → i18n `desktopUi.appCategories.*`).
 */
export const DESKTOP_APP_CATEGORY_ORDER: string[] = [
	'productivity',
	'communication',
	'widgets',
	'home',
	'developer',
	'system',
];

/** Desktop icon grid: one canonical source for snap and collision */
export const DESKTOP_GRID = {
	GRID_SIZE: 110,
	OFFSET: 20,
	ICON_WIDTH: 100,
	ICON_HEIGHT: 110,
	/** Max position so icons stay within reasonable desktop area (min = OFFSET, used in desktopGrid) */
	MAX_X: 4000,
	MAX_Y: 4000,
} as const;

/** Grid step options for align-to-grid (configurable step) */
export type GridStepPreference = 'small' | 'medium' | 'large';
export const DESKTOP_GRID_STEPS: Record<GridStepPreference, number> = {
	small: 70,
	medium: 95,
	large: 125,
};

/** User preference for desktop icon size */
export type IconSizePreference = 'small' | 'medium' | 'large';

/** Icon dimensions and classes per config icon_size (slightly more compact, premium labels) */
export const DESKTOP_ICON_SIZES: Record<
	IconSizePreference,
	{ width: number; height: number; iconBox: string; label: string }
> = {
	small: {
		width: 80,
		height: 90,
		iconBox: 'w-9 h-9',
		label: 'w-full max-w-[72px] text-[10px] tracking-[0.02em]',
	},
	medium: {
		width: 100,
		height: 110,
		iconBox: 'w-11 h-11',
		label: 'w-full max-w-[88px] text-[11px] tracking-[0.02em]',
	},
	large: {
		width: 120,
		height: 130,
		iconBox: 'w-13 h-13',
		label: 'w-full max-w-[104px] text-sm tracking-[0.02em]',
	},
};

/**
 * Premium opaque tile for app icons across Desktop (desktop grid, Start Menu, pinned menus).
 * Container: solid shell tile; Inner: centers SVG with depth shadow (no backdrop-filter).
 */
export const DESKTOP_APP_ICON = {
	container:
		'flex items-center justify-center rounded-[1.05rem] border border-[var(--desktop-border-subtle)] bg-[linear-gradient(152deg,rgb(39,39,42)_0%,rgb(24,24,27)_48%,rgb(9,9,11)_100%)] shadow-[0_22px_52px_rgba(0,0,0,0.48)] overflow-hidden ring-1 ring-black/20',
	inner: `w-full h-full text-[var(--desktop-text-secondary)] flex items-center justify-center [&>*]:w-full [&>*]:h-full [&>svg]:w-3/4 [&>svg]:h-3/4 ${DESKTOP_ICON_SVG_QUALITY} drop-shadow-[0_5px_14px_rgba(0,0,0,0.42)]`,
} as const;

/**
 * Desktop design tokens: colors (RGB space-separated), radius, shadow, spacing. Applied on Desktop root.
 * Границы: `border-subtle` / `border-strong` — общий UI; `border-menu` — только `DesktopAppMenuSurface`;
 * `menu-tint` — доля в color-mix фона контекстных меню (см. DesktopAppChrome MENU_SURFACE).
 * Slim owner (follower-safe): `./desktopDesignTokens.ts`.
 */
export {
	DESKTOP_DEFAULT_ACCENT_RGB,
	DESKTOP_DESIGN_TOKENS,
} from './desktopDesignTokens';

/**
 * Surface class names aligned to DESKTOP_DESIGN_TOKENS (radius, shadow, spacing).
 * Use for key desktop surfaces to avoid local divergence.
 */
export const DESKTOP_SURFACE = {
	radius: 'rounded-[var(--desktop-radius)]',
	radiusLg: 'rounded-[var(--desktop-radius-lg)]',
	radiusXl: 'rounded-[var(--desktop-radius-xl)]',
	radiusFrame: 'rounded-[var(--desktop-radius-frame)]',
	radiusShell: 'rounded-[var(--desktop-radius-shell)]',
	radiusSection: 'rounded-[var(--desktop-radius-section)]',
	shadow: 'shadow-[0_28px_64px_-12px_rgba(0,0,0,0.42)]',
	shadowLg: 'shadow-[0_36px_72px_-16px_rgba(0,0,0,0.48)]',
	spacing: 'p-2',
	/** Между `spacing` и `spacingLg` (компактные панели ассистента, EWDesk и т.п.) */
	spacingMd: 'p-3',
	spacingLg: 'p-4',
	border: 'border border-[color:var(--desktop-border-subtle)]',
	borderSubtle: 'border border-[color:var(--desktop-border-subtle)]',
} as const;

/**
 * Typography hierarchy for desktop: title, body, meta.
 * Use for Taskbar, StartMenu, WidgetsPanel, NotificationCenter consistency.
 * Contrast: body/meta/caption/small align with `--desktop-*` surfaces; they meet WCAG AA (4.5:1) on dark shell.
 */
export const DESKTOP_TYPOGRAPHY = {
	/**
	 * Primary heading inside desktop app windows (single window / embedded).
	 * Prefer this over ad-hoc `text-2xl` / `text-3xl` hero titles.
	 */
	title:
		'text-lg font-semibold text-[var(--desktop-text-primary)] tracking-tight antialiased',
	/** Section heading (e.g. in settings tabs) */
	subtitle:
		'text-base font-semibold text-[var(--desktop-text-primary)] tracking-tight antialiased',
	/** Body text */
	body: 'text-sm text-[var(--desktop-text-secondary)] antialiased',
	/** Body text, muted (labels, empty states, secondary hints at sm size) */
	bodyMuted: 'text-sm text-[var(--desktop-text-muted)] antialiased',
	/** Secondary/meta (timestamps, hints) */
	meta: 'text-xs text-[var(--desktop-text-muted)] antialiased',
	/** Caption / small labels */
	caption:
		'text-[11px] text-[var(--desktop-text-muted)] tracking-wide antialiased',
	/** 11px without text color — use when parent sets semantic color (e.g. sync chip) */
	captionInherit: 'text-[11px] tracking-wide antialiased',
	/** Smallest (badges, overrides) */
	small: 'text-[10px] text-[var(--desktop-text-dim)] antialiased',
	/** Dense micro chip (floating widget KPI strip, tight tracking) */
	micro:
		'text-[9px] font-medium tracking-[0.08em] text-[var(--desktop-text-secondary)] antialiased',
	/** Hero clock on floating desktop widget */
	widgetClock:
		'text-[2.02rem] font-semibold leading-none tracking-[-0.055em] text-[var(--desktop-text-primary)] antialiased',
	/** Date line under widget clock */
	widgetDate:
		'text-xs font-medium text-[var(--desktop-text-secondary)] antialiased',
	/** Credits / KPI numeric strip (tabular) */
	widgetKpi:
		'text-[10px] font-semibold leading-none tracking-[0.06em] text-[rgb(var(--desktop-fg-primary-rgb)/0.96)] [font-variant-numeric:tabular-nums] antialiased',
	/** Uppercase micro label (e.g. "Сейчас играет") */
	labelOverline:
		'text-[10px] uppercase tracking-[0.18em] text-[var(--desktop-text-muted)] antialiased',
	/** Track / primary title in widget player row */
	widgetTrackTitle:
		'text-xs font-semibold text-[var(--desktop-text-primary)] antialiased truncate',
	/** Taskbar window button label (truncated) */
	taskbarWindowTitle:
		'text-[11px] font-semibold tracking-tight text-[var(--desktop-text-primary)] antialiased',
	/** Taskbar clock (time) */
	taskbarClock:
		'text-[11px] font-semibold tabular-nums tracking-tight text-[var(--desktop-text-primary)] antialiased',
	/** Taskbar tray flyout header meta */
	taskbarTrayMeta:
		'text-[11px] leading-tight text-[var(--desktop-text-muted)] antialiased text-right',
	/** 9px count on colored badge bubbles */
	badgeCompact: 'text-[9px] font-semibold text-white antialiased',
	/** Stack count on grouped taskbar pill */
	taskbarGroupCount:
		'text-[9px] font-semibold tabular-nums text-[var(--desktop-text-primary)] antialiased',
	/** Badge on accent-filled tray chip */
	badgeTrayAccent:
		'text-[10px] font-semibold text-[rgb(var(--desktop-bg-primary-rgb))] antialiased',
	/** Section pill (Start / Quick search role badge) */
	sectionPill:
		'text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--desktop-text-secondary)] antialiased',
	/** Command palette title line (slightly heavier tracking) */
	sectionOverlineStrong:
		'text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--desktop-text-secondary)] antialiased',
	/** Keyboard shortcut glyph */
	kbd: 'font-mono text-[11px] text-[var(--desktop-text-secondary)] antialiased',
	/** Kbd chip in shell footers (Command Palette) */
	shellKbdGlyph:
		'rounded bg-(--desktop-surface-soft) px-1.5 py-0.5 font-mono text-[11px] text-(--desktop-text-secondary) antialiased',
	/** “Открыто” under pinned apps */
	pinnedMenuOpen:
		'text-[10px] text-[rgb(var(--desktop-accent-rgb))] antialiased',
	/** Virtual desktop strip: “1 / 3” counter */
	shellVirtualDesktopCounter:
		'text-[9px] font-semibold tabular-nums tracking-wide text-[rgb(var(--desktop-fg-secondary-rgb)/0.88)] antialiased',
	/** Muted 10px (preview chrome, tray lines) — use instead of raw text-[10px] + muted */
	shellMeta10: 'text-[10px] antialiased text-[var(--desktop-text-muted)]',
	/** Unread / count bubble on desktop icon (colored pill) */
	iconBadgeNumeric: 'text-[10px] font-bold text-white antialiased',
	/** «Ещё» / «Свернуть» под line-clamp описания (акцент, фокус-кольцо) */
	shellDescriptionToggle:
		'text-[11px] font-semibold tracking-wide text-[rgb(var(--desktop-accent-rgb)/0.95)] antialiased hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.35)] rounded',
	/** Accent highlight for search match / palette shortcut glyph */
	matchHighlight:
		'font-semibold text-[rgb(var(--desktop-accent-rgb))] antialiased',
	/** Taskbar GAF/tray: online accent status (medium weight) */
	shellAccentStatusMedium:
		'font-medium text-[rgb(var(--desktop-accent-rgb))] antialiased',
	/** Taskbar GAF/tray: offline / muted status */
	shellMutedStatusMedium: 'font-medium text-(--desktop-text-muted) antialiased',
	/** Quick Search primary input (lg body, theme colors) */
	quickSearchInput:
		'text-lg text-(--desktop-text-primary) placeholder:text-(--desktop-text-dim) focus:outline-none antialiased',
	/** 13px плотный текст: пункты меню, подсказки, описания карточек */
	shellCopy13: 'text-[13px] antialiased',
	/** 15px — тело пузыря чата, крупные карточки */
	shellCopy15: 'text-[15px] antialiased',
	/** 15px от breakpoint `sm` (например тело шага в AI Chat guide при шире узла) */
	shellCopy15Sm: 'sm:text-[15px]',
	/**
	 * Mermaid в узком пузыре (не fullscreen): скролл по ширине + размеры подписей в SVG foreignObject.
	 * См. `DesktopAiChatMarkdown` (`ChatMermaidBlock`).
	 */
	mermaidSvgEmbeddedClamp:
		'[&_svg]:max-w-full [&_svg]:h-auto [&_svg]:min-w-[min(100%,280px)] [&_svg_.nodeLabel_*]:text-xs! [&_svg_.edgeLabel_*]:text-[10px]!',
} as const;

/**
 * Cmdk stylesheet (`CommandPalette`): px sizes mirror {@link DESKTOP_TYPOGRAPHY}
 * (input 16px ≈ text-base, items/empty 14px ≈ text-sm, group 11px ≈ caption).
 */
export const DESKTOP_CMDK_INJECTED = {
	fontSizeInput: '16px',
	fontSizeItem: '14px',
	fontSizeEmpty: '14px',
	fontSizeGroupHeading: '11px',
} as const;

/** Icon sizes for panels and menus: use for Taskbar, StartMenu, context menus */
export const DESKTOP_ICON_SIZES_PANEL = {
	/** List items, menu items */
	menu: `w-4 h-4 shrink-0 ${DESKTOP_ICON_SVG_QUALITY}`,
	/** Toolbar / large buttons */
	button: `w-5 h-5 shrink-0 ${DESKTOP_ICON_SVG_QUALITY}`,
	/** Small inline (badges, meta) */
	small: `w-3.5 h-3.5 shrink-0 ${DESKTOP_ICON_SVG_QUALITY}`,
} as const;

export { DESKTOP_ICON_SVG_QUALITY, DESKTOP_LUCIDE } from './lucideDesktop';

/** Window title bar: icon size and compact control hit targets (styles.control / .close add colors) */
export const WINDOW_TITLE_BAR = {
	iconBox: 'w-[1.125rem] h-[1.125rem] sm:w-5 sm:h-5 shrink-0',
	controlHit:
		'size-8 shrink-0 flex items-center justify-center rounded-[9px] transition-[color,background-color,transform] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)] focus-visible:ring-inset active:scale-[0.94]',
	controlHitClose:
		'size-8 shrink-0 flex items-center justify-center rounded-[9px] transition-[color,background-color,transform] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/75 focus-visible:ring-inset active:scale-[0.94]',
} as const;

/**
 * Standard interactive states for desktop controls.
 * Use these class strings for hover/focus/active/disabled consistency across Taskbar, StartMenu, WidgetsPanel, DesktopIcon, etc.
 */
export const DESKTOP_INTERACTIVE = {
	/** Neutral icon/toolbar button: hover, focus ring, active, disabled */
	btn: 'transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.4)] focus-visible:ring-inset hover:bg-[var(--desktop-surface-soft-hover)] active:bg-[var(--desktop-surface-soft-active)] disabled:opacity-50 disabled:pointer-events-none',
	/** Same with rounded-xl for panels */
	btnRounded:
		'rounded-xl transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.4)] focus-visible:ring-inset hover:bg-[var(--desktop-surface-soft-hover)] active:bg-[var(--desktop-surface-soft-active)] disabled:opacity-50 disabled:pointer-events-none',
	/** Primary CTA: accent background (use with text-white) */
	btnPrimary:
		'rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors duration-200 bg-[rgb(var(--desktop-accent-rgb))] hover:brightness-110 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.5)] focus-visible:ring-inset disabled:opacity-50 disabled:pointer-events-none',
	/** Danger action (e.g. close, delete): red hover/active */
	btnDanger:
		'transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 focus-visible:ring-inset hover:bg-red-500/18 active:bg-red-500/26 disabled:opacity-50 disabled:pointer-events-none',
	/** List/item row hover only (no focus ring for non-focusable rows) */
	rowHover:
		'hover:bg-[var(--desktop-surface-soft-hover)] transition-colors duration-200',
	/** Selectable row: hover + focus + active state */
	rowInteractive:
		'transition-colors duration-200 hover:bg-[var(--desktop-surface-soft-hover)] focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.35)] focus-visible:ring-inset active:bg-[var(--desktop-surface-soft-active)]',
	/** Input field focus */
	inputFocus:
		'focus:outline-none focus:border-[rgb(var(--desktop-accent-rgb)/0.65)] focus:ring-1 focus:ring-[rgb(var(--desktop-accent-rgb)/0.22)] transition-colors duration-200',
	/** Focus ring only (for elements that already have hover/active elsewhere) */
	focusRing:
		'focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.4)] focus-visible:ring-inset transition-shadow duration-200',
} as const;

/**
 * Overlay and backdrop styles for modals and panels.
 * Opaque surfaces only — no backdrop-filter (RDP / compositor budget).
 */
export const DESKTOP_OVERLAY = {
	/**
	 * Fullscreen dim — цвет из токена темы (тёмная / светлая).
	 * Единый scrim для shell: {@link ModalAdvanced} `variant="desktop"`, таскбар, Quick Search, App Store.
	 */
	backdrop: 'bg-(--desktop-overlay-backdrop) transition-opacity duration-200',
	/** Легче затемнение — трей, вторичные панели */
	backdropLight:
		'bg-(--desktop-overlay-backdrop) transition-opacity duration-200',
	/** Плавающая панель — opaque shell surface */
	panelSurface:
		'bg-(--desktop-surface-panel-strong) border border-(--desktop-border-strong) rounded-(--desktop-radius-shell) shadow-[0_28px_72px_rgba(0,0,0,0.52)]',
	/** Модальные окна настроек и т.п. */
	panelSurfaceStrong:
		'bg-(--desktop-surface-panel-strong) border border-(--desktop-border-strong) rounded-(--desktop-radius-shell) shadow-[0_36px_88px_rgba(0,0,0,0.55)]',
} as const;

/**
 * Tooltip consistency: delay before show, placement fallback, keyboard (focus), long-label truncation.
 */
const TOOLTIP_MAX_LENGTH = 60;
export const DESKTOP_TOOLTIP = {
	/** Delay (ms) before showing tooltip on hover */
	delayMs: 400,
	/** Max characters before truncation */
	maxLength: TOOLTIP_MAX_LENGTH,
	/** Truncate text with ellipsis */
	truncate: (s: string, max: number = TOOLTIP_MAX_LENGTH) =>
		s.length <= max ? s : `${s.slice(0, max - 3)}...`,
} as const;

/**
 * Taskbar layout: height, padding, gaps for consistent appearance across resolutions.
 * Use these in Taskbar.tsx and any Right Hot Bar / system tray to keep alignment.
 */
export const TASKBAR = {
	/** Main strip height (px). Full rail height; inner icon controls stay smaller via HIT_MIN_CLASS. */
	HEIGHT_PX: 46,
	/** Tailwind class for taskbar strip height. */
	HEIGHT_CLASS: 'h-[46px]',
	/** Mobile / compact strip — roomier hit area on small screens. */
	HEIGHT_CLASS_COMPACT: 'h-12',
	/** Horizontal padding: compact on small screens, larger on sm+. */
	PADDING_X: 'px-2.5 sm:px-3.5',
	/** Gap between taskbar groups. */
	GAP: 'gap-1.5 sm:gap-2',
	/** Padding for taskbar window/app pill buttons. */
	BUTTON_PADDING: 'px-2.5 sm:px-3 py-1.5',
	/** Icon size inside taskbar window pills + tray (higher contrast glyph). */
	ICON_SIZE: 'w-4 h-4 shrink-0 text-[var(--desktop-text-primary)]',
	/** Lucide on square chrome controls (tray, Пуск area, overflow). */
	ICON_CLASS: 'w-4 h-4 shrink-0 text-[var(--desktop-text-primary)]',
	/**
	 * Square controls (Пуск, трей, вирт. столы, overflow): smaller than strip height.
	 */
	HIT_MIN_CLASS: 'min-h-[34px] min-w-[34px]',
	/**
	 * Клавиатурный фокус на компактных кнопках таскбара: тоньше и мягче, чем `DESKTOP_INTERACTIVE.focusRing`,
	 * чтобы не было эффекта «толстой окантовки» на 34–44px hit-area.
	 */
	ICON_FOCUS:
		'focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.28)] transition-shadow duration-200',
	/**
	 * Правая зона таскбара (часы, трей, уведомления, шорткаты): без «пузыря» из пресета
	 * (`buttonSurface` — mix+border+inset shadow). Только лёгкий hover / акцент при открытой панели.
	 */
	RIGHT_ICON_SURFACE:
		'border-0 bg-transparent shadow-none [box-shadow:none] fine-hover:bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb))_10%,transparent)]',
	RIGHT_ICON_ACTIVE_SURFACE:
		'border-0 shadow-none [box-shadow:none] bg-[rgb(var(--desktop-accent-rgb)/0.22)] fine-hover:bg-[rgb(var(--desktop-accent-rgb)/0.30)]',
	/** Window pills: shorter than `HEIGHT_CLASS` for vertical breathing room. */
	WINDOW_BUTTON_MIN_H: 'min-h-10',
	/** Max width for window title chip. */
	WINDOW_PILL_MAX_W: 'max-w-[min(100%,13rem)]',
} as const;

/**
 * Shell flyouts (Start menu, notification tray): shared width and vertical extent.
 * Matches Start menu panel geometry for visual consistency.
 */
export const DESKTOP_SHELL_FLYOUT = {
	/** Cap width at 560px with viewport margin — same as Start menu */
	WIDTH_CLASS: 'w-[min(560px,calc(100vw-2rem))]',
	/** Offset above taskbar strip (5rem) */
	BOTTOM_OFFSET_CLASS: 'bottom-20',
	/** Leave room for taskbar + breathing room */
	MAX_HEIGHT_CLASS: 'max-h-[calc(100vh-6rem)]',
	/** Horizontal inset for edge-anchored flyouts (notification tray on the right) */
	RIGHT_INSET_CLASS: 'right-4',
} as const;

/**
 * Shared desktop layout geometry.
 * Source of truth for shell spacing, taskbar reservation and viewport-based window sizing.
 */
export const DESKTOP_LAYOUT = {
	TASKBAR_HEIGHT_PX: TASKBAR.HEIGHT_PX,
	WINDOW_MARGIN_PX: 40,
	MAX_WINDOW_WIDTH_PX: 1200,
	MAX_WINDOW_HEIGHT_PX: 900,
} as const;

/** Совпадает с начальным `widget_position` в конфиге десктопа до первого переноса виджета. */
export const DESKTOP_FLOATING_WIDGET_POSITION_SEED = { x: 20, y: 20 } as const;

/** Approximate collapsed floating widget size in viewport px (w-75 / compact chrome). */
export const DESKTOP_FLOATING_WIDGET_VIEWPORT_SIZE = {
	width: 300,
	height: 132,
} as const;

/**
 * Z-index policy (ascending): overlay < panel < snap preview < skip-link/toast < context menu < modal < desktop shell.
 * Use these constants so stacking order stays consistent (tooltips, dropdowns, modals, welcome).
 *
 * **GAF Chat** (`GAF_*`): in-app overlays inside the window; numeric band 9999–10060 matches former literals.
 *
 * **Nested windows:** in-window menus/modals use `DesktopWindowPortalStackContext` base +
 * `DESKTOP_PORTAL_STACK_BUMP.*`; do not add ad-hoc globals unless the surface is outside
 * any window (e.g. companion fullscreen media → `COMPANION_FULLSCREEN_MEDIA`).
 */
export const DESKTOP_Z_INDEX = {
	/** Dimmed backdrop behind panels (notifications, side panels) */
	OVERLAY: 1000,
	/** Floating panels (Start menu, widgets flyout, notification center) */
	PANEL: 1100,
	/** Snap/align preview when dragging windows */
	SNAP_PREVIEW: 10000,
	/** Skip-to-content link when focused (above snap preview) */
	SKIP_LINK: 10001,
	/** Ephemeral toast / stalled-loading banner (below context menus) */
	TOAST: 10002,
	/** Быстрые действия Assistant/GAF при выделении ярлыков на столе (над taskbar, ниже контекстных меню) */
	ASSISTANT_SELECTION_RAIL: 10035,
	/** Context menus, dropdowns (above panels) */
	CONTEXT_MENU: 10100,
	/** Modal backdrop (fullscreen) */
	MODAL: 9998,
	/** Modal content (dialog) */
	MODAL_CONTENT: 9999,
	/**
	 * Порталы из Studio GU / модулей без `DesktopWindowPortalStackContext`: ниже глобальной
	 * полосы контекстных меню (10100); тот же порядок, что у портала контекстного меню холста в WorkflowBuilder (`portalStackBase` вне окна = эта база).
	 */
	STUDIO_MODULE_PORTAL: 10_050,
	/** Desktop shell (welcome screen, desktop root) */
	DESKTOP_SHELL: 99999,
	/**
	 * EWA companion fullscreen media (transform video portal) — above shell canvas,
	 * below maintenance freeze. Prefer this over `DESKTOP_SHELL + N` literals.
	 */
	COMPANION_FULLSCREEN_MEDIA: 100_049,
	/** Server restart freeze overlay above workspace chrome */
	MAINTENANCE: 100_000,
	/**
	 * Low chrome on the desktop canvas (selection marquee, sync status chip).
	 * Above background/icons layer, below OVERLAY (1000).
	 */
	SHELL_CANVAS_CHROME: 100,
	/** GAF Chat: new-chat / user picker modal backdrop */
	GAF_NEW_CHAT_BACKDROP: 9999,
	/** GAF Chat: confirm / destructive action modal backdrop */
	GAF_CONFIRM_BACKDROP: 10_000,
	/** GAF Chat: unified content library picker (portal; above in-window modals) */
	GAF_CONTENT_LIBRARY_BACKDROP: 10_070,
	/** GAF Chat: full-screen attachment preview (image/PDF) */
	GAF_ATTACHMENT_PREVIEW_BACKDROP: 10_060,
	/**
	 * GAF Chat: relative stacking inside composer / message surface (local z-order;
	 * not global shell bands like CONTEXT_MENU).
	 */
	GAF_INNER_BASE: 10,
	GAF_INNER_OVERLAY: 20,
	/**
	 * Относительный порядок внутри одного stacking context (лента ошибок GAF над телом чата).
	 */
	GAF_RELATIVE_ALERT_CONTROL: 1,
	GAF_RELATIVE_ALERT_STRIP: 2,
} as const;

/**
 * Смещения поверх базы портала окна (`DesktopWindowPortalStackContext`) для вложенных меню.
 */
export const DESKTOP_PORTAL_STACK_BUMP = {
	/** Контекстное меню строки в ленте центра уведомлений — над хромом списка */
	NOTIFICATION_HUB_ITEM_MENU: 2,
	/**
	 * Плавающий виджет рабочего стола (часы/KPI): ПКМ — как прежде `CONTEXT_MENU + 3` на базе портала.
	 */
	WORKSPACE_FLOATING_WIDGET_MENU: 3,
	/**
	 * Лаунчер QuickSearch: ПКМ по строке — как прежде `CONTEXT_MENU + 5`.
	 */
	QUICK_SEARCH_CTX_MENU: 5,
	/**
	 * Вложенный flyout в `EnhancedContextMenu` над корнем меню (legacy `CONTEXT_MENU + 50` при базе shell).
	 */
	ENHANCED_CONTEXT_SUBMENU: 50,
	/**
	 * Карточка шага guided tour над корневым слоем тура (Desktop AI Chat, маркетинг, Studio, контент-менеджер).
	 */
	GUIDE_TOUR_CARD: 2,
	/** ПКМ по строке в панели истории команд (Studio GU / Voice). */
	COMMAND_HISTORY_ROW_CONTEXT_MENU: 2,
	/**
	 * Модалка с `createPortal` из вложенного приложения: выше контекстных меню того же окна
	 * (`portalStackBase` = `CONTEXT_MENU + window.zIndex` в `EnhancedWindow`).
	 */
	EMBEDDED_MODAL_BACKDROP: 200,
	EMBEDDED_MODAL_CONTENT: 201,
	/**
	 * Полноэкранная модалка Mermaid в Desktop AI Chat: `portalStackBase + this` даёт прежний порядок
	 * (~`100050` при базе `CONTEXT_MENU` и `window.zIndex === 0`).
	 */
	MERMAID_FULLSCREEN_MODAL: 89_950,
	/**
	 * `UnifiedContentPickerModal` без явного `portalZIndex`: было `z-[50000]` при базе `CONTEXT_MENU` + `window.zIndex === 0`.
	 * Вне окна — задавать **`portalZIndex`** (`MODAL`, **`STUDIO_MODULE_PORTAL`**, **`GAF_*`** и т.д.).
	 */
	UNIFIED_CONTENT_PICKER_PORTAL: 39_900,
	/**
	 * Ultimate Doc Editor: `absolute` / `sticky` внутри корня `.ultimate-doc-editor` (не `createPortal`).
	 * Сумма с `portalStackBase` совпадает по шкале с порталами того же окна; ниже **`EMBEDDED_MODAL_*`** (200+).
	 * Порядок: FAB 17 → … → боковая панель 35 → порталы хрома (экспорт, color picker) 36 → контекстные меню (редактор, строка в файловом менеджере) 37.
	 */
	DOC_EDITOR_IN_WINDOW_SCROLL_FAB: 17,
	/** Sticky оболочка `EditorToolbar` / markdown chrome в колонке редактора. */
	DOC_EDITOR_IN_WINDOW_STICKY_TOOLBAR: 18,
	/** Sticky полоса управления документом (вкладки, главный хром). */
	DOC_EDITOR_IN_WINDOW_STICKY_DOC_HEADER: 19,
	DOC_EDITOR_IN_WINDOW_STICKY_ALERT: 20,
	DOC_EDITOR_IN_WINDOW_GUIDE_CARD: 22,
	DOC_EDITOR_IN_WINDOW_MEMORY_TOAST: 26,
	DOC_EDITOR_IN_WINDOW_DRAG_OVERLAY: 30,
	/**
	 * Фиксированные правые панели Ultimate Doc Editor (файлы, поиск, комментарии, …) в окне десктопа.
	 */
	DOC_EDITOR_IN_WINDOW_SIDE_PANEL: 35,
	/**
	 * `createPortal` в `document.body` из shell редактора (меню экспорта, `ColorPicker`), выше правых панелей.
	 */
	DOC_EDITOR_IN_WINDOW_TOOLBAR_PORTAL_POPOVER: 36,
	/**
	 * ПКМ: меню по тексту в Tiptap (`EditorContextMenu`) и по строке документа в файловом менеджере (`FileManagerDocContextMenu`).
	 */
	DOC_EDITOR_IN_WINDOW_CONTEXT_MENU: 37,
} as const;

/**
 * Тот же расчёт, что у плавающих меню окна (ПКМ по тексту, папка): меню не теряется под соседними окнами.
 */
export function desktopEmbeddedFloatingMenuZIndex(
	windowZIndex: number
): number {
	return DESKTOP_Z_INDEX.CONTEXT_MENU + windowZIndex;
}

export const STORAGE_KEYS = {
	CONFIG: 'elite_desktop_config',
	ITEMS: 'elite_desktop_items',
	WINDOWS: 'elite_desktop_windows',
	ACCENT: 'elite_desktop_accent',
	VIRTUAL_DESKTOPS: 'elite_desktop_virtual_desktops',
	CLOCK_SECONDS: 'elite_desktop_clock_seconds',
	WIDGET_NOTES: 'elite_desktop_widget_notes',
	WIDGET_TODOS: 'elite_desktop_widget_todos',
	WIDGET_FAVORITES: 'elite_desktop_widget_favorites',
	RECENT_APPS: 'elite_desktop_recent_apps',
	RECENT_FILES: 'elite_desktop_recent_files',
	/** После первого переноса плавающего виджета мышью — не считать координаты семенным пресетом. */
	FLOATING_WIDGET_USER_POSITIONED:
		'eliteew-desktop-floating-widget-user-positioned-v1',
	/** Serialized notification center rows (no React icons) */
	NOTIFICATION_CENTER: 'elite_notification_center_v1',
	/** First-visit desktop onboarding overlay dismissed permanently. */
	ONBOARDING_DISMISSED: 'eliteew-desktop-onboarding-dismissed-v1',
	/** Show cloud icon when sync is idle (opt-in, default off). */
	SHOW_IDLE_SYNC_ICON: 'eliteew-desktop-show-idle-sync-icon-v1',
	/** Virtual desktops first-use hint dismissed permanently. */
	VD_FIRST_USE_HINT_DISMISSED: 'eliteew-desktop-vd-first-use-hint-v1',
	/** Maintenance recovery chip dismissed for this session (reopen via Start). */
	MAINTENANCE_RECOVERY_DISMISSED:
		'eliteew-desktop-maintenance-recovery-dismissed-v1',
} as const;

export const API_ENDPOINTS = {
	CONFIG: '/desktop/config',
	ITEMS: '/desktop/items',
	ITEM: (id: string) => `/desktop/items/${id}`,
} as const;

// Base URL for desktop API
export const DESKTOP_API_BASE = '/api/v1';

/** Polling intervals (ms). Min 5s for UI/monitoring per performance rules; avoid 1–2s cycles. */
export const DESKTOP_POLLING = {
	SYSTEM_METRICS_MS: 5000,
	CLIPBOARD_MS: 5000,
	WIDGET_STATE_MS: 5000,
	GPU_MS: 15000,
	VOICE_SERVICES_MS: 30000,
	MEMORY_CHECK_MS: 30000,
	CLOCK_MS: 1000,
	/** Weather widget: avoid frequent calls (Open-Meteo free tier). */
	WEATHER_MS: 600_000,
} as const;

/** Target performance metrics for Desktop (for monitoring/regression). */
export const DESKTOP_PERFORMANCE_TARGETS = {
	/** Window open (click to first paint) ms */
	WINDOW_OPEN_LATENCY_MS: 500,
	/** Target FPS for desktop interactions */
	TARGET_FPS: 60,
	/** Early warning threshold for interaction smoothness */
	FPS_WARN: 45,
	/** Critical threshold where shell should aggressively reduce work */
	FPS_CRITICAL: 30,
	/** Healthy upper bound for average frame time */
	RENDER_WARN_MS: 18,
	/** Max memory growth (MB) before warning */
	MEMORY_WARN_MB: 200,
	/** Soft warning for high count of simultaneously open windows */
	WINDOW_WARN_COUNT: 12,
	/** Auto quiet telemetry / aggressive background suspend when open windows exceed this count */
	WINDOW_AUTO_QUIET_COUNT: 8,
	/** Historical threshold; icon layer always skips Framer enter/exit (kept for prefs/docs) */
	ICON_MOTION_DISABLE_COUNT: 0,
} as const;

/**
 * Feature flags for Desktop. Enable large changes behind flags for staged rollout.
 * Override in code or via env (e.g. VITE_DESKTOP_TELEMETRY=false) for testing/rollback.
 */
export const DESKTOP_FEATURE_FLAGS = {
	/** Use centralized notification context (default on). */
	NOTIFICATIONS_CONTEXT: true,
	/** Preload lazy apps on icon hover/focus (default on). */
	PRELOAD_ON_HOVER: true,
	/** Emit desktop-telemetry custom events (default on). Set VITE_DESKTOP_TELEMETRY=false to disable. */
	TELEMETRY: true,
	/** Taskbar groups same-app windows into one button to preserve density in desktop workflows. */
	TASKBAR_GROUP_BY_APP: false,
	/** Hover window button shows live thumbnail preview (experimental). */
	TASKBAR_WINDOW_PREVIEW: false,
} as const;

/**
 * Governance rules for the desktop-first visual system.
 * New desktop UI should consume shared primitives instead of reintroducing local chrome bundles.
 */
export const DESKTOP_STYLE_GOVERNANCE = {
	rules: [
		'Desktop app chrome must be composed from shared DesktopApp primitives.',
		'Hardcoded desktop surface bundles like bg-slate-* and border-white/10 are treated as tech debt (track: documentation/platform/TECH-DEBT-EXECUTION-TRACKER.md).',
		'Desktop root tokens are written only at DesktopWorkspaceContent level.',
		'Embedded and passthrough apps must opt out intentionally instead of bypassing the wrapper by default.',
	],
	checklist: [
		'Header and toolbar use semantic desktop surfaces and spacing.',
		'Panels and cards use shared panel/soft surface patterns.',
		'Primary, neutral, and danger actions use shared button variants.',
		'Inputs and search fields use shared desktop field styling.',
		'Modal, empty, error, and skeleton states follow shared primitives.',
		'Window minimize/maximize behavior remains correct in desktop mode.',
		'No double scroll containers or clipped first paint in wrapped apps.',
	],
} as const;
