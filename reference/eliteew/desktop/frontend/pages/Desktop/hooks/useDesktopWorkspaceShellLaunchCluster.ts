/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shell launch helpers for app store routing, app window launch, and pin/unpin toasts in Безраздельный мир.
 *
 * Invariants:
 * - Route ids remain `desktop` / `desktop/store`; only visible copy uses product terminology.
 * - System apps cannot be unpinned through Start menu actions.
 *
 * Related:
 * - `components/StartMenu.tsx`
 * - `hooks/useDesktopAppLifecycle.ts`
 */

import { useCallback, useEffect, useMemo } from 'react';
import type { PageType, ShellPageType } from '../../../appState/types';
import { syncLocationHashToPage } from '../../../utils/pageRouting';
import { DEFAULT_APPS } from '../constants';
import type { DesktopItem } from '../types/desktop.types';
import { isSystemDesktopApp } from '../utils/desktopAppRegistry';
import { parseDesktopStoreAppIdFromHashFragment } from '../utils/desktopStoreHash';
import { getDesktopAppIconNode } from '../utils/desktopVisualSystem';
import { notify as toast } from '@/notifications';
import type { PinAppToDesktopResult } from './useDesktopAppLifecycle';

export function useDesktopWorkspaceShellLaunchCluster(params: {
	items: DesktopItem[];
	handleOpenWindow: (item: DesktopItem) => void;
	openAppStore: (id: string | null) => void;
	pinAppShortcutToDesktop: (app: DesktopItem) => PinAppToDesktopResult;
	deleteItem: (itemId: string) => Promise<unknown>;
	currentPage: ShellPageType;
	setCurrentPage: (page: PageType) => void;
}) {
	const {
		items,
		handleOpenWindow,
		openAppStore,
		pinAppShortcutToDesktop,
		deleteItem,
		currentPage,
		setCurrentPage,
	} = params;

	const unifiedAdminDesktopItem = useMemo((): DesktopItem => {
		return {
			id: 'app-unified-admin',
			name: 'Админ-панель',
			type: 'app',
			color: 'text-violet-400',
			gradient: 'from-violet-600 to-purple-900',
			position: { x: 72, y: 72 },
			appComponent: 'UnifiedAdminApp',
			icon: getDesktopAppIconNode('UnifiedAdminApp'),
			description: 'Единая админ-панель',
			isPinned: false,
		};
	}, []);

	useEffect(() => {
		if (currentPage !== 'desktop/store') return;
		const id = parseDesktopStoreAppIdFromHashFragment(
			typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
		);
		openAppStore(id);
		setCurrentPage('desktop');
		syncLocationHashToPage('desktop');
	}, [currentPage, openAppStore, setCurrentPage]);

	const handlePinAppFromStartMenu = useCallback(
		(app: DesktopItem) => {
			const result = pinAppShortcutToDesktop(app);
			switch (result) {
				case 'ok':
					toast.success(
						'Безраздельный мир',
						`«${app.name}» вынесено в Безраздельный мир`
					);
					break;
				case 'already':
					toast.info(
						'Безраздельный мир',
						'Ярлык уже есть в Безраздельном мире'
					);
					break;
				case 'not_installed':
					toast.error(
						'Безраздельный мир',
						`Сначала установите «${app.name}» в магазине приложений`
					);
					break;
				default:
					break;
			}
		},
		[pinAppShortcutToDesktop]
	);

	const openAppStoreAsWindow = useCallback(() => {
		const appStoreItem =
			items.find((i) => i.appComponent === 'AppStore') ??
			DEFAULT_APPS.find((a) => a.appComponent === 'AppStore');
		if (appStoreItem) {
			handleOpenWindow(appStoreItem);
		} else {
			openAppStore(null);
		}
	}, [items, handleOpenWindow, openAppStore]);

	const handleUnpinAppFromStartMenu = useCallback(
		(app: DesktopItem) => {
			if (app.type !== 'app' || isSystemDesktopApp(app)) {
				return;
			}
			const row = items.find(
				(i) => i.type === 'app' && i.id === app.id && !i.parentId
			);
			if (!row) {
				toast.info('Безраздельный мир', 'Ярлыка нет в Безраздельном мире');
				return;
			}
			void deleteItem(row.id);
			toast.success(
				'Безраздельный мир',
				`«${app.name}» убрано из Безраздельного мира`
			);
		},
		[deleteItem, items]
	);

	return {
		unifiedAdminDesktopItem,
		handlePinAppFromStartMenu,
		handleUnpinAppFromStartMenu,
		openAppStoreAsWindow,
	};
}
