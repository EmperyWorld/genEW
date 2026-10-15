/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Compatibility re-exports for help/session and search overlay modules.
 *
 * Invariants:
 * - Search overlays live in a separate file so idle shell can import help without QuickSearch.
 *
 * Related:
 * - DesktopWorkspaceHelpAndSession.tsx, DesktopWorkspaceSearchOverlays.tsx
 */

export {
	DesktopWorkspaceHelpAndSession,
	type DesktopWorkspaceHelpAndSessionProps,
} from './DesktopWorkspaceHelpAndSession';
export {
	DesktopWorkspaceSearchOverlays,
	type DesktopWorkspaceQuickSearchHostProps,
	type DesktopWorkspaceSearchOverlaysProps,
} from './DesktopWorkspaceSearchOverlays';
