/**
 * Lucide stroke + SVG rendering hints for desktop chrome (no imports from desktopVisualSystem).
 * Slightly thicker default stroke reads clearer at 16–44px icon sizes on 1× and 2× displays.
 */

export const DESKTOP_LUCIDE = {
	stroke: 1.5 as const,
	/** Emphasis: project folders, dense tiles */
	strokeStrong: 1.65 as const,
	xs: 'w-3 h-3 shrink-0 text-[var(--desktop-text-dim)]',
	sm: 'w-3.5 h-3.5 shrink-0 text-[var(--desktop-text-dim)]',
	md: 'w-4 h-4 shrink-0 text-[var(--desktop-text-muted)]',
	lg: 'w-5 h-5 shrink-0 text-[var(--desktop-text-secondary)]',
	/** Subtle accent for “active” tray/metadata hints */
	accentSm: 'w-3.5 h-3.5 shrink-0 text-[rgb(var(--desktop-accent-rgb)/0.88)]',
} as const;

/**
 * Wrappers around Lucide SVGs: block layout (no inline gap), crisp vector hints.
 */
export const DESKTOP_ICON_SVG_QUALITY =
	'[&_svg]:block [&_svg]:shrink-0 [&_svg]:[shape-rendering:geometricPrecision]';
