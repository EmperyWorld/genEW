/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Typed prop groups for the T32 derived layout bridge — reduces flat prop fan-out
 * in DesktopWorkspaceContent before useDesktopWorkspaceShellLayoutInputBridge.
 *
 * Invariants:
 * - Groups partition derived handler params without overlap.
 * - Field names match useDesktopWorkspaceShellModalsLayoutDerivedHandlers input exactly.
 *
 * Related:
 * - hooks/useDesktopWorkspaceShellLayoutDerivedInput.ts
 * - hooks/useDesktopWorkspaceShellModalsLayoutDerivedHandlers.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import type { useDesktopWorkspaceShellModalsLayoutDerivedHandlers } from '../hooks/useDesktopWorkspaceShellModalsLayoutDerivedHandlers';

type DerivedInput = Parameters<
	typeof useDesktopWorkspaceShellModalsLayoutDerivedHandlers
>[0];

/** Window context menu dismiss and overlay panel close setters. */
export type DesktopWorkspaceShellLayoutDerivedContextMenuAndOverlaysGroup =
	Pick<
		DerivedInput,
		'setWindowContextMenu' | 'setShowShortcutsHelp' | 'setShowSessionInfoPanel'
	>;

/** Shell settings entry and optional unified admin launch. */
export type DesktopWorkspaceShellLayoutDerivedShellSettingsAndAdminGroup = Pick<
	DerivedInput,
	| 'openShellSettings'
	| 'canOpenUnifiedAdmin'
	| 'handleOpenWindow'
	| 'unifiedAdminDesktopItem'
>;

/** Virtual desktop CRUD, workspace profiles and VD drop hover. */
export type DesktopWorkspaceShellLayoutDerivedVirtualDesktopsStateGroup = Pick<
	DerivedInput,
	| 'desktops'
	| 'activeDesktopId'
	| 'createDesktop'
	| 'deleteDesktop'
	| 'switchToDesktop'
	| 'updateDesktopName'
	| 'workspaceProfiles'
	| 'onOpenWorkspaceProfile'
	| 'vdDropHoverId'
>;

/** Grouped input for useDesktopWorkspaceShellLayoutDerivedInput. */
export type DesktopWorkspaceShellLayoutDerivedBridgeInput = {
	contextMenuAndOverlays: DesktopWorkspaceShellLayoutDerivedContextMenuAndOverlaysGroup;
	shellSettingsAndAdmin: DesktopWorkspaceShellLayoutDerivedShellSettingsAndAdminGroup;
	virtualDesktopsState: DesktopWorkspaceShellLayoutDerivedVirtualDesktopsStateGroup;
};
