/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop theme CSS variables, floating-menu geometry, and shared UI helpers for the shell.
 *
 * Invariants:
 * - Light/dark packs must keep `--desktop-chrome-*` coherent with window frame/titlebar presets.
 *
 * Related:
 * - `desktopVisualSystem.tsx`, `documentation/product/DESKTOP-WINDOW-SHELL-STYLE.md`
 */
import type { CSSProperties } from 'react';

import { isHttpRequestAbortLikeError } from '@/services/auth/authSessionHttpAbort';
import { DESKTOP_DESIGN_TOKENS } from '../constants';

/**
 * Токены границ (см. также DESKTOP_DESIGN_TOKENS):
 * - `--desktop-border-subtle` — карточки, инпуты, мягкие разделители.
 * - `--desktop-border-strong` — усиленные панели / CTA-рамки.
 * - `--desktop-border-menu` — только плавающие контекстные меню (тёмный/сланцевый контур без «белой» каймы).
 * - `--desktop-menu-tint` — второй цвет в color-mix фона меню (тёмная тема: углубление; светлая: лёгкий холодный оттенок).
 */
export type DesktopResolvedTheme = 'dark' | 'light';

export interface FloatingMenuAnchor {
	x: number;
	y: number;
}

export interface FloatingMenuPositionOptions {
	menuWidth: number;
	menuHeight: number;
	viewportWidth?: number;
	viewportHeight?: number;
	padding?: number;
	/**
	 * Открыть меню выше якоря (полезно у нижней кромки экрана / таскбара).
	 * Если не задано — выбирается автоматически: якорь в нижней части экрана или не хватает места снизу по оценке высоты.
	 */
	preferAbove?: boolean;
	/** Зазор между якорем и краем меню при `preferAbove` / вертикальном flip (по умолчанию 8). */
	anchorGap?: number;
}

const DESKTOP_LABEL_MAX_CHARS = 30;

const DESKTOP_THEME_VARS: Record<
	DesktopResolvedTheme,
	Record<string, string>
> = {
	dark: {
		'--desktop-bg-primary-rgb': '17 24 39',
		'--desktop-bg-secondary-rgb': '30 36 48',
		/* Плотнее «белый» передний план на тёмном стекле (читаемость подсекций, иконки). */
		'--desktop-fg-primary-rgb': '255 255 255',
		'--desktop-fg-secondary-rgb': '241 245 249',
		'--desktop-border-rgb': '71 85 105',
		'--desktop-text-primary': '#ffffff',
		'--desktop-text-secondary': '#f1f5f9',
		'--desktop-text-muted': '#e2e8f0',
		'--desktop-text-dim': '#cbd5e1',
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
		'--desktop-border-menu': 'rgba(0, 0, 0, 0.52)',
		'--desktop-menu-tint': '#09090b',
		'--desktop-overlay-backdrop': 'rgba(3, 7, 18, 0.58)',
		'--desktop-shadow-soft': '0 22px 48px rgba(0, 0, 0, 0.34)',
		'--desktop-shadow-panel': '0 28px 64px rgba(0, 0, 0, 0.48)',
		'--glass-bg': 'rgba(17, 24, 39, 0.58)',
		'--glass-bg-light': 'rgba(17, 24, 39, 0.42)',
		'--glass-bg-strong': 'rgba(15, 23, 42, 0.86)',
		'--glass-border': 'rgba(255, 255, 255, 0.09)',
		'--glass-border-hover': 'rgba(255, 255, 255, 0.16)',
		'--glass-blur-strong': '22px',
		'--desktop-shell-wash':
			'linear-gradient(180deg, rgba(3, 7, 18, 0.02) 0%, rgba(3, 7, 18, 0.38) 100%)',
		'--desktop-shell-glow':
			'radial-gradient(circle at 14% 12%, rgba(255, 255, 255, 0.055), transparent 44%), radial-gradient(circle at 90% 6%, rgba(148, 163, 184, 0.1), transparent 50%)',
		/** Нижняя панель задач (inline style в Taskbar) */
		'--desktop-taskbar-border-top': 'rgba(255, 255, 255, 0.06)',
		'--desktop-taskbar-bg-solid-color': 'rgba(3, 7, 18, 0.88)',
		/** Без альфы на конце — перекрывает обои при «непрозрачной» панели */
		'--desktop-taskbar-bg-opaque':
			'linear-gradient(180deg, rgb(var(--desktop-bg-secondary-rgb) / 1) 0%, rgb(var(--desktop-bg-primary-rgb) / 1) 100%)',
		'--desktop-taskbar-bg-opaque-premium':
			'linear-gradient(180deg, rgb(34 28 44) 0%, rgb(6 5 12) 100%)',
		'--desktop-taskbar-bg-solid':
			'linear-gradient(180deg, rgba(24, 32, 48, 0.96) 0%, rgba(3, 7, 18, 0.9) 100%)',
		'--desktop-taskbar-bg-clear':
			'linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(15, 23, 42, 0.28) 100%)',
		'--desktop-taskbar-bg-glass':
			'radial-gradient(circle at 16% 0%, rgb(var(--desktop-accent-rgb) / 0.09), transparent 44%), radial-gradient(circle at 84% 0%, rgba(255, 255, 255, 0.07), transparent 36%), linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, transparent 42%), color-mix(in srgb, var(--glass-bg) 84%, transparent 16%)',
		'--desktop-taskbar-shadow-solid': '0 -20px 52px rgba(0, 0, 0, 0.52)',
		'--desktop-taskbar-shadow-clear': '0 -16px 40px rgba(0, 0, 0, 0.45)',
		'--desktop-taskbar-shadow-glass':
			'0 -20px 50px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
		/* Dark-first chrome presets — swapped in light theme (see light block). */
		'--desktop-chrome-aurora-frame-bg':
			'linear-gradient(135deg,rgb(14,10,28) 0%,rgb(4,14,26) 52%,rgb(18,8,22) 100%)',
		'--desktop-chrome-aurora-frame-border': 'rgba(168,85,247,0.42)',
		'--desktop-chrome-aurora-frame-shadow':
			'0 0 0 1px rgba(34,211,238,0.32),0 0 44px -6px rgba(168,85,247,0.45),0 0 80px -14px rgba(34,211,238,0.28)',
		'--desktop-chrome-aurora-content-bg':
			'linear-gradient(128deg,rgba(147,112,246,0.15) 0%,transparent 40%,rgba(34,211,238,0.13) 72%,rgba(251,146,232,0.1) 100%)',
		'--desktop-chrome-aurora-nav-bg':
			'linear-gradient(180deg,rgb(20,12,32) 0%,rgb(6,10,24) 100%)',
		'--desktop-chrome-aurora-footer-bg':
			'linear-gradient(180deg,rgb(18,10,28) 0%,rgb(8,14,26) 100%)',
		'--desktop-chrome-aurora-card-bg':
			'linear-gradient(140deg,rgba(147,112,246,0.12) 0%,transparent 45%,rgba(34,211,238,0.1) 78%,rgba(251,146,232,0.08) 100%)',
		'--desktop-chrome-aurora-card-border': 'rgba(168,85,247,0.34)',
		'--desktop-chrome-aurora-taskbar-bg':
			'linear-gradient(180deg,rgb(18,10,28) 0%,rgb(8,14,26) 100%)',
		'--desktop-chrome-aurora-titlebar-bg':
			'linear-gradient(90deg,rgba(88,28,135,0.38) 0%,rgba(15,23,42,0.96) 16%,rgba(15,23,42,0.96) 84%,rgba(6,182,212,0.32) 100%)',
		'--desktop-chrome-aurora-titlebar-icon-bg':
			'linear-gradient(135deg,rgba(88,28,135,0.4) 0%,rgba(6,182,212,0.2) 100%)',
		'--desktop-chrome-aurora-titlebar-title': '#e0e7ff',
		'--desktop-chrome-aurora-titlebar-pill-bg': 'rgba(15,23,42,0.6)',
		'--desktop-chrome-aurora-titlebar-pill-fg': '#a5f3fc',
		'--desktop-chrome-aurora-titlebar-control-bg': 'rgba(15,23,42,0.55)',
		'--desktop-chrome-aurora-titlebar-control-fg': '#a5b4fc',
		'--desktop-chrome-aurora-icon-app-bg':
			'linear-gradient(135deg,rgb(14,10,28) 0%,rgb(4,14,26) 55%,rgb(18,8,22) 100%)',
		'--desktop-chrome-aurora-icon-file-bg':
			'linear-gradient(128deg,rgba(147,112,246,0.22) 0%,rgb(4,14,26) 100%)',
		'--desktop-chrome-noir-frame-bg':
			'linear-gradient(168deg,rgb(22,22,28) 0%,rgb(0,0,0) 52%,rgb(0,0,0) 100%)',
		'--desktop-chrome-noir-content-bg':
			'linear-gradient(180deg,rgba(255,255,255,0.04) 0%,rgba(0,0,0,0.36) 52%,rgba(0,0,0,0.58) 100%)',
		'--desktop-chrome-noir-card-bg':
			'linear-gradient(180deg,rgba(255,255,255,0.035) 0%,rgba(0,0,0,0.28) 100%)',
		'--desktop-chrome-noir-card-border': 'rgba(255,255,255,0.12)',
		'--desktop-chrome-noir-titlebar-bg':
			'linear-gradient(180deg,rgb(18,18,22) 0%,rgb(0,0,0) 100%)',
		'--desktop-chrome-noir-taskbar-bg':
			'linear-gradient(180deg,rgb(14,14,18) 0%,rgb(0,0,0) 100%)',
		'--desktop-chrome-noir-taskbar-shadow':
			'0 -12px 48px rgba(0,0,0,0.82), inset 0 1px 0 rgba(255,255,255,0.06)',
		'--desktop-chrome-noir-icon-app-bg':
			'linear-gradient(168deg,rgb(22,22,28) 0%,rgb(0,0,0) 58%,rgb(0,0,0) 100%)',
		'--desktop-chrome-noir-icon-file-bg':
			'linear-gradient(180deg,rgb(28,28,32) 0%,rgb(0,0,0) 100%)',
		'--desktop-chrome-noir-icon-border': 'rgba(255,255,255,0.22)',
		'--desktop-chrome-noir-glyph-fg': 'rgba(245,245,250,0.92)',
		'--desktop-chrome-neon-frame-bg':
			'linear-gradient(180deg,rgb(7,9,16) 0%,rgb(1,3,8) 100%)',
		'--desktop-chrome-neon-content-bg':
			'linear-gradient(180deg,rgba(0,0,0,0.28) 0%,rgb(var(--desktop-bg-primary-rgb)/0.08) 42%,rgba(0,0,0,0.52) 100%)',
		'--desktop-chrome-neon-card-bg':
			'linear-gradient(180deg,rgb(12,14,22) 0%,rgb(var(--desktop-bg-primary-rgb)/0.06) 42%,rgb(0,2,8) 100%)',
		'--desktop-chrome-neon-titlebar-bg':
			'linear-gradient(180deg,rgb(8,10,18) 0%,rgb(0,0,0) 100%)',
		'--desktop-chrome-neon-taskbar-bg':
			'linear-gradient(180deg,rgb(8,10,18) 0%,rgb(0,0,0) 100%)',
		'--desktop-chrome-neon-taskbar-shadow':
			'0 -8px 32px rgba(0,0,0,0.55), 0 -2px 20px -4px rgb(var(--desktop-accent-rgb)/0.35)',
		'--desktop-chrome-neon-icon-app-bg':
			'linear-gradient(180deg,rgb(7,9,16) 0%,rgb(1,3,8) 100%)',
		'--desktop-chrome-neon-icon-file-bg':
			'linear-gradient(180deg,rgb(10,12,18) 0%,rgb(0,0,0) 100%)',
		'--desktop-chrome-neon-glyph-fg': '#ffffff',
		'--desktop-chrome-premium-frame-bg':
			'radial-gradient(ellipse at 50% -30%,rgba(255,220,180,0.14) 0%,transparent 52%),radial-gradient(ellipse at 50% 118%,rgba(160,120,70,0.1) 0%,transparent 50%),linear-gradient(168deg,rgb(34,28,44) 0%,rgb(14,12,22) 42%,rgb(4,3,8) 100%)',
		'--desktop-chrome-premium-content-bg':
			'linear-gradient(180deg,rgba(255,250,245,0.05) 0%,transparent 36%,rgba(0,0,0,0.2) 100%)',
		'--desktop-chrome-premium-card-bg':
			'linear-gradient(180deg,rgba(255,250,245,0.06) 0%,transparent 42%,rgba(0,0,0,0.18) 100%)',
		'--desktop-chrome-premium-titlebar-bg':
			'linear-gradient(180deg,rgb(44,36,54) 0%,rgb(18,14,26) 52%,rgb(8,6,14) 100%)',
		'--desktop-chrome-premium-titlebar-icon-bg':
			'linear-gradient(155deg,rgb(60,48,72) 0%,rgb(20,16,32) 100%)',
		'--desktop-chrome-premium-titlebar-title': 'rgba(252,250,246,0.96)',
		'--desktop-chrome-premium-titlebar-muted': 'rgba(210,200,185,0.85)',
		'--desktop-chrome-premium-taskbar-bg':
			'radial-gradient(ellipse 140% 100% at 50% 0%, rgba(255,220,180,0.16) 0%, transparent 50%),radial-gradient(ellipse 95% 85% at 10% 0%, rgba(255,250,240,0.06) 0%, transparent 38%),radial-gradient(ellipse 95% 85% at 90% 0%, rgba(255,220,180,0.08) 0%, transparent 38%),radial-gradient(ellipse 120% 100% at 50% 115%, rgba(100,62,40,0.2) 0%, transparent 44%),linear-gradient(180deg, rgb(30,26,40) 0%, rgb(12,10,18) 45%, rgb(4,3,8) 100%)',
		'--desktop-chrome-premium-taskbar-shadow':
			'0 -20px 80px rgba(0,0,0,0.78), 0 -8px 36px rgba(212,175,106,0.12), 0 0 0 1px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,250,240,0.1), inset 0 -1px 0 rgba(0,0,0,0.4)',
		'--desktop-chrome-premium-icon-app-bg':
			'radial-gradient(ellipse at 50% -20%,rgba(255,220,180,0.18) 0%,transparent 52%),linear-gradient(168deg,rgb(34,28,44) 0%,rgb(8,7,14) 100%)',
		'--desktop-chrome-premium-icon-file-bg':
			'linear-gradient(180deg,rgb(40,34,52) 0%,rgb(12,10,18) 100%)',
		'--desktop-chrome-premium-glyph-fg': 'rgb(255,248,235)',
		'--desktop-chrome-premium-button-bg': 'rgba(0,0,0,0.38)',
		'--desktop-chrome-premium-button-hover-bg': 'rgba(212,175,106,0.14)',
		/* Dark chameleon — iridescent but opaque enough for light theme text tokens. */
		'--desktop-chrome-chameleon-frame-bg':
			'linear-gradient(135deg,rgb(52,28,42) 0%,rgb(22,38,58) 40%,rgb(24,48,40) 72%,rgb(52,42,28) 100%)',
		'--desktop-chrome-chameleon-content-bg':
			'linear-gradient(135deg,rgb(48,26,40) 0%,rgb(20,36,54) 40%,rgb(22,46,38) 72%,rgb(48,40,26) 100%)',
		'--desktop-chrome-chameleon-nav-bg':
			'linear-gradient(180deg,rgb(48,30,42) 0%,rgb(24,40,56) 100%)',
		'--desktop-chrome-chameleon-footer-bg':
			'linear-gradient(180deg,rgb(36,40,56) 0%,rgb(28,48,40) 100%)',
		'--desktop-chrome-chameleon-card-bg':
			'linear-gradient(135deg,rgb(56,32,46) 0%,rgb(28,44,62) 40%,rgb(30,54,44) 72%,rgb(56,46,32) 100%)',
		'--desktop-chrome-chameleon-titlebar-bg':
			'linear-gradient(135deg,rgb(58,34,48) 0%,rgb(28,44,64) 40%,rgb(30,56,46) 72%,rgb(58,48,34) 100%)',
		'--desktop-chrome-chameleon-taskbar-bg':
			'linear-gradient(90deg,rgb(52,28,42) 0%,rgb(22,38,58) 35%,rgb(24,48,40) 70%,rgb(52,42,28) 100%)',
		'--desktop-chrome-chameleon-icon-app-bg':
			'linear-gradient(135deg,rgb(52,28,42) 0%,rgb(22,38,58) 40%,rgb(24,48,40) 72%,rgb(52,42,28) 100%)',
		'--desktop-chrome-chameleon-icon-file-bg':
			'linear-gradient(135deg,rgb(56,34,48) 0%,rgb(28,44,62) 100%)',
	},
	light: {
		/* Warm-neutral paper light — avoids cold slate fighting purple aurora chrome. */
		'--desktop-bg-primary-rgb': '248 247 245',
		'--desktop-bg-secondary-rgb': '238 236 232',
		'--desktop-fg-primary-rgb': '15 23 42',
		'--desktop-fg-secondary-rgb': '30 41 59',
		'--desktop-border-rgb': '148 163 184',
		'--desktop-text-primary': '#0a0f1a',
		'--desktop-text-secondary': '#1e293b',
		'--desktop-text-muted': '#334155',
		'--desktop-text-dim': '#475569',
		'--desktop-surface-app':
			'linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 249, 247, 0.96) 48%, rgba(255, 255, 255, 0.99) 100%)',
		'--desktop-surface-panel': 'rgba(255, 255, 255, 0.82)',
		'--desktop-surface-panel-strong': 'rgba(255, 255, 255, 0.94)',
		'--desktop-surface-soft': 'rgba(15, 23, 42, 0.045)',
		'--desktop-surface-soft-hover': 'rgba(15, 23, 42, 0.08)',
		'--desktop-surface-soft-active': 'rgba(15, 23, 42, 0.11)',
		'--desktop-surface-accent': 'rgba(var(--desktop-accent-rgb), 0.12)',
		'--desktop-surface-accent-strong': 'rgba(var(--desktop-accent-rgb), 0.2)',
		'--desktop-border-subtle': 'rgba(15, 23, 42, 0.1)',
		'--desktop-border-strong': 'rgba(15, 23, 42, 0.16)',
		'--desktop-border-menu': 'rgba(15, 23, 42, 0.14)',
		'--desktop-menu-tint': '#e8e6e1',
		'--desktop-overlay-backdrop': 'rgba(15, 23, 42, 0.2)',
		'--desktop-shadow-soft': '0 18px 42px rgba(15, 23, 42, 0.1)',
		'--desktop-shadow-panel': '0 26px 56px rgba(15, 23, 42, 0.14)',
		'--glass-bg': 'rgba(255, 255, 255, 0.55)',
		'--glass-bg-light': 'rgba(255, 255, 255, 0.38)',
		'--glass-bg-strong': 'rgba(255, 255, 255, 0.88)',
		'--glass-border': 'rgba(15, 23, 42, 0.11)',
		'--glass-border-hover': 'rgba(15, 23, 42, 0.18)',
		'--glass-blur-strong': '22px',
		'--desktop-shell-wash':
			'linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(226, 232, 240, 0.22) 100%)',
		'--desktop-shell-glow':
			'radial-gradient(circle at 12% 10%, rgba(148, 163, 184, 0.12), transparent 46%), radial-gradient(circle at 88% 8%, rgba(255, 255, 255, 0.35), transparent 48%)',
		'--desktop-taskbar-border-top': 'rgba(15, 23, 42, 0.1)',
		'--desktop-taskbar-bg-solid-color': 'rgba(255, 255, 255, 0.94)',
		'--desktop-taskbar-bg-opaque':
			'linear-gradient(180deg, rgb(var(--desktop-bg-secondary-rgb) / 1) 0%, rgb(var(--desktop-bg-primary-rgb) / 1) 100%)',
		'--desktop-taskbar-bg-opaque-premium':
			'linear-gradient(180deg, rgb(255 250 245) 0%, rgb(245 236 228) 100%)',
		'--desktop-taskbar-bg-solid':
			'linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(241, 245, 249, 0.92) 100%)',
		'--desktop-taskbar-bg-clear':
			'linear-gradient(180deg, rgba(255, 255, 255, 0.78) 0%, rgba(250, 249, 247, 0.62) 100%)',
		'--desktop-taskbar-bg-glass':
			'radial-gradient(circle at 16% 0%, rgb(var(--desktop-accent-rgb) / 0.1), transparent 44%), radial-gradient(circle at 84% 0%, rgba(255, 255, 255, 0.75), transparent 40%), linear-gradient(180deg, rgba(255, 255, 255, 0.62) 0%, transparent 45%), color-mix(in srgb, var(--glass-bg) 78%, rgba(255, 255, 255, 0.72) 22%)',
		'--desktop-taskbar-shadow-solid': '0 -16px 42px rgba(15, 23, 42, 0.1)',
		'--desktop-taskbar-shadow-clear': '0 -14px 36px rgba(15, 23, 42, 0.08)',
		'--desktop-taskbar-shadow-glass':
			'0 -16px 40px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.55)',
		/* Light-coherent chrome for presets that are dark-hardcoded in code. */
		'--desktop-chrome-aurora-frame-bg':
			'linear-gradient(135deg,rgb(252,250,255) 0%,rgb(238,242,255) 48%,rgb(245,243,255) 100%)',
		'--desktop-chrome-aurora-frame-border': 'rgba(124,58,237,0.32)',
		'--desktop-chrome-aurora-frame-shadow':
			'0 0 0 1px rgba(34,211,238,0.18),0 18px 40px rgba(15,23,42,0.1),0 0 36px -10px rgba(168,85,247,0.22)',
		'--desktop-chrome-aurora-content-bg':
			'linear-gradient(128deg,rgba(147,112,246,0.1) 0%,rgba(255,255,255,0.72) 38%,rgba(34,211,238,0.08) 72%,rgba(251,146,232,0.07) 100%)',
		'--desktop-chrome-aurora-nav-bg':
			'linear-gradient(180deg,rgb(250,248,255) 0%,rgb(238,242,255) 100%)',
		'--desktop-chrome-aurora-footer-bg':
			'linear-gradient(180deg,rgb(248,250,255) 0%,rgb(241,245,255) 100%)',
		'--desktop-chrome-aurora-card-bg':
			'linear-gradient(140deg,rgba(255,255,255,0.92) 0%,rgba(245,243,255,0.88) 42%,rgba(236,254,255,0.75) 100%)',
		'--desktop-chrome-aurora-card-border': 'rgba(124,58,237,0.22)',
		'--desktop-chrome-aurora-taskbar-bg':
			'linear-gradient(180deg,rgb(250,248,255) 0%,rgb(238,242,255) 100%)',
		'--desktop-chrome-aurora-titlebar-bg':
			'linear-gradient(90deg,rgba(167,139,250,0.2) 0%,rgb(250,248,255) 18%,rgb(248,250,255) 82%,rgba(34,211,238,0.16) 100%)',
		'--desktop-chrome-aurora-titlebar-icon-bg':
			'linear-gradient(135deg,rgba(167,139,250,0.22) 0%,rgba(34,211,238,0.14) 100%)',
		'--desktop-chrome-aurora-titlebar-title': '#1e1b4b',
		'--desktop-chrome-aurora-titlebar-pill-bg': 'rgba(255,255,255,0.78)',
		'--desktop-chrome-aurora-titlebar-pill-fg': '#0e7490',
		'--desktop-chrome-aurora-titlebar-control-bg': 'rgba(255,255,255,0.72)',
		'--desktop-chrome-aurora-titlebar-control-fg': '#5b21b6',
		'--desktop-chrome-aurora-icon-app-bg':
			'linear-gradient(135deg,rgb(250,248,255) 0%,rgb(238,242,255) 55%,rgb(245,243,255) 100%)',
		'--desktop-chrome-aurora-icon-file-bg':
			'linear-gradient(128deg,rgba(147,112,246,0.14) 0%,rgb(248,250,255) 100%)',
		'--desktop-chrome-noir-frame-bg':
			'linear-gradient(168deg,rgb(255,255,255) 0%,rgb(241,245,249) 55%,rgb(226,232,240) 100%)',
		'--desktop-chrome-noir-content-bg':
			'linear-gradient(180deg,rgba(255,255,255,0.9) 0%,rgba(241,245,249,0.85) 100%)',
		'--desktop-chrome-noir-card-bg':
			'linear-gradient(180deg,rgba(255,255,255,0.95) 0%,rgba(248,250,252,0.9) 100%)',
		'--desktop-chrome-noir-card-border': 'rgba(15,23,42,0.14)',
		'--desktop-chrome-noir-titlebar-bg':
			'linear-gradient(180deg,rgb(255,255,255) 0%,rgb(241,245,249) 100%)',
		'--desktop-chrome-noir-taskbar-bg':
			'linear-gradient(180deg,rgb(255,255,255) 0%,rgb(241,245,249) 100%)',
		'--desktop-chrome-noir-taskbar-shadow':
			'0 -12px 36px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.65)',
		'--desktop-chrome-noir-icon-app-bg':
			'linear-gradient(168deg,rgb(255,255,255) 0%,rgb(241,245,249) 58%,rgb(226,232,240) 100%)',
		'--desktop-chrome-noir-icon-file-bg':
			'linear-gradient(180deg,rgb(255,255,255) 0%,rgb(241,245,249) 100%)',
		'--desktop-chrome-noir-icon-border': 'rgba(15,23,42,0.16)',
		'--desktop-chrome-noir-glyph-fg': 'rgba(15,23,42,0.88)',
		'--desktop-chrome-neon-frame-bg':
			'linear-gradient(180deg,rgb(255,255,255) 0%,rgb(248,250,252) 100%)',
		'--desktop-chrome-neon-content-bg':
			'linear-gradient(180deg,rgba(255,255,255,0.92) 0%,rgb(var(--desktop-accent-rgb)/0.06) 48%,rgba(248,250,252,0.95) 100%)',
		'--desktop-chrome-neon-card-bg':
			'linear-gradient(180deg,rgba(255,255,255,0.96) 0%,rgb(var(--desktop-accent-rgb)/0.05) 50%,rgba(248,250,252,0.94) 100%)',
		'--desktop-chrome-neon-titlebar-bg':
			'linear-gradient(180deg,rgb(255,255,255) 0%,rgb(248,250,252) 100%)',
		'--desktop-chrome-neon-taskbar-bg':
			'linear-gradient(180deg,rgb(255,255,255) 0%,rgb(248,250,252) 100%)',
		'--desktop-chrome-neon-taskbar-shadow':
			'0 -8px 28px rgba(15,23,42,0.1), 0 -2px 18px -4px rgb(var(--desktop-accent-rgb)/0.22)',
		'--desktop-chrome-neon-icon-app-bg':
			'linear-gradient(180deg,rgb(255,255,255) 0%,rgb(248,250,252) 100%)',
		'--desktop-chrome-neon-icon-file-bg':
			'linear-gradient(180deg,rgba(255,255,255,0.96) 0%,rgb(var(--desktop-accent-rgb)/0.06) 100%)',
		'--desktop-chrome-neon-glyph-fg': 'rgb(var(--desktop-accent-rgb))',
		'--desktop-chrome-premium-frame-bg':
			'radial-gradient(ellipse at 50% -30%,rgba(255,220,180,0.22) 0%,transparent 52%),linear-gradient(168deg,rgb(255,252,248) 0%,rgb(250,245,240) 50%,rgb(245,238,230) 100%)',
		'--desktop-chrome-premium-content-bg':
			'linear-gradient(180deg,rgba(255,250,245,0.85) 0%,rgba(255,255,255,0.7) 40%,rgba(245,238,230,0.55) 100%)',
		'--desktop-chrome-premium-card-bg':
			'linear-gradient(180deg,rgba(255,255,255,0.95) 0%,rgba(255,250,245,0.88) 100%)',
		'--desktop-chrome-premium-titlebar-bg':
			'linear-gradient(180deg,rgb(255,252,248) 0%,rgb(250,245,240) 55%,rgb(245,238,230) 100%)',
		'--desktop-chrome-premium-titlebar-icon-bg':
			'linear-gradient(155deg,rgb(255,250,245) 0%,rgb(245,236,228) 100%)',
		'--desktop-chrome-premium-titlebar-title': '#3f2e1f',
		'--desktop-chrome-premium-titlebar-muted': 'rgba(87,65,47,0.78)',
		'--desktop-chrome-premium-taskbar-bg':
			'radial-gradient(ellipse 140% 100% at 50% 0%, rgba(255,220,180,0.2) 0%, transparent 50%),linear-gradient(180deg, rgb(255,252,248) 0%, rgb(250,245,240) 55%, rgb(245,238,230) 100%)',
		'--desktop-chrome-premium-taskbar-shadow':
			'0 -16px 40px rgba(15,23,42,0.1), 0 -6px 24px rgba(212,175,106,0.12), inset 0 1px 0 rgba(255,250,240,0.65)',
		'--desktop-chrome-premium-icon-app-bg':
			'radial-gradient(ellipse at 50% -20%,rgba(255,220,180,0.28) 0%,transparent 52%),linear-gradient(168deg,rgb(255,252,248) 0%,rgb(245,236,228) 100%)',
		'--desktop-chrome-premium-icon-file-bg':
			'linear-gradient(180deg,rgb(255,250,245) 0%,rgb(245,236,228) 100%)',
		'--desktop-chrome-premium-glyph-fg': '#3f2e1f',
		'--desktop-chrome-premium-button-bg': 'rgba(255,255,255,0.55)',
		'--desktop-chrome-premium-button-hover-bg': 'rgba(212,175,106,0.18)',
		/* Light chameleon — classic pastel multi-stop (readable with dark text tokens). */
		'--desktop-chrome-chameleon-frame-bg':
			'linear-gradient(135deg,rgb(255,228,235) 0%,rgb(220,235,255) 40%,rgb(225,255,228) 72%,rgb(255,245,220) 100%)',
		'--desktop-chrome-chameleon-content-bg':
			'linear-gradient(135deg,rgb(255,228,235) 0%,rgb(220,235,255) 40%,rgb(225,255,228) 72%,rgb(255,245,220) 100%)',
		'--desktop-chrome-chameleon-nav-bg':
			'linear-gradient(180deg,rgb(255,232,240) 0%,rgb(225,240,255) 100%)',
		'--desktop-chrome-chameleon-footer-bg':
			'linear-gradient(180deg,rgb(240,248,255) 0%,rgb(230,255,235) 100%)',
		'--desktop-chrome-chameleon-card-bg':
			'linear-gradient(135deg,rgb(255,228,235) 0%,rgb(220,235,255) 40%,rgb(225,255,228) 72%,rgb(255,245,220) 100%)',
		'--desktop-chrome-chameleon-titlebar-bg':
			'linear-gradient(135deg,rgb(255,228,235) 0%,rgb(220,235,255) 40%,rgb(225,255,228) 72%,rgb(255,245,220) 100%)',
		'--desktop-chrome-chameleon-taskbar-bg':
			'linear-gradient(90deg,rgb(255,220,230) 0%,rgb(220,240,255) 35%,rgb(230,255,220) 70%,rgb(255,240,220) 100%)',
		'--desktop-chrome-chameleon-icon-app-bg':
			'linear-gradient(135deg,rgb(255,228,235) 0%,rgb(220,235,255) 40%,rgb(225,255,228) 72%,rgb(255,245,220) 100%)',
		'--desktop-chrome-chameleon-icon-file-bg':
			'linear-gradient(135deg,rgb(255,232,240) 0%,rgb(225,240,255) 100%)',
	},
};

export function getDesktopThemeVars(
	theme: DesktopResolvedTheme
): Record<string, string> {
	return DESKTOP_THEME_VARS[theme];
}

const DEFAULT_DESKTOP_PORTAL_ACCENT_RGB = '139 92 246';

/**
 * Инлайн-стиль для `createPortal(..., document.body)`: на `#desktop-main` висят
 * `DESKTOP_DESIGN_TOKENS` и тема — у потомков `body` они не наследуются, без этого
 * `bg-(--desktop-*)` / `border-(--desktop-*)` в модалках дают прозрачность.
 */
export function getDesktopPortalShellProps(): {
	style: CSSProperties;
	theme: DesktopResolvedTheme;
} {
	const base = { ...DESKTOP_DESIGN_TOKENS } as unknown as Record<
		string,
		string
	>;
	if (typeof document === 'undefined') {
		const theme: DesktopResolvedTheme = 'dark';
		return {
			theme,
			style: {
				...base,
				...getDesktopThemeVars(theme),
				'--desktop-accent-rgb': DEFAULT_DESKTOP_PORTAL_ACCENT_RGB,
				colorScheme: theme,
			} as CSSProperties,
		};
	}
	const root = document.getElementById('desktop-main');
	const rawTheme = root?.dataset.theme;
	const theme: DesktopResolvedTheme =
		rawTheme === 'light' || rawTheme === 'dark' ? rawTheme : 'dark';
	const accent = root
		? getComputedStyle(root).getPropertyValue('--desktop-accent-rgb').trim()
		: '';
	const styleRecord: Record<string, string> = {
		...(base as Record<string, string>),
		...getDesktopThemeVars(theme),
	};
	if (root) {
		const src = root.style;
		for (let i = 0; i < src.length; i++) {
			const name = src.item(i);
			if (name?.startsWith('--')) {
				styleRecord[name] = src.getPropertyValue(name);
			}
		}
	}
	styleRecord['--desktop-accent-rgb'] =
		accent || DEFAULT_DESKTOP_PORTAL_ACCENT_RGB;
	const fontFamily = root?.style.fontFamily;
	return {
		theme,
		style: {
			...styleRecord,
			...(fontFamily ? { fontFamily } : {}),
			colorScheme: theme,
		} as CSSProperties,
	};
}

export function formatDesktopLabel(
	label: string,
	maxChars: number = DESKTOP_LABEL_MAX_CHARS
): string {
	const normalized = label.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxChars) {
		return normalized;
	}
	return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function getFloatingMenuPosition(
	anchor: FloatingMenuAnchor,
	options: FloatingMenuPositionOptions
): FloatingMenuAnchor {
	const viewportWidth =
		options.viewportWidth ??
		(typeof window !== 'undefined' ? window.innerWidth : options.menuWidth);
	const viewportHeight =
		options.viewportHeight ??
		(typeof window !== 'undefined' ? window.innerHeight : options.menuHeight);
	const padding = options.padding ?? 8;
	const gap = options.anchorGap ?? 8;
	const wouldOverflowBelow =
		anchor.y + options.menuHeight > viewportHeight - padding;
	/** Нижняя треть экрана: по умолчанию тянем меню вверх (ПКМ по таскбару, низ окна). */
	const anchorInLowerBand = anchor.y > viewportHeight * 0.72;
	const preferAbove =
		options.preferAbove === undefined
			? wouldOverflowBelow || anchorInLowerBand
			: options.preferAbove;

	let x = anchor.x;
	let y = preferAbove ? anchor.y - options.menuHeight - gap : anchor.y;

	if (x + options.menuWidth > viewportWidth - padding) {
		x = anchor.x - options.menuWidth;
	}

	if (preferAbove) {
		if (y < padding) {
			y = anchor.y + gap;
		}
	} else if (y + options.menuHeight > viewportHeight - padding) {
		y = anchor.y - options.menuHeight - gap;
	}

	if (y + options.menuHeight > viewportHeight - padding) {
		y = viewportHeight - options.menuHeight - padding;
	}
	if (y < padding) {
		y = padding;
	}

	x = Math.max(
		padding,
		Math.min(x, viewportWidth - options.menuWidth - padding)
	);
	y = Math.max(
		padding,
		Math.min(y, viewportHeight - options.menuHeight - padding)
	);

	return { x, y };
}

/**
 * Поджимает левый верх угла `position: fixed` бокса, чтобы он оставался в видимой области
 * (после измерения реальных width/height).
 */
export function clampFixedBoxToViewport(
	left: number,
	top: number,
	width: number,
	height: number,
	options?: {
		padding?: number;
		viewportWidth?: number;
		viewportHeight?: number;
	}
): FloatingMenuAnchor {
	const padding = options?.padding ?? 12;
	const vw =
		options?.viewportWidth ??
		(typeof window !== 'undefined' ? window.innerWidth : width + padding * 2);
	const vh =
		options?.viewportHeight ??
		(typeof window !== 'undefined' ? window.innerHeight : height + padding * 2);

	let x = left;
	let y = top;
	x = Math.min(x, vw - padding - width);
	x = Math.max(padding, x);
	y = Math.min(y, vh - padding - height);
	y = Math.max(padding, y);
	return { x, y };
}

/** Параметры позиции контекстного меню от координат курсора (clientX / clientY). */
export interface ContextMenuCursorPositionInput {
	clientX: number;
	clientY: number;
	menuWidth: number;
	menuHeight: number;
	viewportWidth?: number;
	viewportHeight?: number;
	/** Отступ от краёв вьюпорта (по умолчанию 12) */
	padding?: number;
	/** Сдвиг от точки клика (по умолчанию 4) */
	cursorGap?: number;
	/** Зазор при «перевороте» меню влево/вверх (по умолчанию 8) */
	flipGap?: number;
}

/**
 * Левый верхний угол меню от позиции курсора: сдвиг, flip по X/Y, clamp в viewport.
 * Используйте для ПКМ-меню вместо «голого» anchor без зазора.
 */
export function getContextMenuPositionFromCursor(
	input: ContextMenuCursorPositionInput
): FloatingMenuAnchor {
	const viewportWidth =
		input.viewportWidth ??
		(typeof globalThis !== 'undefined' &&
		typeof globalThis.window !== 'undefined'
			? globalThis.window.innerWidth
			: input.menuWidth + (input.padding ?? 12) * 2);
	const viewportHeight =
		input.viewportHeight ??
		(typeof globalThis !== 'undefined' &&
		typeof globalThis.window !== 'undefined'
			? globalThis.window.innerHeight
			: input.menuHeight + (input.padding ?? 12) * 2);

	const padding = input.padding ?? 12;
	const cursorGap = input.cursorGap ?? 4;
	const flipGap = input.flipGap ?? 8;

	const preferredX = input.clientX + cursorGap;
	const preferredY = input.clientY + cursorGap;

	let nextX = preferredX;
	if (preferredX + input.menuWidth > viewportWidth - padding) {
		const flippedX = input.clientX - input.menuWidth - flipGap;
		nextX =
			flippedX >= padding
				? flippedX
				: viewportWidth - input.menuWidth - padding;
	}

	let nextY = preferredY;
	if (preferredY + input.menuHeight > viewportHeight - padding) {
		const flippedY = input.clientY - input.menuHeight - flipGap;
		nextY =
			flippedY >= padding
				? flippedY
				: viewportHeight - input.menuHeight - padding;
	}

	const clampedX = Math.max(
		padding,
		Math.min(nextX, viewportWidth - input.menuWidth - padding)
	);
	const clampedY = Math.max(
		padding,
		Math.min(nextY, viewportHeight - input.menuHeight - padding)
	);

	return { x: clampedX, y: clampedY };
}

/** Classify API/axios-style failures for unified desktop load/sync messaging (i18n keys in `desktopUi` namespace). */
export type DesktopLoadFailureKind =
	| 'auth'
	| 'timeout'
	| 'network'
	| 'server'
	| 'aborted'
	| 'unknown';

export type DesktopLoadFailureInfo = {
	kind: DesktopLoadFailureKind;
	httpStatus?: number;
};

export function classifyDesktopLoadFailure(
	error: unknown
): DesktopLoadFailureInfo {
	if (isHttpRequestAbortLikeError(error)) {
		return { kind: 'aborted' };
	}
	const err = error as {
		code?: string;
		name?: string;
		response?: { status?: number };
		message?: string;
	};
	const status = err.response?.status;
	if (status === 401) return { kind: 'auth', httpStatus: 401 };
	if (status === 408) return { kind: 'timeout', httpStatus: 408 };
	const msg = (err.message ?? '').toLowerCase();
	if (
		err.code === 'ECONNABORTED' ||
		(msg.includes('timeout') && err.name !== 'CanceledError')
	) {
		return { kind: 'timeout' };
	}
	if (status != null && status >= 500)
		return { kind: 'server', httpStatus: status };
	if (
		!status &&
		(err.code === 'ERR_NETWORK' ||
			msg === 'network error' ||
			msg.includes('network'))
	) {
		return { kind: 'network' };
	}
	return { kind: 'unknown', httpStatus: status };
}

/** Target element for contextmenu (React may pass a Text node). */
export function getContextMenuTargetElement(
	target: EventTarget | null
): Element | null {
	if (!target) return null;
	if (target instanceof Element) return target;
	if (target instanceof Text) return target.parentElement;
	return null;
}

const TEXT_LIKE_INPUT_TYPES = new Set([
	'',
	'text',
	'search',
	'url',
	'tel',
	'email',
	'password',
	'number',
	'date',
	'time',
	'datetime-local',
]);

/**
 * Desktop shell: keep the browser native context menu only on editable controls
 * (paste, spellcheck). Elsewhere the shell suppresses it to mimic OS chrome.
 */
export function isBrowserContextMenuAllowedTarget(
	target: EventTarget | null
): boolean {
	const el = getContextMenuTargetElement(target);
	if (!el) return false;
	const field = el.closest('input, textarea, select, [contenteditable="true"]');
	if (!field) return false;
	if (field instanceof HTMLInputElement) {
		if (!TEXT_LIKE_INPUT_TYPES.has(field.type)) return false;
		return !field.readOnly && !field.disabled;
	}
	if (field instanceof HTMLTextAreaElement) {
		return !field.readOnly && !field.disabled;
	}
	if (field instanceof HTMLSelectElement) {
		return !field.disabled;
	}
	if (field instanceof HTMLElement && field.isContentEditable) {
		return true;
	}
	return false;
}
