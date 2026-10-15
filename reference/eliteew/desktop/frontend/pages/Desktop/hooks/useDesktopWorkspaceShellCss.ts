/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Injects global desktop shell CSS for workspace typography, compositor budget,
 * and shell-level visual accessibility preferences.
 *
 * Invariants:
 * - Reduce-backdrop-blur applies to both the mounted workspace and body portals
 *   used by fixed shell overlays.
 *
 * Related:
 * - components/DesktopShellFloatingPortal.tsx
 * - documentation/product/desktop/DESKTOP-WINDOW-RUNTIME-PERFORMANCE.md
 * ---
 */

import { useMemo } from 'react';

const DESKTOP_WORKSPACE_SHELL_CSS = `
/* Light: subpixel / system smoothing reads better on pale surfaces; dark: grayscale for crisp UI on dark. */
#desktop-main[data-theme="light"],
.desktop-workspace-shell[data-theme="light"] {
  -webkit-font-smoothing: auto;
  -moz-osx-font-smoothing: auto;
  text-rendering: optimizeLegibility;
}
#desktop-main[data-theme="dark"],
.desktop-workspace-shell[data-theme="dark"] {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
#desktop-main .desktop-icon-label {
  text-shadow: 0 1px 2px rgba(0,0,0,0.92), 0 0 14px rgba(0,0,0,0.55);
}
#desktop-main[data-theme="light"] .desktop-icon-label {
  text-shadow: 0 1px 2px rgba(255,255,255,0.95), 0 0 12px rgba(255,255,255,0.75), 0 0 1px rgba(15,23,42,0.9);
}
#desktop-main [data-desktop-icon] .group {
  min-width: 2.75rem;
  min-height: 2.75rem;
  box-sizing: border-box;
}
@media (prefers-reduced-motion: reduce) {
  #desktop-main[data-desktop-dragging="true"] {
    outline: 2px dashed rgb(var(--desktop-accent-rgb) / 0.35);
    outline-offset: -8px;
  }
}

/* Perf / accessibility: soften expensive backdrop blurs inside the workspace shell and body-level portals. */
#desktop-main[data-desktop-reduce-backdrop-blur='true'],
#desktop-main[data-desktop-reduce-backdrop-blur='true'] *,
.desktop-shell-floating-portal[data-desktop-reduce-backdrop-blur='true'],
.desktop-shell-floating-portal[data-desktop-reduce-backdrop-blur='true'] * {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
#desktop-main[data-active-virtual-desktop-id] {
  box-shadow: inset 0 1px 0 0 rgb(var(--desktop-accent-rgb) / 0.18);
}

/* Display typography for shell headings (Start Menu, settings, etc.) */
#desktop-main .desktop-shell-display-text {
  font-family: var(--desktop-font-display, var(--desktop-font-family));
}

/* Scene depth: vignette + subtle icon lift in immersive mode */
#desktop-main[data-desktop-scene-depth='soft']::after,
#desktop-main[data-desktop-scene-depth='balanced']::after,
#desktop-main[data-desktop-scene-depth='immersive']::after {
  content: '';
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 0;
}
#desktop-main[data-desktop-scene-depth='soft']::after {
  background: radial-gradient(ellipse at center, transparent 44%, rgba(0, 0, 0, 0.2) 100%);
}
#desktop-main[data-desktop-scene-depth='balanced']::after {
  background: radial-gradient(ellipse at center, transparent 30%, rgba(0, 0, 0, 0.34) 100%);
}
#desktop-main[data-desktop-scene-depth='immersive']::after {
  background: radial-gradient(ellipse at center, transparent 14%, rgba(0, 0, 0, 0.48) 100%);
}
#desktop-main[data-desktop-scene-depth='immersive'] [data-desktop-icon]:hover .group {
  transform: translateY(-2px);
  transition: transform 0.18s ease;
}
@media (prefers-reduced-motion: reduce) {
  #desktop-main[data-desktop-scene-depth='immersive'] [data-desktop-icon]:hover .group {
    transform: none;
  }
}
`;

/** Injected once on the desktop workspace shell (`<style>` in DesktopWorkspaceContent). */
export function useDesktopWorkspaceShellCss(): string {
	return useMemo(() => DESKTOP_WORKSPACE_SHELL_CSS, []);
}
