/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop folder window body (extracted from EnhancedWindow): nested desktop shortcuts + Unified Content listing, uploads, create actions, batch selection, drag-to-tree for library files and nested shortcuts, inline previews.
 *
 * Invariants:
 * - Image/video row tiles use authenticated `ContentThumbnail` (avoid `<img src={thumbnail_url}>` → 401).
 * - Optional **`onUpdatePayload`** pushes **`companionListingPlain`** into window state for EWA **`shell_context`** (debounced).
 *
 * Related:
 * - useFolderContents.ts; desktopFolderWindow/* (controller, shell, header, explorer panel, tree drop, keyboard, rename modal, context menus).
 */

import type { Variants } from 'framer-motion';
import type { DesktopWindowStyle } from '@/types/profile';
import { DesktopFolderWindowShell } from './desktopFolderWindow/DesktopFolderWindowShell';
import { useFolderWindowController } from './desktopFolderWindow/useFolderWindowController';
import type { WindowInitialPayload, WindowState } from '../types/desktop.types';

export interface DesktopFolderWindowProps {
	win: WindowState;
	windowId: string;
	visualStyle: DesktopWindowStyle;
	contentVariants: Variants;
	reduceMotion: boolean | null;
	/** z-index for portaled menus / modals (below in-app context menu if any) */
	floatingMenuZIndex: number;
	floatingMenuBackdropZIndex: number;
	/** Title bar strip from {@link DESKTOP_WINDOW_TITLEBAR_STYLES} */
	titleBarPreset: { root: string };
	/** Debounced plaintext listing into `WindowInitialPayload.companionListingPlain` for companion shell_context. */
	onUpdatePayload?: (
		payload: Pick<WindowInitialPayload, 'companionListingPlain'>
	) => void;
	onRetargetFolder?: (target: {
		folderId: string;
		title: string;
		path: string[];
	}) => void;
}

export function DesktopFolderWindow({
	win,
	windowId: _windowId,
	visualStyle,
	contentVariants,
	reduceMotion,
	floatingMenuZIndex,
	floatingMenuBackdropZIndex,
	titleBarPreset,
	onUpdatePayload,
	onRetargetFolder,
}: DesktopFolderWindowProps) {
	const controller = useFolderWindowController({
		win,
		onUpdatePayload,
		onRetargetFolder,
	});

	return (
		<DesktopFolderWindowShell
			controller={controller}
			visualStyle={visualStyle}
			contentVariants={contentVariants}
			reduceMotion={reduceMotion}
			floatingMenuZIndex={floatingMenuZIndex}
			floatingMenuBackdropZIndex={floatingMenuBackdropZIndex}
			titleBarPreset={titleBarPreset}
		/>
	);
}
