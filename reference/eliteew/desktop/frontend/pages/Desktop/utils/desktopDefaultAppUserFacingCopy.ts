/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Normalize built-in desktop app names/descriptions when older API/store/local snapshots still carry legacy raw or generic copy.
 *
 * Invariants:
 * - Never changes app ids or appComponent values; only exact legacy user-facing labels are replaced.
 * - Custom user/operator labels remain intact.
 *
 * Related:
 * - src/pages/Desktop/constants/index.ts
 * - src/pages/Desktop/hooks/useDesktopStorage.ts
 * - src/pages/Desktop/services/desktopApi.ts
 */
import type { DesktopItem } from '../types/desktop.types';

type StoreAppCopyLike = {
	app_id: string;
	name: string;
	description?: string | null;
};

type DesktopWindowCopyLike = {
	appId?: string | null;
	appComponent?: string | null;
	title: string;
};

type UserFacingCopyPatch = {
	name?: string;
	legacyNames?: readonly string[];
	description?: string;
	legacyDescriptions?: readonly string[];
};

const USER_FACING_COPY_PATCHES_BY_ID: Record<string, UserFacingCopyPatch> = {
	'app-ewa': {
		name: 'Спутник стола',
		legacyNames: ['EWA'],
		description:
			'Отдельное окно спутника: оркестрация рабочего стола, спокойный диалог и тёплое присутствие.',
		legacyDescriptions: [
			'Отдельное окно EWA: платформенная оркестрация рабочего стола',
		],
	},
	'app-desktop-ai-chat': {
		name: 'Умный чат',
		legacyNames: ['AI Чат'],
		description:
			'Чат с помощником: вложения, память, проектный контекст, умные действия и голос',
		legacyDescriptions: [
			'Чат с ИИ: вложения и память по чату, опционально хранилище проекта, умные действия и голос',
		],
	},
	'app-music-forge': {
		name: 'Студия песен',
		legacyNames: [
			'MusicForge',
			'Новая студия песен',
			'Эволюционная студия песен',
			'Music Evolution',
		],
		description:
			'Опишите идею — студия сама соберёт текст, стиль и готовый трек',
		legacyDescriptions: [
			'Новая backend-first студия песен: один ACE lane, пошаговый workflow и оценка результата',
			'Простая форма, backend-пайплайн XL Base и красивый прогресс до готового трека',
			'Простая форма, backend-пайплайн XL Base и красивый прогресс до готового трека на основе накопленного опыта удачных песен.',
		],
	},
	'app-music-generator': {
		name: 'Студия песен',
		legacyNames: ['Генератор песен'],
		description:
			'Опишите идею — студия сама соберёт текст, стиль и готовый трек',
		legacyDescriptions: [
			'Текст песни и генерация музыки',
			'Текст с AI, генерация музыки',
		],
	},
	'app-music-evolution': {
		name: 'Студия песен',
		legacyNames: [
			'Студия песен',
			'Эволюционная студия песен',
			'Music Evolution',
		],
		description:
			'Опишите идею — студия сама соберёт текст, стиль и готовый трек',
		legacyDescriptions: [
			'Простая форма и пошаговый прогресс до готового трека',
		],
	},
	'app-marketing-cabinet': {
		name: 'Зал маркетинга',
		legacyNames: ['Marketing Cabinet', 'Маркетинговый кабинет'],
		description: 'Дом → проект → позиционирование → свидетельства → оракулы',
		legacyDescriptions: [
			'Связанный маркетинговый кабинет: компания → проект → стратегия → доказательства → помощники',
			'Связанный маркетинговый кабинет: компания → проект → стратегия → доказательства → AI',
		],
	},
	'app-poemma': {
		name: 'POEMMA',
		legacyNames: ['Poemma', 'Карта бизнеса'],
		description:
			'Наглядная карта бизнеса Зои: смысл, 90 дней, прибыль, опыт и действия',
		legacyDescriptions: ['Локальная карта бизнеса для собственника'],
	},
	'app-doc-editor-v2': {
		name: 'Редактор документов V2',
		legacyNames: ['Doc Editor V2'],
		description:
			'Новый редактор документов: совместная работа, ЕВА рядом, импорт и экспорт',
		legacyDescriptions: [
			'Новый редактор документов: v2 core, EWA-партнёр, импорт/экспорт и безопасный fallback',
			'Новый редактор документов: v2 core, EWA-партнёр, импорт/экспорт и безопасный fallback.',
		],
	},
	'app-professional-worlds': {
		description:
			'Мир инструментов для специалистов: профиль, обучение, объекты, клиенты и умные подсказки',
		legacyDescriptions: [
			'Мир инструментов для специалистов: профиль, обучение, объекты, клиенты и AI',
			'Профессиональные рабочие среды: профиль, обучение, CRM-lite и AI-инструменты для специалистов.',
		],
	},
	'app-site-studio': {
		name: 'Студия сайтов',
		legacyNames: ['Site Studio', 'Менеджер Сайтов'],
		description:
			'Соберите и опубликуйте личный сайт: контент, витрина, админка и безопасный гостевой просмотр',
		legacyDescriptions: [
			'Личный локальный сайт с нативной админкой и отдельным runtime',
		],
	},
	'app-site-manager-ops': {
		name: 'Контроль сайтов',
		legacyNames: ['Site Manager Ops'],
		description:
			'Операторская панель сайтов: готовность сервиса, задачи, домены, проверки публикации и журнал событий',
		legacyDescriptions: [
			'Операторская консоль сайтов: worker, jobs, DNS/TLS, reconcile и audit',
		],
	},
	'app-kirs': {
		description:
			'Курирование сайта по проекту: шаблон, публикация и доступ клиенту',
		legacyDescriptions: [
			'Курирование сайта по проекту: шаблон, runtime, доступ клиенту',
		],
	},
	'app-social-hub': {
		name: 'Связи',
		legacyNames: [
			'Social hub',
			'Social Hub',
			'Друзья',
			'Friends',
			'Профиль',
			'User Profile',
			'Friends & profile',
			'Друзья и профиль',
		],
		description:
			'Заявки, контакты, списки, приватность и приложение на телефоне',
		legacyDescriptions: [
			'Друзья и профиль: заявки, круги, карточка и приватность',
		],
	},
};

const DEFAULT_APP_ID_BY_COMPONENT: Record<string, string> = {
	DesktopAiChatApp: 'app-desktop-ai-chat',
	DocEditorV2: 'app-doc-editor-v2',
	EwaApp: 'app-ewa',
	KirsCuration: 'app-kirs',
	MarketingCabinet: 'app-marketing-cabinet',
	PoemmaApp: 'app-poemma',
	ProjectAboutApp: 'app-about-project',
	EmperyNexusChronicleApp: 'app-empery-nexus-chronicle',
	ProfessionalWorldsApp: 'app-professional-worlds',
	SiteManagerOps: 'app-site-manager-ops',
	UserSiteStudio: 'app-site-studio',
	SocialHubApp: 'app-social-hub',
	FriendsApp: 'app-social-hub',
};

function resolvePatchedCopy(
	id: string,
	name: string,
	description: string | null | undefined
): { name: string; description: string | null | undefined; changed: boolean } {
	const patch = USER_FACING_COPY_PATCHES_BY_ID[id];
	if (!patch) {
		return { name, description, changed: false };
	}

	let nextName = name;
	let nextDescription = description;
	let changed = false;

	if (patch.name && patch.legacyNames?.includes(name.trim())) {
		nextName = patch.name;
		changed = true;
	}

	if (
		patch.description &&
		typeof description === 'string' &&
		patch.legacyDescriptions?.includes(description.trim())
	) {
		nextDescription = patch.description;
		changed = true;
	}

	return { name: nextName, description: nextDescription, changed };
}

export function normalizeDefaultDesktopAppUserFacingCopy(
	item: DesktopItem
): DesktopItem {
	if (item.type !== 'app') {
		return item;
	}

	const patched = resolvePatchedCopy(item.id, item.name, item.description);
	if (!patched.changed) return item;

	return {
		...item,
		name: patched.name,
		description:
			typeof patched.description === 'string'
				? patched.description
				: item.description,
	};
}

export function normalizeDefaultDesktopStoreAppUserFacingCopy<
	T extends StoreAppCopyLike,
>(app: T): T {
	const patched = resolvePatchedCopy(app.app_id, app.name, app.description);
	if (!patched.changed) return app;

	return {
		...app,
		name: patched.name,
		description: patched.description,
	};
}

export function normalizeDefaultDesktopWindowTitleUserFacingCopy({
	appId,
	appComponent,
	title,
}: DesktopWindowCopyLike): string {
	const normalizedAppId =
		typeof appId === 'string' && appId.trim()
			? appId.trim()
			: appComponent
				? DEFAULT_APP_ID_BY_COMPONENT[appComponent]
				: undefined;
	if (!normalizedAppId) return title;

	const patched = resolvePatchedCopy(normalizedAppId, title, undefined);
	return patched.changed ? patched.name : title;
}
