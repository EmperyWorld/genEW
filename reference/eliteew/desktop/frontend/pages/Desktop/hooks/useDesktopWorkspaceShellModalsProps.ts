import { useMemo } from 'react';
import type { DesktopModalsLayerProps } from '../components/DesktopModalsLayer';
import type { DesktopItem } from '../types/desktop.types';
import type { DesktopIconStyle, DesktopWindowStyle } from '@/types/profile';

export function useDesktopWorkspaceShellModalsProps(params: {
	showWP: boolean;
	setShowWP: (v: boolean) => void;
	wallpaper: string;
	wallpaperHistory: string[] | undefined;
	handleWallpaperChange: (value: string) => void;
	handleRemoveUserWallpaper: (style: string) => void;
	openWallpaperFromDesktopSettings: () => void;
	showNF: boolean;
	setShowNF: (v: boolean) => void;
	onCloseNewFolder?: () => void;
	handleCreateFolder: (name: string, iconId: string) => void | Promise<void>;
	desktopWindowStyle: DesktopWindowStyle;
	desktopIconStyle: DesktopIconStyle;
	showCommandPalette: boolean;
	setShowCommandPalette: (v: boolean) => void;
	displayItems: DesktopItem[];
	handleOpenWindow: (item: DesktopItem) => void;
	handleCommandPaletteAction: (action: string) => void;
	showClipboard: boolean;
	setShowClipboard: (v: boolean) => void;
}): DesktopModalsLayerProps {
	const {
		showWP,
		setShowWP,
		wallpaper,
		wallpaperHistory,
		handleWallpaperChange,
		handleRemoveUserWallpaper,
		openWallpaperFromDesktopSettings,
		showNF,
		setShowNF,
		onCloseNewFolder,
		handleCreateFolder,
		desktopWindowStyle,
		desktopIconStyle,
		showCommandPalette,
		setShowCommandPalette,
		displayItems,
		handleOpenWindow,
		handleCommandPaletteAction,
		showClipboard,
		setShowClipboard,
	} = params;

	return useMemo(
		() => ({
			showWallpaper: showWP,
			onCloseWallpaper: () => setShowWP(false),
			wallpaper,
			wallpaperHistory,
			onWallpaperChange: handleWallpaperChange,
			onRemoveUserWallpaper: handleRemoveUserWallpaper,
			onOpenWallpaperPicker: () => {
				openWallpaperFromDesktopSettings();
			},
			showNewFolder: showNF,
			onCloseNewFolder: onCloseNewFolder ?? (() => setShowNF(false)),
			onCreateFolder: handleCreateFolder,
			desktopWindowStyle,
			desktopIconStyle,
			showCommandPalette,
			onCloseCommandPalette: () => setShowCommandPalette(false),
			items: displayItems,
			onOpenItem: handleOpenWindow,
			onCommandAction: handleCommandPaletteAction,
			showClipboard,
			onCloseClipboard: () => setShowClipboard(false),
		}),
		[
			showWP,
			setShowWP,
			wallpaper,
			wallpaperHistory,
			handleWallpaperChange,
			handleRemoveUserWallpaper,
			openWallpaperFromDesktopSettings,
			showNF,
			setShowNF,
			onCloseNewFolder,
			handleCreateFolder,
			desktopWindowStyle,
			desktopIconStyle,
			showCommandPalette,
			setShowCommandPalette,
			displayItems,
			handleOpenWindow,
			handleCommandPaletteAction,
			showClipboard,
			setShowClipboard,
		]
	);
}
