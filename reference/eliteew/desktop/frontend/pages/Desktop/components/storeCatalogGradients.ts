/**
 * Статические классы градиентов для карточек каталога (ключ = поле desktop_app_catalog.gradient).
 * Динамическая сборка `bg-gradient-to-r ${gradient}` не попадает в бандл Tailwind.
 */

const STORE_CATEGORY_GRADIENT_BAR: Record<string, string> = {
	communication: 'bg-gradient-to-r from-sky-500/85 to-indigo-600/85',
	productivity: 'bg-gradient-to-r from-amber-500/85 to-orange-600/85',
	widgets: 'bg-gradient-to-r from-sky-500/80 to-indigo-600/80',
	developer: 'bg-gradient-to-r from-teal-500/80 to-cyan-600/80',
	home: 'bg-gradient-to-r from-teal-500/85 to-cyan-500/85',
	system:
		'bg-gradient-to-r from-[rgb(var(--desktop-accent-rgb))]/42 to-[rgb(var(--desktop-accent-rgb))]/14',
};

/**
 * Значения `gradient` из SQL-миграций каталога и DEFAULT_APPS на десктопе.
 * Ключи вида `from-zinc-*` / `from-slate-*` — строки из БД (legacy); значения —
 * полные Tailwind-классы, часто с `--desktop-accent-rgb` вместо сырых zinc.
 */
const STORE_CATALOG_GRADIENT_BAR: Record<string, string> = {
	'from-teal-600 to-cyan-600': 'bg-gradient-to-r from-teal-600 to-cyan-600',
	'from-emerald-500 to-cyan-600':
		'bg-gradient-to-r from-emerald-500 to-cyan-600',
	'from-sky-500 to-indigo-600': 'bg-gradient-to-r from-sky-500 to-indigo-600',
	'from-amber-500 to-orange-600':
		'bg-gradient-to-r from-amber-500 to-orange-600',
	'from-teal-500 to-cyan-600': 'bg-gradient-to-r from-teal-500 to-cyan-600',
	'from-violet-500 to-fuchsia-600':
		'bg-gradient-to-r from-violet-500 to-fuchsia-600',
	'from-violet-500 to-purple-600':
		'bg-gradient-to-r from-violet-500 to-purple-600',
	'from-cyan-500 to-teal-600': 'bg-gradient-to-r from-cyan-500 to-teal-600',
	'from-indigo-500 to-purple-600':
		'bg-gradient-to-r from-indigo-500 to-purple-600',
	'from-cyan-500 to-blue-600': 'bg-gradient-to-r from-cyan-500 to-blue-600',
	'from-green-500 to-emerald-600':
		'bg-gradient-to-r from-green-500 to-emerald-600',
	'from-zinc-600 to-zinc-800':
		'bg-gradient-to-r from-[rgb(var(--desktop-accent-rgb))]/40 to-[rgb(var(--desktop-accent-rgb))]/16',
	'from-emerald-500 to-teal-600':
		'bg-gradient-to-r from-emerald-500 to-teal-600',
	'from-amber-500 to-yellow-600':
		'bg-gradient-to-r from-amber-500 to-yellow-600',
	'from-teal-500 via-cyan-600 to-sky-600':
		'bg-gradient-to-r from-teal-500 via-cyan-600 to-sky-600',
	'from-fuchsia-500 to-purple-600':
		'bg-gradient-to-r from-fuchsia-500 to-purple-600',
	'from-lime-500 to-green-500': 'bg-gradient-to-r from-lime-500 to-green-500',
	'from-amber-500 to-orange-500':
		'bg-gradient-to-r from-amber-500 to-orange-500',
	'from-blue-500 to-indigo-600': 'bg-gradient-to-r from-blue-500 to-indigo-600',
	'from-slate-500 to-gray-600':
		'bg-gradient-to-r from-[rgb(var(--desktop-accent-rgb))]/36 to-indigo-600/55',
	'from-yellow-500 to-amber-600':
		'bg-gradient-to-r from-yellow-500 to-amber-600',
	'from-pink-500 to-rose-600': 'bg-gradient-to-r from-pink-500 to-rose-600',
	'from-purple-500 to-violet-600':
		'bg-gradient-to-r from-purple-500 to-violet-600',
};

/** Single accent wash — avoid extra rainbow (desktop_brand_style.md). */
const STORE_GRADIENT_FALLBACK_BAR =
	'bg-gradient-to-r from-[rgb(var(--desktop-accent-rgb))]/48 to-[rgb(var(--desktop-accent-rgb))]/14';

export function getStoreAppGradientBarClass(
	gradient: string | null | undefined,
	category: string
): string {
	const g = gradient?.trim();
	if (g && STORE_CATALOG_GRADIENT_BAR[g]) {
		return STORE_CATALOG_GRADIENT_BAR[g];
	}
	return STORE_CATEGORY_GRADIENT_BAR[category] ?? STORE_GRADIENT_FALLBACK_BAR;
}
