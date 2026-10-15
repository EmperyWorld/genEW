/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Parses safe Markdown desktop links from assistant answers into desktop app and shell open targets.
 *
 * Invariants:
 * - App and shell allowlists come from EliteEW/shared/assistant_desktop_link_components.json.
 * - Legacy music app ids MusicGenerator/MusicEvolutionApp resolve to MusicForgeApp.
 *
 * Related:
 * - EliteEW/shared/assistant_desktop_link_components.json
 * - api/gaf_chat/system_gaf_instruction.py
 * - src/pages/Desktop/components/ProductAssistantMarkdown.tsx
 */
import assistantDesktopLinkManifest from '../../../../../../shared/assistant_desktop_link_components.json';

/** Префикс пути — не должен совпадать с реальными маршрутами SPA. */
export const ASSISTANT_DESKTOP_LINK_PATH_PREFIX =
	'/__eliteew-desktop-open-app__/';

const SHELL_SETTINGS_TABS: ReadonlySet<string> = new Set([
	'personalize',
	'icons',
	'chrome',
	'shell',
	'performance',
]);

/** Legacy assistant/GAF ids → canonical manifest app component. */
const LEGACY_ASSISTANT_DESKTOP_APP_ALIASES: Readonly<Record<string, string>> = {
	MusicGenerator: 'MusicForgeApp',
	MusicEvolutionApp: 'MusicForgeApp',
};

export const ASSISTANT_DESKTOP_LINK_APP_COMPONENTS: ReadonlySet<string> =
	new Set([
		...assistantDesktopLinkManifest.app_components,
		...assistantDesktopLinkManifest.shell_link_components,
	]);

/** Сопоставляет строку с каноническим именем из allowlist (регистр как в коде приложения). */
function resolveAllowedComponent(raw: string): string | null {
	const s = raw.trim();
	if (!s) return null;
	const alias = LEGACY_ASSISTANT_DESKTOP_APP_ALIASES[s];
	if (alias && ASSISTANT_DESKTOP_LINK_APP_COMPONENTS.has(alias)) {
		return alias;
	}
	for (const c of ASSISTANT_DESKTOP_LINK_APP_COMPONENTS) {
		if (c.toLowerCase() === s.toLowerCase()) {
			const canonical = LEGACY_ASSISTANT_DESKTOP_APP_ALIASES[c] ?? c;
			return ASSISTANT_DESKTOP_LINK_APP_COMPONENTS.has(canonical)
				? canonical
				: c;
		}
	}
	return null;
}

/**
 * Первый сегмент — приложение или псевдо-ID оболочки; для EliteEwShellSettings второй — вкладка.
 * Возвращает строку для `requestOpenDesktopApp` / обработки в UI, например `EliteEwShellSettings:icons`.
 */
function parsePathSegmentsToTarget(parts: string[]): string | null {
	if (parts.length === 0) return null;
	const p0 = parts[0];
	if (p0 === 'EliteEwShellStartMenu') return 'EliteEwShellStartMenu';
	if (p0 === 'EliteEwShellSettings') {
		const t = parts[1];
		if (t && SHELL_SETTINGS_TABS.has(t)) {
			return `EliteEwShellSettings:${t}`;
		}
		return 'EliteEwShellSettings:personalize';
	}
	return resolveAllowedComponent(p0);
}

/**
 * Разбирает href из markdown-ссылки; возвращает идентификатор для открытия приложения или оболочки.
 *
 * Поддерживаются варианты:
 * - `/__eliteew-desktop-open-app__/MusicPlayer`, `/__eliteew-desktop-open-app__/EliteEwShellSettings/icons`
 * - `eliteew-desktop:///MusicPlayer`, `eliteew-desktop://MusicPlayer`, …
 */
export function parseAssistantDesktopAppHref(href: string): string | null {
	const t = href.trim();
	if (t.startsWith(ASSISTANT_DESKTOP_LINK_PATH_PREFIX)) {
		const rest = t
			.slice(ASSISTANT_DESKTOP_LINK_PATH_PREFIX.length)
			.replace(/^\/+/, '');
		const parts = rest
			.split('/')
			.map((p) => decodeURIComponent(p.trim()))
			.filter(Boolean);
		return parsePathSegmentsToTarget(parts);
	}
	if (
		typeof window !== 'undefined' &&
		(t.startsWith('http://') || t.startsWith('https://'))
	) {
		try {
			const u = new URL(t);
			if (
				u.origin === window.location.origin &&
				u.pathname.startsWith(ASSISTANT_DESKTOP_LINK_PATH_PREFIX)
			) {
				const rest = u.pathname
					.slice(ASSISTANT_DESKTOP_LINK_PATH_PREFIX.length)
					.replace(/^\/+/, '');
				const parts = rest
					.split('/')
					.map((p) => decodeURIComponent(p.trim()))
					.filter(Boolean);
				return parsePathSegmentsToTarget(parts);
			}
		} catch {
			// ignore
		}
	}
	if (!t.toLowerCase().startsWith('eliteew-desktop:')) return null;
	try {
		const u = new URL(t);
		if (u.protocol !== 'eliteew-desktop:') return null;
		const path = u.pathname.replace(/^\/+/, '');
		const parts = path
			.split('/')
			.map((p) => decodeURIComponent(p.trim()))
			.filter(Boolean);
		const shell = parsePathSegmentsToTarget(parts);
		if (shell) return shell;
		const firstPath = parts[0];
		if (firstPath) {
			const fromPath = resolveAllowedComponent(firstPath);
			if (fromPath) return fromPath;
		}
		if (u.hostname) {
			const fromHost = resolveAllowedComponent(u.hostname);
			if (fromHost) return fromHost;
		}
		return null;
	} catch {
		const m = /^eliteew-desktop:(?:\/\/+)(?:([^/?#]+)\/)?([^/?#]+)/i.exec(t);
		if (m?.[2]) {
			const c = resolveAllowedComponent(m[2]);
			if (c) return c;
		}
		if (m?.[1]) {
			const c = resolveAllowedComponent(m[1]);
			if (c) return c;
		}
		return null;
	}
}
