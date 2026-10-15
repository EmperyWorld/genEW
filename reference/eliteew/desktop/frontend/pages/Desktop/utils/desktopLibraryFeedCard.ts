/**
 * Shared shell styles for library feed cards (Start Menu «Недавние», Quick Search).
 */
import { cn } from '@/utils/cn';

const DESKTOP_LIBRARY_FEED_CARD_SHARED = cn(
	'rounded-xl border border-(--desktop-border-subtle)',
	'border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.5)]',
	'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_65%,transparent)]',
	'shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--desktop-text-primary)_6%,transparent)]'
);

/** Карточка блока ленты на вкладке «Недавние» в Пуске (нижний отступ под scroll). */
export const DESKTOP_LIBRARY_FEED_CARD_START_MENU = cn(
	'mb-4 p-3 sm:p-4',
	DESKTOP_LIBRARY_FEED_CARD_SHARED
);

/** Вторичные блоки Пуска («Продолжить», рекомендации пространства) — мягкий фон без левого акцента. */
export const DESKTOP_START_MENU_SOFT_SECTION = cn(
	'mb-4 rounded-2xl border border-(--desktop-border-subtle)',
	'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_58%,transparent)]',
	'shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--desktop-text-primary)_5%,transparent)]',
	'p-3 sm:p-3.5'
);

/** Карточка блока ленты в Quick Search (отступы между группами даёт родитель `space-y-4`). */
export const DESKTOP_LIBRARY_FEED_CARD_QUICK_SEARCH = cn(
	'p-2.5',
	DESKTOP_LIBRARY_FEED_CARD_SHARED
);

const DESKTOP_LIBRARY_FEED_ICON_WRAP_SHARED = cn(
	'shrink-0 items-center justify-center rounded-lg border border-(--desktop-border-subtle)',
	'bg-(--desktop-surface-soft)'
);

/** Иконка-бейдж слева от заголовка в Пуске. */
export const DESKTOP_LIBRARY_FEED_ICON_WRAP_START_MENU = cn(
	'flex size-9',
	DESKTOP_LIBRARY_FEED_ICON_WRAP_SHARED
);

/** Иконка-бейдж в Quick Search (чуть меньше, лёгкий сдвиг по вертикали). */
export const DESKTOP_LIBRARY_FEED_ICON_WRAP_QUICK_SEARCH = cn(
	'mt-0.5 flex size-8',
	DESKTOP_LIBRARY_FEED_ICON_WRAP_SHARED
);

/** Панель «роль» под полем поиска Quick Search — мягкий блок как вторичные секции Пуска. */
export const DESKTOP_QUICK_SEARCH_ROLE_PANEL = cn(
	'mx-4 mb-3 rounded-2xl border border-(--desktop-border-subtle)',
	'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_52%,transparent)]',
	'px-3 py-3 shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--desktop-text-primary)_4%,transparent)]'
);

/** Строка статуса library feed (загрузка / ошибка / обновить). */
export const DESKTOP_QUICK_SEARCH_FEED_STATUS_STRIP = cn(
	'mx-4 mb-2 rounded-xl border border-(--desktop-border-subtle)',
	'border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.48)]',
	'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_70%,transparent)]',
	'px-3 py-2.5 shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--desktop-text-primary)_5%,transparent)]'
);
