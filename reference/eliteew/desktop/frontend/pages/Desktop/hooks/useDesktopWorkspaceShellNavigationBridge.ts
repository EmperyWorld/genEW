/**
 * openWindowRef + UGS opener + onNavigate + stable openVoiceCommandCenter.
 * Refs so openVoiceCommandCenter stays stable and does not change on every items/openWindow update.
 * When it changed every re-render (drag, open app), context updated → consumers re-rendered → could trigger unwanted opens.
 * Use handleOpenWindow so Content Manager merges cabinet payload reset on every launch path.
 */

import { useCallback, useRef, type RefObject } from 'react';
import type { PageType } from '../../../hooks/useAppState';
import { findVoiceCommandLauncherItem } from '../utils/desktopOpenPayloads';
import type { DesktopItem } from '../types/desktop.types';
import { useDesktopShellOnNavigate } from './useDesktopShellOnNavigate';
import { useDesktopUgsOpenWindow } from './useDesktopUgsOpenWindow';
import type { OpenWindowOptions } from './useWindowManager';

export function useDesktopWorkspaceShellNavigationBridge(params: {
	handleOpenWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
	itemsRef: RefObject<DesktopItem[]>;
	canOpenUnifiedAdmin: boolean;
	setCurrentPage: (page: PageType) => void;
}) {
	const { handleOpenWindow, itemsRef, canOpenUnifiedAdmin, setCurrentPage } =
		params;

	const openWindowRef = useRef(handleOpenWindow);
	openWindowRef.current = handleOpenWindow;

	const openUgsDesktopApp = useDesktopUgsOpenWindow({
		itemsRef,
		canOpenUnifiedAdmin,
		handleOpenWindow,
	});

	const onNavigate = useDesktopShellOnNavigate({
		itemsRef,
		openWindowRef,
		openUgsDesktopApp,
		setCurrentPage,
	});

	const openVoiceCommandCenter = useCallback(() => {
		const voiceApp = findVoiceCommandLauncherItem(itemsRef.current);
		if (voiceApp) openWindowRef.current(voiceApp);
	}, [itemsRef.current]);

	return {
		openWindowRef,
		openUgsDesktopApp,
		onNavigate,
		openVoiceCommandCenter,
	};
}
