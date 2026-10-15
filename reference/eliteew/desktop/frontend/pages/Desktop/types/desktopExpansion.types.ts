import type { DesktopAppCollectionTemplateId } from '../constants/desktopAppCollectionTemplates';
import type { CuratedWorkspaceLayoutTemplateId } from '../constants/desktopCuratedWorkspaceLayoutTemplates';
import type { DesktopScenarioWindowLayoutId } from '../constants/desktopScenarioWindowLayouts';
import type { DesktopWorkspaceProfileTemplateId } from '../constants/desktopWorkspaceProfileTemplates';
import type { SavedFilterContentShortcutFields } from '../utils/contentManagerFilterShortcut';
import type {
	DesktopIconStyle,
	DesktopTaskbarStyle,
	DesktopWindowStyle,
	DesktopWidgetsStyle,
} from '@/types/profile';
import type { PersistedWindowState } from './desktop.types';

export type DesktopExpansionStorageBucket =
	| 'desktop_config'
	| 'desktop_items'
	| 'profile_ui'
	| 'shell_state'
	| 'local_session';

export interface DesktopSettingsStorageMapRow {
	id: string;
	label: string;
	description: string;
	bucket: DesktopExpansionStorageBucket;
	fields: string[];
}

export interface DesktopWorkspaceProfile {
	id: string;
	name: string;
	description?: string;
	desktopId?: string;
	wallpaper?: string;
	appIds: string[];
	folderItemIds: string[];
	widgetIds: string[];
}

export interface DesktopWindowLayoutPreset {
	id: string;
	name: string;
	description?: string;
	windows: PersistedWindowState[];
	createdAt?: string;
}

export interface DesktopWidgetLayoutSlot {
	id: string;
	type:
		| 'notes'
		| 'todos'
		| 'favorites'
		| 'ewdesk'
		| 'notifications'
		| 'now-playing'
		| 'project-shortcuts'
		| 'recent-content';
	enabled: boolean;
	mode: 'compact' | 'expanded';
	position?: { x: number; y: number };
	workspaceProfileId?: string;
}

/** `stacked` — одна колонка у угла; `free` — слоты в координатах рабочей области (layout px). */
export type DesktopWidgetsSlotPlacement = 'stacked' | 'free';

export interface DesktopWidgetsLayout {
	slots: DesktopWidgetLayoutSlot[];
	perWorkspace: boolean;
	/** Сдвиг панели от якорного угла (px), кламп при отпускании указателя. */
	panelOffset?: { x: number; y: number };
	/** Режим раскладки слотов на столе. */
	slotPlacement?: DesktopWidgetsSlotPlacement;
}

export interface DesktopAppCollection {
	id: string;
	name: string;
	description?: string;
	appIds: string[];
	workspaceProfileId?: string;
}

export interface DesktopContentShortcut {
	id: string;
	label: string;
	type: 'project-folder' | 'saved-filter' | 'recent-content' | 'desktop-folder';
	target: Record<string, string>;
	workspaceProfileId?: string;
}

export interface DesktopAssistantContextAction {
	id: string;
	label: string;
	description?: string;
	source: 'selection' | 'window-toolbar' | 'context-menu' | 'properties-panel';
	assistantTarget: 'assistant' | 'gaf';
	enabled: boolean;
}

/** User-saved bundles in `shell_state.visual_style_presets` (Wave 8). */
export interface DesktopUserVisualStylePreset {
	id: string;
	name: string;
	theme: 'dark' | 'light' | 'auto';
	accentFollows: boolean;
	wallpaperIndex: number;
	wallpaperRef?: string;
	accent?: string;
	windowStyle: DesktopWindowStyle;
	taskbarStyle: DesktopTaskbarStyle;
	iconStyle: DesktopIconStyle;
	widgetsStyle: DesktopWidgetsStyle;
	desktopPanelOpacity?: number;
	desktopUiScale?: number;
	desktopSceneDepth?: DesktopSceneDepth;
	desktopFontBody?: import('@/types/profile').DesktopFontBodyId;
	desktopFontDisplay?: import('@/types/profile').DesktopFontDisplayId;
	desktopWallpaperCrossfadeEnabled?: boolean;
	desktopStyledTooltips?: boolean;
	createdAt?: string;
}

export interface DesktopExpansionSettingsState {
	storageMap: DesktopSettingsStorageMapRow[];
	workspaceProfiles: DesktopWorkspaceProfile[];
	/** Windows from last `shell_state.windows_snapshot` load (unfiltered). */
	savedSessionSnapshotWindowCount: number;
	windowLayoutPresets: DesktopWindowLayoutPreset[];
	widgetsLayout: DesktopWidgetsLayout;
	appCollections: DesktopAppCollection[];
	contentShortcuts: DesktopContentShortcut[];
	assistantContextActions: DesktopAssistantContextAction[];
	visualStylePresets: DesktopUserVisualStylePreset[];
	isLoading: boolean;
	isSaving: boolean;
	error: string | null;
}

export interface DesktopExpansionSettingsActions {
	addWorkspaceProfile: () => Promise<void>;
	addWorkspaceProfileFromOpenWindows: () => Promise<void>;
	addWorkspaceProfileFromTemplate: (
		templateId: DesktopWorkspaceProfileTemplateId
	) => Promise<void>;
	addWorkspaceProfileFromSessionSnapshot: () => Promise<void>;
	patchWorkspaceProfile: (
		profileId: string,
		patch: Partial<
			Pick<
				DesktopWorkspaceProfile,
				'name' | 'description' | 'desktopId' | 'wallpaper'
			>
		>
	) => Promise<void>;
	removeWorkspaceProfile: (profileId: string) => Promise<void>;
	addWindowLayoutPreset: () => Promise<void>;
	addWindowLayoutPresetFromCuratedTemplate: (
		templateId: CuratedWorkspaceLayoutTemplateId
	) => Promise<void>;
	addWindowLayoutPresetFromScenario: (
		scenarioId: DesktopScenarioWindowLayoutId
	) => Promise<void>;
	removeWindowLayoutPreset: (presetId: string) => Promise<void>;
	applyWindowLayoutPreset: (presetId: string) => void;
	applyCuratedWorkspaceLayout: (
		templateId: CuratedWorkspaceLayoutTemplateId
	) => void;
	applyScenarioWorkspaceLayout: (
		scenarioId: DesktopScenarioWindowLayoutId
	) => void;
	collectCurrentWorkspaceWindows: () => void;
	toggleWidgetSlot: (slotId: string) => Promise<void>;
	toggleWidgetSlotMode: (slotId: string) => Promise<void>;
	toggleWidgetsPerWorkspace: (enabled: boolean) => Promise<void>;
	reorderWidgetSlots: (fromIndex: number, toIndex: number) => Promise<void>;
	moveWidgetSlotStep: (
		slotId: string,
		direction: 'up' | 'down'
	) => Promise<void>;
	setWidgetSlotWorkspaceProfile: (
		slotId: string,
		workspaceProfileId: string | undefined
	) => Promise<void>;
	setWidgetsPanelOffset: (offset: { x: number; y: number }) => Promise<void>;
	setWidgetsSlotPlacement: (
		placement: DesktopWidgetsSlotPlacement
	) => Promise<void>;
	setWidgetSlotPosition: (
		slotId: string,
		position: { x: number; y: number }
	) => Promise<void>;
	nudgeAllWidgetSlotPositions: (delta: {
		x: number;
		y: number;
	}) => Promise<void>;
	ensureFreeWidgetSlotPositions: () => Promise<void>;
	addAppCollection: () => Promise<void>;
	addAppCollectionFromTemplate: (
		templateId: DesktopAppCollectionTemplateId
	) => Promise<void>;
	removeAppCollection: (collectionId: string) => Promise<void>;
	addContentShortcut: () => Promise<void>;
	addSavedFilterContentShortcut: (
		fields: SavedFilterContentShortcutFields
	) => Promise<void>;
	removeContentShortcut: (shortcutId: string) => Promise<void>;
	addVisualStylePreset: (
		fields: Omit<DesktopUserVisualStylePreset, 'id' | 'createdAt'> & {
			id?: string;
		}
	) => Promise<void>;
	removeVisualStylePreset: (presetId: string) => Promise<void>;
	toggleAssistantAction: (actionId: string) => Promise<void>;
	refresh: () => Promise<void>;
}

export type DesktopExpansionSettings = DesktopExpansionSettingsState &
	DesktopExpansionSettingsActions;

export type DesktopExpansionDiscoveryState = Pick<
	DesktopExpansionSettingsState,
	| 'workspaceProfiles'
	| 'windowLayoutPresets'
	| 'widgetsLayout'
	| 'appCollections'
	| 'contentShortcuts'
	| 'assistantContextActions'
	| 'visualStylePresets'
> &
	Partial<Pick<DesktopExpansionSettingsState, 'isLoading' | 'isSaving'>>;

export interface DesktopExpansionLaunchActions {
	onOpenWorkspaceProfile?: (profileId: string) => void;
	onAddWorkspaceProfileFromTemplate?: (
		templateId: DesktopWorkspaceProfileTemplateId
	) => void;
	onAddAppCollectionFromTemplate?: (
		templateId: DesktopAppCollectionTemplateId
	) => void;
	onOpenAppCollection?: (collectionId: string) => void;
	onOpenContentShortcut?: (shortcutId: string) => void;
	onOpenAssistantAction?: (actionId: string) => void;
	/** Открыть поток GAF по id (Пуск — недавние чаты). */
	onOpenGafChatById?: (chatId: string) => void;
}
