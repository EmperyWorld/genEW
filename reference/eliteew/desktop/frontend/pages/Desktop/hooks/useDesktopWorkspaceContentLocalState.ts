import { useCallback, useState } from 'react';
import type { DesktopControlCenterTab } from '../components/DesktopSettingsPanel';
import type { DesktopItem } from '../types/desktop.types';

export type DesktopWorkspaceWindowContextMenuState = {
	windowId: string;
	x: number;
	y: number;
} | null;

export function useDesktopWorkspaceContentLocalState() {
	const [desktopSettingsActiveTab, setDesktopSettingsActiveTab] =
		useState<DesktopControlCenterTab>('personalize');

	const [notificationCenterOpenNonce, setNotificationCenterOpenNonce] =
		useState(0);
	const bumpNotificationCenterOpen = useCallback(
		() => setNotificationCenterOpenNonce((n) => n + 1),
		[]
	);

	const [activeDropTargetFolderId, setActiveDropTargetFolderId] = useState<
		string | null
	>(null);

	const [propertiesItem, setPropertiesItem] = useState<DesktopItem | null>(
		null
	);

	const [windowContextMenu, setWindowContextMenu] =
		useState<DesktopWorkspaceWindowContextMenuState>(null);

	return {
		desktopSettingsActiveTab,
		setDesktopSettingsActiveTab,
		notificationCenterOpenNonce,
		bumpNotificationCenterOpen,
		activeDropTargetFolderId,
		setActiveDropTargetFolderId,
		propertiesItem,
		setPropertiesItem,
		windowContextMenu,
		setWindowContextMenu,
	};
}
