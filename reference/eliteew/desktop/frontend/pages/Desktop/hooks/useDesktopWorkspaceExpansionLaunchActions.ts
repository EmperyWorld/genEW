/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Derived launch callbacks for workspace profiles, collections, content shortcuts and assistant context rails.
 *
 * Invariants:
 * - Behavior matches pre-T34 DesktopWorkspaceContent inline callbacks; no routing or auth changes.
 *
 * Related:
 * - DesktopWorkspaceContent.tsx · types/desktopWorkspaceExpansionLaunchActions.types.ts
 */

import { useCallback, useMemo } from 'react';
import { DEFAULT_APPS } from '../constants';
import type { DesktopContentShortcut } from '../types/desktopExpansion.types';
import type { DesktopItem } from '../types/desktop.types';
import {
	collectWorkspaceProfileLaunchItemIdsForMru,
	resolveWorkspaceProfileTargetDesktopId,
} from '../utils/desktopWorkspaceProfileLiveDisplay';
import { contentManagerFilterSnapshotFromShortcutTarget } from '../utils/contentManagerFilterShortcut';
import {
	buildAssistantLaunchFromExpansionAction,
	buildWindowContextGafOpenPayload,
	buildWindowContextSummarizePayload,
} from '../utils/desktopAssistantLaunchPayload';
import { CONTENT_MANAGER_WINDOW_PAYLOAD_RESET } from '../utils/desktopOpenPayloads';
import { resolveRecentFileOpenAction } from '../utils/openRecentFileOnDesktop';
import type {
	DesktopWorkspaceExpansionLaunchActions,
	DesktopWorkspaceExpansionLaunchActionsInput,
} from '../types/desktopWorkspaceExpansionLaunchActions.types';

export function useDesktopWorkspaceExpansionLaunchActions(
	input: DesktopWorkspaceExpansionLaunchActionsInput
): DesktopWorkspaceExpansionLaunchActions {
	const {
		items,
		installedApps,
		selected,
		activeDesktopId,
		activeDesktopWindow,
		windows,
		expansion,
		handleOpenWindow,
		openDesktopAppByComponent,
		switchToDesktop,
		updateDesktopWallpaper,
		recordRecentAppOnVirtualDesktop,
		addRecentFile,
		propertiesItem,
		setPropertiesItem,
		t,
	} = input;

	const openAppsByIds = useCallback(
		(appIds: readonly string[]) => {
			for (const appId of appIds.slice(0, 8)) {
				const app =
					installedApps.find((item) => item.id === appId) ??
					DEFAULT_APPS.find((item) => item.id === appId);
				if (app) {
					handleOpenWindow(app);
				}
			}
		},
		[handleOpenWindow, installedApps]
	);

	const openContentShortcutTarget = useCallback(
		(shortcut: DesktopContentShortcut) => {
			if (shortcut.type === 'saved-filter') {
				const snapshot = contentManagerFilterSnapshotFromShortcutTarget(
					shortcut.target
				);
				openDesktopAppByComponent('ContentManagerPro', {
					initialPayload: {
						...CONTENT_MANAGER_WINDOW_PAYLOAD_RESET,
						...(snapshot ? { contentManagerInitialFilter: snapshot } : {}),
					},
				});
				return;
			}
			const itemId = shortcut.target.itemId ?? shortcut.target.folderItemId;
			if (itemId) {
				const item = items.find((candidate) => candidate.id === itemId);
				if (item) {
					handleOpenWindow(item);
					return;
				}
			}
			const projectId = shortcut.target.projectId;
			const folderItemId = shortcut.target.contentManagerFolderItemId ?? itemId;
			openDesktopAppByComponent('ContentManagerPro', {
				initialPayload: {
					...CONTENT_MANAGER_WINDOW_PAYLOAD_RESET,
					contentManagerProjectId: projectId,
					contentManagerFolderItemId: folderItemId,
				},
			});
		},
		[handleOpenWindow, items, openDesktopAppByComponent]
	);

	const openWorkspaceProfile = useCallback(
		(profileId: string) => {
			const profile = expansion.workspaceProfiles.find(
				(item) => item.id === profileId
			);
			if (!profile) return;
			const targetDesktopId = profile.desktopId ?? activeDesktopId;
			if (profile.desktopId && profile.desktopId !== activeDesktopId) {
				switchToDesktop(profile.desktopId);
			}
			const profileWallpaper = profile.wallpaper?.trim();
			if (profileWallpaper) {
				updateDesktopWallpaper(targetDesktopId, profileWallpaper);
			}
			const vdForMru =
				resolveWorkspaceProfileTargetDesktopId(profile, activeDesktopId) ??
				activeDesktopId;
			if (vdForMru?.trim()) {
				for (const itemId of collectWorkspaceProfileLaunchItemIdsForMru(
					profile,
					installedApps,
					items
				)) {
					recordRecentAppOnVirtualDesktop(itemId, vdForMru);
				}
			}
			openAppsByIds(profile.appIds);
			for (const folderId of profile.folderItemIds.slice(0, 6)) {
				const folder = items.find((item) => item.id === folderId);
				if (folder) {
					handleOpenWindow(folder);
				}
			}
		},
		[
			activeDesktopId,
			expansion.workspaceProfiles,
			handleOpenWindow,
			items,
			installedApps,
			openAppsByIds,
			recordRecentAppOnVirtualDesktop,
			switchToDesktop,
			updateDesktopWallpaper,
		]
	);

	const openAppInWorkspaceProfile = useCallback(
		(app: DesktopItem, profileId: string) => {
			const profile = expansion.workspaceProfiles.find(
				(item) => item.id === profileId
			);
			if (!profile) return;
			const targetDesktopId = profile.desktopId ?? activeDesktopId;
			if (profile.desktopId && profile.desktopId !== activeDesktopId) {
				switchToDesktop(profile.desktopId);
			}
			const profileWallpaper = profile.wallpaper?.trim();
			if (profileWallpaper) {
				updateDesktopWallpaper(targetDesktopId, profileWallpaper);
			}
			handleOpenWindow(app);
		},
		[
			activeDesktopId,
			expansion.workspaceProfiles,
			handleOpenWindow,
			switchToDesktop,
			updateDesktopWallpaper,
		]
	);

	const openRecentDesktopFile = useCallback(
		(file: Parameters<typeof resolveRecentFileOpenAction>[0]) => {
			if (file.type !== 'project') {
				addRecentFile({ ...file, openedAt: new Date() });
			}
			const action = resolveRecentFileOpenAction(file, items);
			if (action) handleOpenWindow(action.item, action.options);
		},
		[addRecentFile, handleOpenWindow, items]
	);

	const openAppCollection = useCallback(
		(collectionId: string) => {
			const collection = expansion.appCollections.find(
				(item) => item.id === collectionId
			);
			if (collection) {
				openAppsByIds(collection.appIds);
			}
		},
		[expansion.appCollections, openAppsByIds]
	);

	const openContentShortcut = useCallback(
		(shortcutId: string) => {
			const shortcut = expansion.contentShortcuts.find(
				(item) => item.id === shortcutId
			);
			if (shortcut) {
				openContentShortcutTarget(shortcut);
			}
		},
		[expansion.contentShortcuts, openContentShortcutTarget]
	);

	const openAssistantContextAction = useCallback(
		(actionId: string) => {
			const action = expansion.assistantContextActions.find(
				(item) => item.id === actionId
			);
			if (!action?.enabled) return;
			const selectedOnRoot = items.filter(
				(i) => !i.parentId && selected.has(i.id)
			);
			const { target, payload } = buildAssistantLaunchFromExpansionAction({
				actionId: action.id,
				assistantTarget: action.assistantTarget,
				selectedItems: selectedOnRoot,
				activeWindow: activeDesktopWindow ?? undefined,
				t,
			});
			if (target === 'gaf') {
				openDesktopAppByComponent('GAFChatApp', { initialPayload: payload });
				return;
			}
			openDesktopAppByComponent('DesktopAiChatApp', {
				initialPayload: payload,
			});
		},
		[
			activeDesktopWindow,
			expansion.assistantContextActions,
			items,
			openDesktopAppByComponent,
			selected,
			t,
		]
	);

	const assistantPropertiesPanelActions = useMemo(() => {
		if (!propertiesItem) return [];
		return expansion.assistantContextActions.filter((a) => {
			if (!a.enabled) return false;
			if (a.id === 'explain-selection' || a.id === 'create-task') return true;
			if (a.id === 'send-to-gaf') return propertiesItem.type === 'file';
			return false;
		});
	}, [propertiesItem, expansion.assistantContextActions]);

	const onAssistantPropertiesPanelAction = useCallback(
		(actionId: string) => {
			const item = propertiesItem;
			if (!item) return;
			const action = expansion.assistantContextActions.find(
				(i) => i.id === actionId
			);
			if (!action?.enabled) return;
			const { target, payload } = buildAssistantLaunchFromExpansionAction({
				actionId: action.id,
				assistantTarget: action.assistantTarget,
				selectedItems: [item],
				activeWindow: activeDesktopWindow ?? undefined,
				t,
				allowAnyDesktopLocation: true,
			});
			if (target === 'gaf') {
				openDesktopAppByComponent('GAFChatApp', { initialPayload: payload });
			} else {
				openDesktopAppByComponent('DesktopAiChatApp', {
					initialPayload: payload,
				});
			}
			setPropertiesItem(null);
		},
		[
			propertiesItem,
			expansion.assistantContextActions,
			activeDesktopWindow,
			t,
			openDesktopAppByComponent,
			setPropertiesItem,
		]
	);

	const openGafChatBySession = useCallback(
		(chatId: string) => {
			const id = chatId.trim();
			if (!id) return;
			openDesktopAppByComponent('GAFChatApp', {
				initialPayload: { targetChatId: id },
			});
		},
		[openDesktopAppByComponent]
	);

	const assistantWindowContextSummarizeEnabled = useMemo(
		() =>
			expansion.assistantContextActions.some(
				(a) => a.enabled && a.id === 'summarize-window'
			),
		[expansion.assistantContextActions]
	);

	const assistantWindowContextGafEnabled = useMemo(
		() =>
			expansion.assistantContextActions.some(
				(a) => a.enabled && a.id === 'send-to-gaf'
			),
		[expansion.assistantContextActions]
	);

	const onWindowContextAssistantSummarize = useCallback(
		(windowId: string) => {
			const win = windows.find((w) => w.id === windowId);
			if (!win) return;
			openDesktopAppByComponent('DesktopAiChatApp', {
				initialPayload: buildWindowContextSummarizePayload(win, t),
			});
		},
		[openDesktopAppByComponent, t, windows]
	);

	const onWindowContextAssistantShareGaf = useCallback(
		(windowId: string) => {
			const win = windows.find((w) => w.id === windowId);
			if (!win) return;
			openDesktopAppByComponent('GAFChatApp', {
				initialPayload: buildWindowContextGafOpenPayload(win, t),
			});
		},
		[openDesktopAppByComponent, t, windows]
	);

	return {
		openWorkspaceProfile,
		openAppInWorkspaceProfile,
		openRecentDesktopFile,
		openAppCollection,
		openContentShortcut,
		openAssistantContextAction,
		assistantPropertiesPanelActions,
		onAssistantPropertiesPanelAction,
		openGafChatBySession,
		assistantWindowContextSummarizeEnabled,
		assistantWindowContextGafEnabled,
		onWindowContextAssistantSummarize,
		onWindowContextAssistantShareGaf,
	};
}
