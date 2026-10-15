import { useEffect } from 'react';
import { DEFAULT_APPS } from '../constants';
import type { DesktopItem, WindowState } from '../types/desktop.types';

interface UseDesktopVoiceCommandsParams {
	items: DesktopItem[];
	/** Все окна (в т.ч. другие столы) — для закрытия StudioGU при смене приложения */
	windows: WindowState[];
	/** Окна активного виртуального стола — цикл фокуса */
	currentDesktopWindows: WindowState[];
	activeWindowId: string | null;
	focusWindow: (windowId: string) => void;
	handleOpenWindow: (item: DesktopItem) => void;
	setShowNF: (value: boolean) => void;
	minimizeAllWindows: () => void;
	closeWindow: (windowId: string) => void;
	closeActiveWindow: () => void;
	openCommandPalette: () => void;
}

export function useDesktopVoiceCommands({
	items,
	windows,
	currentDesktopWindows,
	activeWindowId,
	focusWindow,
	handleOpenWindow,
	setShowNF,
	minimizeAllWindows,
	closeWindow,
	closeActiveWindow,
	openCommandPalette,
}: UseDesktopVoiceCommandsParams) {
	useEffect(() => {
		const handleVoiceCommand = (
			e: CustomEvent<{
				action: string;
				app?: string;
				commandId?: string;
				params?: Record<string, string>;
			}>
		) => {
			const { action, app, commandId } = e.detail;

			switch (action) {
				case 'app_command':
					break;
				case 'open_app': {
					if (!app) break;

					const appItemFromItems = items.find(
						(item) => item.appComponent === app
					);
					const appItemFromDefaults = DEFAULT_APPS.find(
						(defaultApp) => defaultApp.appComponent === app
					);
					const appItem = appItemFromItems ?? appItemFromDefaults;
					if (!appItem) break;

					handleOpenWindow(appItem);

					// Покидаем голосовую оболочку при открытии другого приложения;
					// Студию ГУ открываем/фокусируем без закрытия её же окон.
					if (app !== 'StudioGU') {
						windows
							.filter((windowState) => windowState.appComponent === 'StudioGU')
							.forEach((windowState) => {
								closeWindow(windowState.id);
							});
					}
					break;
				}
				case 'create_folder':
					setShowNF(true);
					break;
				case 'minimize_all':
				case 'show_desktop':
					minimizeAllWindows();
					break;
				case 'close_window':
					closeActiveWindow();
					break;
				case 'focus_next_window': {
					if (currentDesktopWindows.length === 0) break;
					const idx = currentDesktopWindows.findIndex(
						(w) => w.id === activeWindowId
					);
					const nextIdx = (idx + 1) % currentDesktopWindows.length;
					focusWindow(currentDesktopWindows[nextIdx]?.id);
					break;
				}
				case 'focus_previous_window': {
					if (currentDesktopWindows.length === 0) break;
					const idx = currentDesktopWindows.findIndex(
						(w) => w.id === activeWindowId
					);
					const nextIdx =
						(idx - 1 + currentDesktopWindows.length) %
						currentDesktopWindows.length;
					focusWindow(currentDesktopWindows[nextIdx]?.id);
					break;
				}
				case 'open_command_palette':
					openCommandPalette();
					break;
				case 'undo_reversible':
					if (commandId?.startsWith('open_')) {
						closeActiveWindow();
					}
					break;
			}
		};

		window.addEventListener(
			'desktop-command',
			handleVoiceCommand as EventListener
		);
		return () =>
			window.removeEventListener(
				'desktop-command',
				handleVoiceCommand as EventListener
			);
	}, [
		activeWindowId,
		closeActiveWindow,
		closeWindow,
		currentDesktopWindows,
		focusWindow,
		handleOpenWindow,
		items,
		minimizeAllWindows,
		openCommandPalette,
		setShowNF,
		windows,
	]);
}
