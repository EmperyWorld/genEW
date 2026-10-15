/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Context-menu and shared desktop actions; command palette reuses this hook for overlapping cases.
 *
 * Invariants:
 * - Social Hub context launches keep typed tab names aligned with `WindowInitialPayload`.
 * - File/item actions delegate to specialized helpers rather than mutating state inline.
 *
 * Related:
 * - useDesktopWorkspaceAppLaunch.ts
 */

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { clampDesktopUiScale } from '../utils/desktopUiScale';
import { requestPlayInMusicPlayer } from '../utils/desktopDeepLink';
import {
	compareDesktopRootByDateDesc,
	compareDesktopRootByGridPosition,
	compareDesktopRootByName,
	compareDesktopRootByPinnedThenName,
	compareDesktopRootByTypeThenFileSizeDesc,
	compareDesktopRootByTypeThenName,
	layoutRootIconsOnGrid,
} from '../utils/desktopRootSort';
import { notify as toast } from '@/notifications';
import { contentApi } from '@/services/contentApi';
import type { DesktopControlCenterTab } from '../components/DesktopSettingsPanel';
import type {
	ContextMenuState,
	DesktopConfig,
	DesktopItem,
	WindowState,
} from '../types/desktop.types';
import { parseProjectIdFromDesktopFolderItemId } from '@/pages/ContentManager/projectDesktopFolder';
import { isSystemDesktopApp } from '../utils/desktopAppRegistry';
import {
	canMoveDesktopItemIntoFolder,
	isDesktopSystemFolder,
} from '../utils/desktopItemTree';
import { CONTENT_MANAGER_WINDOW_PAYLOAD_RESET } from '../utils/desktopOpenPayloads';
import type { OpenWindowOptions } from './useWindowManager';
import type { UseDesktopWorkspaceAppLaunchReturn } from './useDesktopWorkspaceAppLaunch';
import type { GridStepPreference } from '../constants';
import {
	buildDuplicateWindowOpenOptions,
	resolveDesktopItemForWindow,
} from '../utils/desktopWindowDuplicate';

function coerceGridStep(
	step: string | undefined
): GridStepPreference | undefined {
	if (step === 'small' || step === 'medium' || step === 'large') return step;
	return undefined;
}

export interface UseDesktopWorkspaceHandleActionParams {
	ctx: ContextMenuState;
	items: DesktopItem[];
	selected: Set<string>;
	gridStep: string | undefined;
	snapToGridEffective: boolean;
	setShowNF: (open: boolean) => void;
	openAppStoreAsWindow: () => void;
	setShowSessionInfoPanel: (open: boolean) => void;
	openSocialHubTab: (
		tab?: 'overview' | 'friends' | 'profile' | 'mobile-app'
	) => DesktopItem | undefined;
	openShellSettings: (tab?: DesktopControlCenterTab) => void;
	handleOpenWindow: (item: DesktopItem, opts?: OpenWindowOptions) => void;
	commitItems: (next: DesktopItem[]) => void;
	setSelected: Dispatch<SetStateAction<Set<string>>>;
	performWorkspaceRefresh: () => void;
	setPropertiesItem: (item: DesktopItem | null) => void;
	setRenamingId: (id: string | null) => void;
	copyItems: (sel: DesktopItem[]) => void;
	cutItems: (sel: DesktopItem[]) => void;
	pasteClipboard: () => void;
	updateConfig: (patch: Partial<DesktopConfig>) => Promise<void>;
	activeDesktopWindow: WindowState | null | undefined;
	minimizeWindow: (id: string) => void;
	maximizeWindow: (id: string) => void;
	closeWindow: (id: string) => void;
	toggleWindowAlwaysOnTop: (id: string) => void;
	updateDesktopVisualPreferences: (patch: {
		desktop_ui_scale: number;
	}) => undefined | Promise<unknown>;
	openDesktopAppByComponent: UseDesktopWorkspaceAppLaunchReturn['openDesktopAppByComponent'];
	createMarkdownFile: (options?: {
		parentId?: string;
	}) => Promise<{ contentId: string; item: DesktopItem } | null>;
	openEditFolderIconDialog?: (item: DesktopItem) => void;
}

export function useDesktopWorkspaceHandleAction(
	params: UseDesktopWorkspaceHandleActionParams
): (action: string) => void {
	const { t } = useTranslation('desktopUi');
	const {
		ctx,
		items,
		selected,
		gridStep,
		snapToGridEffective,
		setShowNF,
		openAppStoreAsWindow,
		setShowSessionInfoPanel,
		openSocialHubTab,
		openShellSettings,
		handleOpenWindow,
		commitItems,
		setSelected,
		performWorkspaceRefresh,
		setPropertiesItem,
		setRenamingId,
		copyItems,
		cutItems,
		pasteClipboard,
		updateConfig,
		activeDesktopWindow,
		minimizeWindow,
		maximizeWindow,
		closeWindow,
		toggleWindowAlwaysOnTop,
		updateDesktopVisualPreferences,
		openDesktopAppByComponent,
		createMarkdownFile,
		openEditFolderIconDialog,
	} = params;

	return useCallback(
		(action: string) => {
			switch (action) {
				case 'new-folder':
					setShowNF(true);
					break;
				case 'new-markdown-file':
					void (async () => {
						const created = await createMarkdownFile();
						if (!created) return;
						openDesktopAppByComponent('DocEditor', {
							initialPayload: { unifiedContentId: created.contentId },
						});
						toast.success(
							t('storage.createMarkdownSuccessTitle'),
							t('storage.createMarkdownSuccessBody', {
								name: created.item.name,
							})
						);
					})();
					break;
				case 'app-store': {
					openAppStoreAsWindow();
					break;
				}
				case 'session-info': {
					setShowSessionInfoPanel(true);
					break;
				}
				case 'profile': {
					openSocialHubTab('profile');
					break;
				}
				case 'settings':
					openShellSettings('personalize');
					break;
				case 'settings-personalize':
					openShellSettings('personalize');
					break;
				case 'settings-icons':
					openShellSettings('icons');
					break;
				case 'settings-chrome':
					openShellSettings('chrome');
					break;
				case 'settings-shell':
					openShellSettings('shell');
					break;
				case 'settings-performance':
					openShellSettings('performance');
					break;
				case 'reflow-icons-to-grid': {
					const rootItems = items.filter((i) => !i.parentId);
					const nestedItems = items.filter((i) => i.parentId);
					const ordered = [...rootItems].sort(compareDesktopRootByGridPosition);
					const laidOut = layoutRootIconsOnGrid(
						ordered,
						coerceGridStep(gridStep)
					);
					commitItems([...laidOut, ...nestedItems]);
					break;
				}
				case 'play-in-music-player':
					if (ctx.targetItem?.type === 'file') {
						requestPlayInMusicPlayer({
							id: ctx.targetItem.id,
							name: ctx.targetItem.name,
							thumbnail_url: null,
							source_surface: 'desktop-widget',
						});
					}
					break;
				case 'send-to-gaf-chat':
					if (ctx.targetItem?.type === 'file') {
						const id = ctx.targetItem.id?.trim();
						if (id) {
							openDesktopAppByComponent('GAFChatApp', {
								initialPayload: {
									gafComposerAttachmentContentId: id,
									gafComposerAttachmentFileName: ctx.targetItem.name,
									gafComposerAttachmentMimeType:
										ctx.targetItem.fileType ?? null,
									gafComposerAttachmentSize:
										typeof ctx.targetItem.size === 'number'
											? ctx.targetItem.size
											: null,
								},
							});
						}
					}
					break;
				case 'send-to-desktop-ai':
					if (ctx.targetItem?.type === 'file') {
						const cid = ctx.targetItem.id?.trim();
						if (cid) {
							openDesktopAppByComponent('DesktopAiChatApp', {
								initialPayload: {
									desktopAiAttachContentId: cid,
									desktopAiAttachSourceLabel: ctx.targetItem.name ?? null,
								},
							});
						}
					}
					break;
				case 'open-in-doc-editor':
					if (ctx.targetItem?.type === 'file') {
						openDesktopAppByComponent('DocEditor', {
							initialPayload: {
								unifiedContentId: ctx.targetItem.id,
							},
						});
					}
					break;
				case 'open-in-content-manager': {
					const t = ctx.targetItem;
					if (t && (t.type === 'file' || t.type === 'folder') && t.id?.trim()) {
						const id = t.id.trim();
						if (t.type === 'folder') {
							const projectId = parseProjectIdFromDesktopFolderItemId(id);
							if (projectId) {
								openDesktopAppByComponent('ContentManagerPro', {
									initialPayload: {
										...CONTENT_MANAGER_WINDOW_PAYLOAD_RESET,
										contentManagerProjectId: projectId,
										contentManagerProjectName: t.name?.trim() || undefined,
									},
								});
								break;
							}
						}
						openDesktopAppByComponent('ContentManagerPro', {
							initialPayload: {
								...CONTENT_MANAGER_WINDOW_PAYLOAD_RESET,
								contentManagerFolderItemId: id,
							},
						});
					}
					break;
				}
				case 'assign-content-to-project': {
					const t = ctx.targetItem;
					if (t?.type !== 'file' || !t.id?.trim()) break;
					openDesktopAppByComponent('ContentManagerPro', {
						initialPayload: {
							...CONTENT_MANAGER_WINDOW_PAYLOAD_RESET,
							contentManagerFocusUnifiedContentId: t.id.trim(),
							contentManagerOpenAssignProject: true,
						},
					});
					break;
				}
				case 'open':
					if (ctx.targetItem) handleOpenWindow(ctx.targetItem);
					break;
				case 'open-new':
					if (ctx.targetItem)
						handleOpenWindow(ctx.targetItem, { forceNew: true });
					break;
				case 'delete': {
					const toDeleteBase = ctx.targetItem
						? isSystemDesktopApp(ctx.targetItem)
							? []
							: [ctx.targetItem]
						: items.filter((i) => selected.has(i.id) && !isSystemDesktopApp(i));
					if (toDeleteBase.length === 0) break;
					const ids = new Set(toDeleteBase.map((i) => i.id));
					let added = true;
					while (added) {
						added = false;
						for (const item of items) {
							if (
								item.parentId &&
								ids.has(item.parentId) &&
								!ids.has(item.id)
							) {
								ids.add(item.id);
								added = true;
							}
						}
					}
					const newItems = items.filter((i) => !ids.has(i.id));
					commitItems(newItems);
					setSelected((prev) => {
						const n = new Set(prev);
						ids.forEach((id) => {
							n.delete(id);
						});
						return n;
					});
					break;
				}
				case 'pin': {
					const toToggle = ctx.targetItem
						? [ctx.targetItem]
						: items.filter((i) => selected.has(i.id));
					if (toToggle.length === 0) break;
					const newPinned = !toToggle[0].isPinned;
					const newItems = items.map((i) =>
						toToggle.some((t) => t.id === i.id)
							? { ...i, isPinned: newPinned }
							: i
					);
					commitItems(newItems);
					break;
				}
				case 'move-selected-here': {
					if (ctx.targetItem?.type !== 'folder') break;
					const moveTargetFolder = ctx.targetItem;
					const toMove = items
						.filter((i) => selected.has(i.id))
						.filter((i) =>
							canMoveDesktopItemIntoFolder(items, i, moveTargetFolder)
						)
						.map((i) => i.id);
					if (toMove.length === 0) break;
					const next = items.map((i) =>
						toMove.includes(i.id) ? { ...i, parentId: moveTargetFolder.id } : i
					);
					commitItems(next);
					setSelected(new Set());
					break;
				}
				case 'move-to-desktop-root': {
					const toLift = (
						ctx.targetItem
							? [ctx.targetItem]
							: items.filter((i) => selected.has(i.id))
					)
						.filter((i) => i.parentId)
						.map((i) => i.id);
					if (toLift.length === 0) break;
					const next = items.map((i) =>
						toLift.includes(i.id) ? { ...i, parentId: undefined } : i
					);
					commitItems(next);
					setSelected(new Set());
					break;
				}
				case 'refresh': {
					performWorkspaceRefresh();
					break;
				}
				case 'sort-name':
				case 'auto-arrange':
				case 'sort-by-name': {
					const rootItems = items.filter((i) => !i.parentId);
					const nestedItems = items.filter((i) => i.parentId);
					const sortedRoot = layoutRootIconsOnGrid(
						[...rootItems].sort(compareDesktopRootByName),
						coerceGridStep(gridStep)
					);
					commitItems([...sortedRoot, ...nestedItems]);
					break;
				}
				case 'sort-date':
				case 'sort-by-date': {
					const rootItems = items.filter((i) => !i.parentId);
					const nestedItems = items.filter((i) => i.parentId);
					const sortedRoot = layoutRootIconsOnGrid(
						[...rootItems].sort(compareDesktopRootByDateDesc),
						coerceGridStep(gridStep)
					);
					commitItems([...sortedRoot, ...nestedItems]);
					break;
				}
				case 'sort-size': {
					const rootItems = items.filter((i) => !i.parentId);
					const nestedItems = items.filter((i) => i.parentId);
					const sortedRoot = layoutRootIconsOnGrid(
						[...rootItems].sort(compareDesktopRootByTypeThenFileSizeDesc),
						coerceGridStep(gridStep)
					);
					commitItems([...sortedRoot, ...nestedItems]);
					break;
				}
				case 'sort-by-type':
				case 'group-by-type': {
					const rootItems = items.filter((i) => !i.parentId);
					const nestedItems = items.filter((i) => i.parentId);
					const sortedRoot = layoutRootIconsOnGrid(
						[...rootItems].sort(compareDesktopRootByTypeThenName),
						coerceGridStep(gridStep)
					);
					commitItems([...sortedRoot, ...nestedItems]);
					break;
				}
				case 'sort-by-pinned': {
					const rootItems = items.filter((i) => !i.parentId);
					const nestedItems = items.filter((i) => i.parentId);
					const sortedRoot = layoutRootIconsOnGrid(
						[...rootItems].sort(compareDesktopRootByPinnedThenName),
						coerceGridStep(gridStep)
					);
					commitItems([...sortedRoot, ...nestedItems]);
					break;
				}
				case 'properties':
					if (ctx.targetItem) setPropertiesItem(ctx.targetItem);
					break;
				case 'edit':
				case 'rename':
					if (ctx.targetItem) setRenamingId(ctx.targetItem.id);
					break;
				case 'change-icon':
					if (
						ctx.targetItem &&
						ctx.targetItem.type === 'folder' &&
						!isDesktopSystemFolder(ctx.targetItem)
					) {
						openEditFolderIconDialog?.(ctx.targetItem);
					}
					break;
				case 'copy': {
					const sel = ctx.targetItem
						? [ctx.targetItem]
						: items.filter((i) => selected.has(i.id));
					copyItems(sel);
					break;
				}
				case 'cut': {
					const sel = ctx.targetItem
						? [ctx.targetItem]
						: items.filter((i) => selected.has(i.id));
					cutItems(sel);
					break;
				}
				case 'paste':
					pasteClipboard();
					break;
				case 'info':
					if (ctx.targetItem) setPropertiesItem(ctx.targetItem);
					break;
				case 'download': {
					const file = ctx.targetItem;
					if (file?.type !== 'file' || !file.id.trim()) break;
					void contentApi
						.downloadContent(file.id.trim(), file.name?.trim() || undefined)
						.catch(() => {
							toast.error(
								t('workspace.fileDownloadFailedTitle'),
								t('workspace.fileDownloadFailedBody')
							);
						});
					break;
				}
				case 'view-icon-large':
					updateConfig({ icon_size: 'large' }).catch(() => {});
					break;
				case 'view-icon-medium':
					updateConfig({ icon_size: 'medium' }).catch(() => {});
					break;
				case 'view-icon-small':
					updateConfig({ icon_size: 'small' }).catch(() => {});
					break;
				case 'view-snap-to-grid':
					updateConfig({
						snap_to_grid: !snapToGridEffective,
					}).catch(() => {});
					break;
				case 'minimize': {
					const topWindow = activeDesktopWindow;
					if (topWindow) minimizeWindow(topWindow.id);
					break;
				}
				case 'maximize': {
					const topWin = activeDesktopWindow;
					if (topWin) maximizeWindow(topWin.id);
					break;
				}
				case 'close': {
					const top = activeDesktopWindow;
					if (top) closeWindow(top.id);
					break;
				}
				case 'always-on-top': {
					const top = activeDesktopWindow;
					if (top) toggleWindowAlwaysOnTop(top.id);
					break;
				}
				case 'duplicate': {
					const top = activeDesktopWindow;
					if (!top) break;
					const item = resolveDesktopItemForWindow(top, items);
					if (!item) break;
					handleOpenWindow(item, buildDuplicateWindowOpenOptions(top));
					break;
				}
				default: {
					if (action.startsWith('ui-scale-')) {
						const pct = Number(action.slice('ui-scale-'.length));
						if (Number.isFinite(pct)) {
							void updateDesktopVisualPreferences({
								desktop_ui_scale: clampDesktopUiScale(pct / 100),
							});
						}
					}
					break;
				}
			}
		},
		[
			activeDesktopWindow,
			closeWindow,
			commitItems,
			copyItems,
			ctx.targetItem,
			cutItems,
			gridStep,
			handleOpenWindow,
			items,
			maximizeWindow,
			minimizeWindow,
			openAppStoreAsWindow,
			openShellSettings,
			openSocialHubTab,
			openDesktopAppByComponent,
			createMarkdownFile,
			openEditFolderIconDialog,
			pasteClipboard,
			performWorkspaceRefresh,
			selected,
			setPropertiesItem,
			setRenamingId,
			setSelected,
			setShowNF,
			setShowSessionInfoPanel,
			snapToGridEffective,
			t,
			toggleWindowAlwaysOnTop,
			updateConfig,
			updateDesktopVisualPreferences,
		]
	);
}
