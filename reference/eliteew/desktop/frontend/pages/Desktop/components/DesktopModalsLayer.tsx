/**
 * Desktop Modals Layer – feature section for all overlay modals and dialogs.
 * Context menu (EnhancedContextMenu on canvas), wallpaper, new folder, command palette, clipboard.
 *
 * Escape: each child modal owns capture Escape via `useShellCaptureEscape` (no layer-wide listener).
 *
 * Выравнивание оболочек (Wave 14 / T8+): Command Palette — `ModalAdvanced` desktop +
 * `getDesktopShellPanelClassName` / `getDesktopShellHeaderStripClassName`; New Folder —
 * `ModalAdvanced` desktop; App Store — отдельный dialog, корень панели через
 * `getDesktopShellPanelClassName` (см. `AppStore` / `DesktopWorkspaceAppStoreLayer`).
 * Затемнение под модалками: {@link DESKTOP_OVERLAY.backdrop} в `constants` — то же, что scrim у `ModalAdvanced` variant desktop.
 * Виджеты рабочего стола (floating clock/KPI и т.д.) — `DesktopWorkspaceFloatingWidget`, не отдельный `WidgetsPanel.tsx`.
 */

import { AnimatePresence } from 'framer-motion';
import * as React from 'react';
import { Suspense, lazy } from 'react';
const WallpaperPickerLazy = lazy(() => import('./WallpaperPicker'));
const ClipboardManagerLazy = lazy(() => import('./ClipboardManager'));
const CommandPaletteLazy = lazy(() =>
	import('./CommandPalette').then((m) => ({ default: m.CommandPalette }))
);
const NewFolderDialogLazy = lazy(() =>
	import('./NewFolderDialog').then((m) => ({ default: m.NewFolderDialog }))
);
import type { DesktopItem } from '../types/desktop.types';
import type { DesktopIconStyle, DesktopWindowStyle } from '@/types/profile';
import { DesktopModalSuspenseFallback } from './DesktopModalSuspenseFallback';

export type { AccentColorId } from '../context/DesktopStateContext';

export interface DesktopModalsLayerProps {
	/** Wallpaper */
	showWallpaper: boolean;
	onCloseWallpaper: () => void;
	wallpaper: string;
	/** History of all wallpapers for this user from DB. */
	wallpaperHistory?: string[];
	onWallpaperChange: (value: string) => void;
	/** Удалить пользовательский фон (data URL и т.д.) из истории и при необходимости сбросить текущий. */
	onRemoveUserWallpaper?: (style: string) => void;
	onOpenWallpaperPicker: () => void;

	/** New folder */
	showNewFolder: boolean;
	onCloseNewFolder: () => void;
	onCreateFolder: (name: string, iconId: string) => void | Promise<void>;

	/** Стиль окон оболочки: обои, палитра команд, буфер */
	desktopWindowStyle: DesktopWindowStyle;
	/** Иконки рабочего стола / command palette (DesktopAppBadge). */
	desktopIconStyle: DesktopIconStyle;

	/** Command palette */
	showCommandPalette: boolean;
	onCloseCommandPalette: () => void;
	items: DesktopItem[];
	onOpenItem: (item: DesktopItem) => void;
	onCommandAction: (action: string) => void;

	/** Widget modals */
	showClipboard: boolean;
	onCloseClipboard: () => void;
}

export const DesktopModalsLayer: React.FC<DesktopModalsLayerProps> = (
	props
) => {
	const {
		showWallpaper,
		onCloseWallpaper,
		wallpaper,
		wallpaperHistory,
		onWallpaperChange,
		onRemoveUserWallpaper,
		onOpenWallpaperPicker: _onOpenWallpaperPicker,
		showNewFolder,
		onCloseNewFolder,
		onCreateFolder,
		desktopWindowStyle,
		desktopIconStyle,
		showCommandPalette,
		onCloseCommandPalette,
		items,
		onOpenItem,
		onCommandAction,
		showClipboard,
		onCloseClipboard,
	} = props;

	return (
		<>
			<AnimatePresence>
				{showWallpaper ? (
					<Suspense fallback={<DesktopModalSuspenseFallback />}>
						<WallpaperPickerLazy
							isOpen
							onClose={onCloseWallpaper}
							current={wallpaper}
							history={wallpaperHistory}
							onSelect={onWallpaperChange}
							onRemoveUserWallpaper={onRemoveUserWallpaper}
							shellWindowStyle={desktopWindowStyle}
						/>
					</Suspense>
				) : null}
			</AnimatePresence>

			{showNewFolder ? (
				<Suspense fallback={<DesktopModalSuspenseFallback />}>
					<AnimatePresence>
						<NewFolderDialogLazy
							isOpen
							onClose={onCloseNewFolder}
							onCreate={onCreateFolder}
						/>
					</AnimatePresence>
				</Suspense>
			) : null}

			{showCommandPalette ? (
				<Suspense fallback={<DesktopModalSuspenseFallback />}>
					<CommandPaletteLazy
						isOpen
						onClose={onCloseCommandPalette}
						items={items}
						onOpenItem={onOpenItem}
						onAction={onCommandAction}
						shellWindowStyle={desktopWindowStyle}
						iconStyle={desktopIconStyle}
					/>
				</Suspense>
			) : null}

			<Suspense
				fallback={showClipboard ? <DesktopModalSuspenseFallback /> : null}
			>
				<ClipboardManagerLazy
					isOpen={showClipboard}
					onClose={onCloseClipboard}
					shellWindowStyle={desktopWindowStyle}
				/>
			</Suspense>
		</>
	);
};

DesktopModalsLayer.displayName = 'DesktopModalsLayer';
