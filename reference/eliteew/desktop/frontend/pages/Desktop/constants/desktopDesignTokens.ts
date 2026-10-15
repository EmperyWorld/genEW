/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Slim CSS-variable token map for Desktop shell surfaces — importable without
 * the full Desktop constants / app-registry graph (e.g. follower tab gate).
 *
 * Invariants:
 * - Values must stay in sync with re-export consumers in `constants/index.ts`.
 * - Default accent RGB is product chrome default; runtime theme may override.
 *
 * Related:
 * - `documentation/product/desktop/DESKTOP_DESIGN_SYSTEM.md`
 * - `components/browserTabGate/BrowserSingleTabGateScreen.tsx`
 */

/** Default accent when theme has not set `--desktop-accent-rgb` yet. */
export const DESKTOP_DEFAULT_ACCENT_RGB = '56 189 248';

/**
 * Desktop design tokens: colors (RGB space-separated), radius, shadow, spacing.
 * Applied on Desktop root and lightweight gate screens.
 */
export const DESKTOP_DESIGN_TOKENS = {
	'--desktop-bg-primary-rgb': '17 24 39',
	'--desktop-bg-secondary-rgb': '30 36 48',
	'--desktop-fg-primary-rgb': '248 250 252',
	'--desktop-fg-secondary-rgb': '203 213 225',
	'--desktop-border-rgb': '71 85 105',
	'--desktop-text-primary': '#f8fafc',
	'--desktop-text-secondary': '#e2e8f0',
	'--desktop-text-muted': '#94a3b8',
	'--desktop-text-dim': '#64748b',
	'--desktop-surface-app':
		'linear-gradient(145deg, rgba(3, 7, 18, 0.97) 0%, rgba(17, 24, 39, 0.95) 42%, rgba(3, 7, 18, 0.99) 100%)',
	'--desktop-surface-panel': 'rgba(17, 24, 39, 0.76)',
	'--desktop-surface-panel-strong': 'rgba(15, 23, 42, 0.9)',
	'--desktop-surface-soft': 'rgba(255, 255, 255, 0.045)',
	'--desktop-surface-soft-hover': 'rgba(255, 255, 255, 0.085)',
	'--desktop-surface-soft-active': 'rgba(255, 255, 255, 0.11)',
	'--desktop-surface-accent': 'rgba(var(--desktop-accent-rgb), 0.12)',
	'--desktop-surface-accent-strong': 'rgba(var(--desktop-accent-rgb), 0.2)',
	'--desktop-border-subtle': 'rgba(255, 255, 255, 0.08)',
	'--desktop-border-strong': 'rgba(255, 255, 255, 0.14)',
	/** Floating ПКМ / context menus: dark rim on dark shell (no “white frame”) */
	'--desktop-border-menu': 'rgba(0, 0, 0, 0.48)',
	/** Второй цвет в color-mix фона меню; светлая тема переопределяет в desktopUi */
	'--desktop-menu-tint': '#09090b',
	'--desktop-overlay-backdrop': 'rgba(3, 7, 18, 0.58)',
	'--desktop-radius': '0.75rem',
	'--desktop-radius-lg': '1rem',
	'--desktop-radius-xl': '1.25rem',
	'--desktop-radius-frame': '1.2rem',
	'--desktop-radius-shell': '1.35rem',
	'--desktop-radius-section': '0.95rem',
	'--desktop-radius-pill': '9999px',
	'--desktop-shadow': '0 28px 56px -14px rgb(0 0 0 / 0.38)',
	'--desktop-shadow-lg': '0 36px 72px -18px rgb(0 0 0 / 0.45)',
	'--desktop-shadow-soft': '0 22px 48px rgba(0, 0, 0, 0.34)',
	'--desktop-shadow-panel': '0 28px 64px rgba(0, 0, 0, 0.48)',
	'--desktop-spacing': '0.5rem',
	'--desktop-spacing-lg': '1rem',
	/** Paper window/icon style palette (warm kraft — not accent RGB). */
	'--desktop-paper-cream': '#f5ebe0',
	'--desktop-paper-cream-soft': '#faf3e8',
	'--desktop-paper-highlight': '#fff9f0',
	'--desktop-paper-warm': '#ebe0d0',
	'--desktop-paper-edge': '#a67c52',
	'--desktop-paper-ring': '#b8956a',
	'--desktop-paper-ink': '#5c4030',
} as const;

export type DesktopDesignTokenKey = keyof typeof DESKTOP_DESIGN_TOKENS;
