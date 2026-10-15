/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Hook for desktop expansion settings: hydrate/patch shell_state slices (profiles, layouts, widgets, discovery).
 *
 * Invariants:
 * - Online patches go through scheduleShellStateMutation({ source: 'expansion', merge }); offline enqueues persist queue.
 * - Conflict/error for expansion PATCH derives from subscribeShellStatePipeline snapshot and flush failure hook.
 * - Does not clear expansion error before refresh/patch completes (avoids unpause race during 412).
 *
 * Related:
 * - desktopShellStateMutationPipeline.ts, DesktopSettingsExpansionSection.tsx
 * ---
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
	DESKTOP_APP_COLLECTION_TEMPLATES,
	type DesktopAppCollectionTemplateId,
} from '../constants/desktopAppCollectionTemplates';
import {
	DESKTOP_WORKSPACE_PROFILE_TEMPLATES,
	type DesktopWorkspaceProfileTemplateId,
} from '../constants/desktopWorkspaceProfileTemplates';
import {
	curatedLayoutZones,
	type CuratedWorkspaceLayoutTemplateId,
	type SnapZoneConcrete,
} from '../constants/desktopCuratedWorkspaceLayoutTemplates';
import {
	type DesktopScenarioWindowLayoutId,
	scenarioGeometryTemplate,
} from '../constants/desktopScenarioWindowLayouts';
import {
	fetchDesktopShellStateDeduplicated,
	isDesktopShellStateConflictError,
	isDesktopShellStateConflictMessage,
} from '../services/desktopApi';
import { enqueueDesktopPersistShellPatch } from '../utils/desktopPersistPatchQueue';
import {
	flushShellStatePipelineNow,
	scheduleShellStateMutation,
	setShellStatePipelineFlushFailureHook,
	subscribeShellStatePipeline,
} from '../utils/desktopShellStateMutationPipeline';
import {
	type DesktopWindowStyle,
	normalizeDesktopFontBody,
	normalizeDesktopFontDisplay,
	normalizeDesktopIconStyle,
	normalizeDesktopSceneDepth,
	normalizeDesktopTaskbarStyle,
	normalizeDesktopWidgetsStyle,
} from '../../../types/profile';
import type {
	DesktopItem,
	PersistedWindowState,
	WidgetsPanelPosition,
	WindowState,
} from '../types/desktop.types';
import {
	shortcutTargetFromSavedFilterFields,
	type SavedFilterContentShortcutFields,
} from '../utils/contentManagerFilterShortcut';
import type {
	DesktopAppCollection,
	DesktopAssistantContextAction,
	DesktopContentShortcut,
	DesktopExpansionSettings,
	DesktopWidgetLayoutSlot,
	DesktopWidgetsLayout,
	DesktopWidgetsSlotPlacement,
	DesktopWindowLayoutPreset,
	DesktopWorkspaceProfile,
	DesktopUserVisualStylePreset,
} from '../types/desktopExpansion.types';
import type {
	ExpansionShellState,
	ExpansionShellStatePatch,
} from '../types/desktopShellStatePatch.types';
import {
	deriveWorkspaceProfileIdsFromPersistedWindows,
	deriveWorkspaceProfileIdsFromWindows,
} from '../utils/desktopWorkspaceProfileCapture';
import { getWindowsArrayFromShellSnapshot } from '../utils/desktopWindowsSnapshot';
import {
	getRectForSnapZone,
	readDesktopWorkArea,
} from '../utils/desktopSnapGeometry';
import {
	clampWidgetPositionInWorkArea,
	computeInitialFreeSlotPositions,
	DEFAULT_WIDGET_SLOTS,
	estimateWidgetSlotHeight,
	normalizeWidgetsLayout,
	normalizedSlotPlacement,
	reorderWidgetSlotsByIndex,
	WIDGET_SLOT_CARD_WIDTH_LAYOUT,
	WIDGET_WORK_MARGIN_PX,
} from '../utils/desktopWidgetLayoutUtils';
import { sanitizeWindowPayloadForShellPersistence } from '../utils/sanitizePersistedDesktopWindowPayload';

const DEFAULT_ASSISTANT_ACTIONS: DesktopAssistantContextAction[] = [
	{
		id: 'explain-selection',
		label: 'explainSelection',
		source: 'selection',
		assistantTarget: 'assistant',
		enabled: true,
	},
	{
		id: 'summarize-window',
		label: 'summarizeWindow',
		source: 'window-toolbar',
		assistantTarget: 'assistant',
		enabled: true,
	},
	{
		id: 'send-to-gaf',
		label: 'sendToGaf',
		source: 'context-menu',
		assistantTarget: 'gaf',
		enabled: true,
	},
	{
		id: 'create-task',
		label: 'createTask',
		source: 'properties-panel',
		assistantTarget: 'assistant',
		enabled: true,
	},
];

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeWorkspaceProfiles(raw: unknown): DesktopWorkspaceProfile[] {
	const source = isObjectRecord(raw) ? raw.profiles : raw;
	if (!Array.isArray(source)) return [];
	return source
		.filter(isObjectRecord)
		.map((profile) => ({
			id: String(profile.id ?? '').trim(),
			name: String(profile.name ?? '').trim(),
			description:
				typeof profile.description === 'string'
					? profile.description
					: undefined,
			desktopId:
				typeof profile.desktopId === 'string' ? profile.desktopId : undefined,
			wallpaper:
				typeof profile.wallpaper === 'string' ? profile.wallpaper : undefined,
			appIds: Array.isArray(profile.appIds)
				? profile.appIds.filter((x): x is string => typeof x === 'string')
				: [],
			folderItemIds: Array.isArray(profile.folderItemIds)
				? profile.folderItemIds.filter(
						(x): x is string => typeof x === 'string'
					)
				: [],
			widgetIds: Array.isArray(profile.widgetIds)
				? profile.widgetIds.filter((x): x is string => typeof x === 'string')
				: [],
		}))
		.filter((profile) => profile.id && profile.name)
		.slice(0, 24);
}

function normalizeList<T>(raw: unknown): T[] {
	return Array.isArray(raw) ? (raw.filter(isObjectRecord) as T[]) : [];
}

function createId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeVisualStylePresets(
	raw: unknown
): DesktopUserVisualStylePreset[] {
	if (!Array.isArray(raw)) return [];
	const out: DesktopUserVisualStylePreset[] = [];
	for (const item of raw.slice(0, 24)) {
		if (!isObjectRecord(item)) continue;
		const id = String(item.id ?? '')
			.trim()
			.slice(0, 120);
		const name = String(item.name ?? '')
			.trim()
			.slice(0, 120);
		if (!id || !name) continue;
		const themeRaw = String(item.theme ?? 'dark').toLowerCase();
		const theme: DesktopUserVisualStylePreset['theme'] =
			themeRaw === 'light' || themeRaw === 'auto' ? themeRaw : 'dark';
		const wi = item.wallpaperIndex;
		const wallpaperIndex =
			typeof wi === 'number' && Number.isFinite(wi) && wi >= 1 && wi <= 199
				? Math.floor(wi)
				: 1;
		const wallpaperRef =
			typeof item.wallpaperRef === 'string'
				? item.wallpaperRef.slice(0, 50_000)
				: undefined;
		const accent =
			typeof item.accent === 'string'
				? item.accent.trim().slice(0, 120)
				: undefined;
		const windowStyle = normalizeDesktopTaskbarStyle(
			String(item.windowStyle ?? '')
		) as DesktopWindowStyle;
		const taskbarStyle = normalizeDesktopTaskbarStyle(
			String(item.taskbarStyle ?? windowStyle)
		);
		const iconStyle = normalizeDesktopIconStyle(
			String(item.iconStyle ?? windowStyle)
		);
		const widgetsStyle = normalizeDesktopWidgetsStyle(
			String(item.widgetsStyle ?? windowStyle)
		);
		let desktopPanelOpacity: number | undefined;
		if (
			typeof item.desktopPanelOpacity === 'number' &&
			Number.isFinite(item.desktopPanelOpacity)
		) {
			desktopPanelOpacity = Math.min(
				1,
				Math.max(0.35, item.desktopPanelOpacity)
			);
		}
		let desktopUiScale: number | undefined;
		if (
			typeof item.desktopUiScale === 'number' &&
			Number.isFinite(item.desktopUiScale)
		) {
			desktopUiScale = Math.min(1.5, Math.max(0.5, item.desktopUiScale));
		}
		const desktopSceneDepth =
			typeof item.desktopSceneDepth === 'string'
				? normalizeDesktopSceneDepth(item.desktopSceneDepth)
				: undefined;
		const desktopFontBody =
			typeof item.desktopFontBody === 'string'
				? normalizeDesktopFontBody(item.desktopFontBody)
				: undefined;
		const desktopFontDisplay =
			typeof item.desktopFontDisplay === 'string'
				? normalizeDesktopFontDisplay(item.desktopFontDisplay)
				: undefined;
		const desktopWallpaperCrossfadeEnabled =
			typeof item.desktopWallpaperCrossfadeEnabled === 'boolean'
				? item.desktopWallpaperCrossfadeEnabled
				: undefined;
		const desktopStyledTooltips =
			typeof item.desktopStyledTooltips === 'boolean'
				? item.desktopStyledTooltips
				: undefined;
		const createdAt =
			typeof item.createdAt === 'string'
				? item.createdAt.slice(0, 80)
				: undefined;
		out.push({
			id,
			name,
			theme,
			accentFollows: item.accentFollows === true,
			wallpaperIndex,
			...(wallpaperRef ? { wallpaperRef } : {}),
			...(accent ? { accent } : {}),
			windowStyle,
			taskbarStyle,
			iconStyle,
			widgetsStyle,
			...(desktopPanelOpacity != null ? { desktopPanelOpacity } : {}),
			...(desktopUiScale != null ? { desktopUiScale } : {}),
			...(desktopSceneDepth != null ? { desktopSceneDepth } : {}),
			...(desktopFontBody != null ? { desktopFontBody } : {}),
			...(desktopFontDisplay != null ? { desktopFontDisplay } : {}),
			...(desktopWallpaperCrossfadeEnabled != null
				? { desktopWallpaperCrossfadeEnabled }
				: {}),
			...(desktopStyledTooltips != null ? { desktopStyledTooltips } : {}),
			...(createdAt ? { createdAt } : {}),
		});
	}
	return out;
}

function persistableWindow(
	w: WindowState,
	desktopId: string
): PersistedWindowState {
	return {
		folderId: w.folderId,
		path: w.path,
		appComponent: w.appComponent,
		title: w.title,
		type: w.type,
		position: w.position,
		size: w.size,
		isMinimized: w.isMinimized,
		isMaximized: w.isMaximized,
		zIndex: w.zIndex,
		desktopId,
		initialPayload: sanitizeWindowPayloadForShellPersistence(w.initialPayload),
	};
}

/** Как `getMaximizedWindowBounds` в `useWindowManager` — размер зоны snap. */
function layoutWorkSizeFromDom(): { width: number; height: number } {
	const wa = readDesktopWorkArea();
	return {
		width: Math.max(320, wa.width),
		height: Math.max(240, wa.height),
	};
}

export function useDesktopExpansionSettings(params: {
	items: DesktopItem[];
	installedApps: DesktopItem[];
	currentDesktopWindows: WindowState[];
	activeDesktopId: string;
	onApplyWindowLayoutPreset?: (preset: DesktopWindowLayoutPreset) => void;
	onCollectCurrentWorkspaceWindows?: () => void;
	onApplyCuratedWorkspaceLayout?: (
		templateId: CuratedWorkspaceLayoutTemplateId
	) => void;
	/** Угол панели виджетов (desktop_config) — для начальной сетки в режиме free. */
	widgetsPanelPosition?: WidgetsPanelPosition;
	/** Глобальный компакт (desktop_config) — для оценки высот при инициализации free. */
	compactWidgetsGlobal?: boolean;
	/** Сеть: при false shell PATCH ставится в очередь отправки при наличии persistSubjectKey. */
	isOnline?: boolean;
	/**
	 * ID пользователя (auth/backend). Если null — офлайн-очередь shell не используется
	 * (все равно пытаемся PATCH напрямую при сети).
	 */
	persistSubjectKey?: string | null;
}): DesktopExpansionSettings {
	const {
		items,
		installedApps,
		currentDesktopWindows,
		activeDesktopId,
		onApplyWindowLayoutPreset,
		onCollectCurrentWorkspaceWindows,
		onApplyCuratedWorkspaceLayout,
		widgetsPanelPosition = 'top-right',
		compactWidgetsGlobal = false,
		isOnline = true,
		persistSubjectKey = null,
	} = params;
	const { t } = useTranslation('desktopUi');
	const [workspaceProfiles, setWorkspaceProfiles] = useState<
		DesktopWorkspaceProfile[]
	>([]);
	const [sessionSnapshotWindows, setSessionSnapshotWindows] = useState<
		PersistedWindowState[]
	>([]);
	const [windowLayoutPresets, setWindowLayoutPresets] = useState<
		DesktopWindowLayoutPreset[]
	>([]);
	const [widgetsLayout, setWidgetsLayout] = useState<DesktopWidgetsLayout>({
		slots: DEFAULT_WIDGET_SLOTS,
		perWorkspace: false,
	});
	const [appCollections, setAppCollections] = useState<DesktopAppCollection[]>(
		[]
	);
	const [contentShortcuts, setContentShortcuts] = useState<
		DesktopContentShortcut[]
	>([]);
	const [assistantContextActions, setAssistantContextActions] = useState<
		DesktopAssistantContextAction[]
	>(DEFAULT_ASSISTANT_ACTIONS);
	const [visualStylePresets, setVisualStylePresets] = useState<
		DesktopUserVisualStylePreset[]
	>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const applyShellState = useCallback((state: ExpansionShellState) => {
		setWorkspaceProfiles(normalizeWorkspaceProfiles(state.workspace_profiles));
		setSessionSnapshotWindows(
			getWindowsArrayFromShellSnapshot(state.windows_snapshot)
		);
		setWindowLayoutPresets(
			normalizeList<DesktopWindowLayoutPreset>(
				state.window_layout_presets
			).slice(0, 24)
		);
		setWidgetsLayout(normalizeWidgetsLayout(state.widgets_layout));
		setAppCollections(
			normalizeList<DesktopAppCollection>(state.app_collections).slice(0, 24)
		);
		setContentShortcuts(
			normalizeList<DesktopContentShortcut>(state.content_shortcuts).slice(
				0,
				48
			)
		);
		const actions = normalizeList<DesktopAssistantContextAction>(
			state.assistant_context_actions
		);
		setAssistantContextActions(
			actions.length > 0 ? actions : DEFAULT_ASSISTANT_ACTIONS
		);
		setVisualStylePresets(
			normalizeVisualStylePresets(state.visual_style_presets)
		);
	}, []);

	const refresh = useCallback(async () => {
		setIsLoading(true);
		try {
			const state =
				(await fetchDesktopShellStateDeduplicated()) as ExpansionShellState;
			applyShellState(state);
			setError(null);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'desktop shell-state failed'
			);
		} finally {
			setIsLoading(false);
		}
	}, [applyShellState]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		return subscribeShellStatePipeline((snapshot) => {
			if (snapshot.phase === 'conflict' && snapshot.lastConflict) {
				setError(snapshot.lastConflict.message);
				return;
			}
			if (snapshot.phase === 'idle' && !snapshot.lastConflict) {
				setError((prev) =>
					prev != null && isDesktopShellStateConflictMessage(prev) ? null : prev
				);
			}
		});
	}, []);

	useEffect(() => {
		setShellStatePipelineFlushFailureHook(({ sources, error }) => {
			if (!sources.includes('expansion')) return;
			const message =
				error instanceof Error ? error.message : 'desktop shell-state failed';
			setError(message);
		});
		return () => setShellStatePipelineFlushFailureHook(null);
	}, []);

	const patchExpansion = useCallback(
		async (patch: ExpansionShellStatePatch) => {
			setIsSaving(true);
			const patchRecord = patch as Record<string, unknown>;

			try {
				if (persistSubjectKey && !isOnline) {
					enqueueDesktopPersistShellPatch(persistSubjectKey, patchRecord);
					return;
				}

				scheduleShellStateMutation({
					source: 'expansion',
					merge: () => patchRecord,
				});
				const next =
					(await flushShellStatePipelineNow()) as ExpansionShellState;
				applyShellState(next);
				setError(null);
			} catch (err) {
				if (isDesktopShellStateConflictError(err)) {
					return;
				}
				if (persistSubjectKey) {
					enqueueDesktopPersistShellPatch(persistSubjectKey, patchRecord);
				}
				const message =
					err instanceof Error ? err.message : 'desktop shell-state failed';
				setError(message);
			} finally {
				setIsSaving(false);
			}
		},
		[applyShellState, isOnline, persistSubjectKey]
	);

	const addWorkspaceProfile = useCallback(async () => {
		const rootApps = installedApps.slice(0, 4).map((app) => app.id);
		const folders = items
			.filter((item) => item.type === 'folder' && !item.parentId)
			.slice(0, 4)
			.map((item) => item.id);
		const next = [
			...workspaceProfiles,
			{
				id: createId('workspace'),
				name: t('settingsPanel.expansionWorkspaceNewName', {
					count: workspaceProfiles.length + 1,
				}),
				description: t('settingsPanel.expansionWorkspaceNewDesc'),
				desktopId: activeDesktopId,
				appIds: rootApps,
				folderItemIds: folders,
				widgetIds: widgetsLayout.slots
					.filter((slot) => slot.enabled)
					.map((slot) => slot.id),
			},
		].slice(-24);
		setWorkspaceProfiles(next);
		await patchExpansion({ workspace_profiles: { profiles: next } });
	}, [
		activeDesktopId,
		installedApps,
		items,
		patchExpansion,
		t,
		widgetsLayout.slots,
		workspaceProfiles,
	]);

	const addWorkspaceProfileFromOpenWindows = useCallback(async () => {
		const { appIds, folderItemIds } = deriveWorkspaceProfileIdsFromWindows(
			currentDesktopWindows,
			items,
			installedApps
		);
		if (appIds.length === 0 && folderItemIds.length === 0) {
			toast.info(t('settingsPanel.expansionWorkspaceCaptureEmpty'));
			return;
		}
		const next = [
			...workspaceProfiles,
			{
				id: createId('workspace'),
				name: t('settingsPanel.expansionWorkspaceFromSessionName', {
					count: workspaceProfiles.length + 1,
				}),
				description: t('settingsPanel.expansionWorkspaceFromSessionDesc'),
				desktopId: activeDesktopId,
				appIds: appIds.slice(0, 12),
				folderItemIds: folderItemIds.slice(0, 12),
				widgetIds: widgetsLayout.slots
					.filter((slot) => slot.enabled)
					.map((slot) => slot.id),
			},
		].slice(-24);
		setWorkspaceProfiles(next);
		await patchExpansion({ workspace_profiles: { profiles: next } });
	}, [
		activeDesktopId,
		currentDesktopWindows,
		installedApps,
		items,
		patchExpansion,
		t,
		widgetsLayout.slots,
		workspaceProfiles,
	]);

	const addWorkspaceProfileFromSessionSnapshot = useCallback(async () => {
		const { appIds, folderItemIds } =
			deriveWorkspaceProfileIdsFromPersistedWindows(
				sessionSnapshotWindows,
				items,
				installedApps,
				activeDesktopId
			);
		if (appIds.length === 0 && folderItemIds.length === 0) {
			toast.info(t('settingsPanel.expansionWorkspaceSnapshotEmpty'));
			return;
		}
		const next = [
			...workspaceProfiles,
			{
				id: createId('workspace'),
				name: t('settingsPanel.expansionWorkspaceFromSavedSnapshotName', {
					count: workspaceProfiles.length + 1,
				}),
				description: t('settingsPanel.expansionWorkspaceFromSavedSnapshotDesc'),
				desktopId: activeDesktopId,
				appIds: appIds.slice(0, 12),
				folderItemIds: folderItemIds.slice(0, 12),
				widgetIds: widgetsLayout.slots
					.filter((slot) => slot.enabled)
					.map((slot) => slot.id),
			},
		].slice(-24);
		setWorkspaceProfiles(next);
		await patchExpansion({ workspace_profiles: { profiles: next } });
	}, [
		activeDesktopId,
		installedApps,
		items,
		patchExpansion,
		sessionSnapshotWindows,
		t,
		widgetsLayout.slots,
		workspaceProfiles,
	]);

	const addWorkspaceProfileFromTemplate = useCallback(
		async (templateId: DesktopWorkspaceProfileTemplateId) => {
			const def = DESKTOP_WORKSPACE_PROFILE_TEMPLATES.find(
				(item) => item.id === templateId
			);
			if (!def) return;
			const appIds: string[] = [];
			const seen = new Set<string>();
			for (const ac of def.appComponents) {
				const hit = installedApps.find((a) => a.appComponent === ac);
				if (hit && !seen.has(hit.id)) {
					appIds.push(hit.id);
					seen.add(hit.id);
				}
			}
			if (appIds.length === 0) {
				toast.info(t('settingsPanel.expansionWorkspaceTemplateEmpty'));
				return;
			}
			const folders = items
				.filter((item) => item.type === 'folder' && !item.parentId)
				.slice(0, 4)
				.map((item) => item.id);
			const next = [
				...workspaceProfiles,
				{
					id: createId('workspace'),
					name: t(
						`settingsPanel.expansionWorkspaceTemplate.${templateId}.profileName`
					),
					description: t(
						`settingsPanel.expansionWorkspaceTemplate.${templateId}.profileDesc`
					),
					desktopId: activeDesktopId,
					appIds,
					folderItemIds: folders,
					widgetIds: widgetsLayout.slots
						.filter((slot) => slot.enabled)
						.map((slot) => slot.id),
				},
			].slice(-24);
			setWorkspaceProfiles(next);
			await patchExpansion({ workspace_profiles: { profiles: next } });
		},
		[
			activeDesktopId,
			installedApps,
			items,
			patchExpansion,
			t,
			widgetsLayout.slots,
			workspaceProfiles,
		]
	);

	const addWindowLayoutPreset = useCallback(async () => {
		const windows = currentDesktopWindows.map((w) =>
			persistableWindow(w, activeDesktopId)
		);
		const next = [
			...windowLayoutPresets,
			{
				id: createId('layout'),
				name: t('settingsPanel.expansionLayoutNewName', {
					count: windowLayoutPresets.length + 1,
				}),
				description: t('settingsPanel.expansionLayoutNewDesc'),
				windows,
				createdAt: new Date().toISOString(),
			},
		].slice(-24);
		setWindowLayoutPresets(next);
		await patchExpansion({ window_layout_presets: next });
	}, [
		activeDesktopId,
		currentDesktopWindows,
		patchExpansion,
		t,
		windowLayoutPresets,
	]);

	const persistSnapGeometryPreset = useCallback(
		async (
			zones: readonly SnapZoneConcrete[],
			presetName: string,
			presetDescription: string
		) => {
			if (zones.length === 0) return;
			const ordered = [...currentDesktopWindows]
				.filter((w) => !w.isMinimized)
				.sort((a, b) => b.zIndex - a.zIndex);
			if (ordered.length === 0) {
				toast.info(t('settingsPanel.expansionCuratedLayoutNoWindows'));
				return;
			}
			const work = layoutWorkSizeFromDom();
			const limit = Math.min(ordered.length, zones.length);
			const windowsSnap: PersistedWindowState[] = [];
			for (let i = 0; i < limit; i++) {
				const win = ordered[i];
				const zn = zones[i];
				const layout = getRectForSnapZone(zn, work);
				const base = persistableWindow(win, activeDesktopId);
				windowsSnap.push({
					...base,
					position: layout.position,
					size: layout.size,
					isMaximized: layout.isMaximized,
					isMinimized: false,
				});
			}
			const next = [
				...windowLayoutPresets,
				{
					id: createId('layout'),
					name: presetName,
					description: presetDescription,
					windows: windowsSnap,
					createdAt: new Date().toISOString(),
				},
			].slice(-24);
			setWindowLayoutPresets(next);
			await patchExpansion({ window_layout_presets: next });
		},
		[
			activeDesktopId,
			currentDesktopWindows,
			patchExpansion,
			t,
			windowLayoutPresets,
		]
	);

	const addWindowLayoutPresetFromCuratedTemplate = useCallback(
		async (templateId: CuratedWorkspaceLayoutTemplateId) => {
			const zones = curatedLayoutZones(templateId);
			await persistSnapGeometryPreset(
				zones,
				t(`settingsPanel.expansionCuratedLayout.${templateId}.presetName`),
				t(`settingsPanel.expansionCuratedLayout.${templateId}.presetDesc`)
			);
		},
		[persistSnapGeometryPreset, t]
	);

	const addWindowLayoutPresetFromScenario = useCallback(
		async (scenarioId: DesktopScenarioWindowLayoutId) => {
			const geom = scenarioGeometryTemplate(scenarioId);
			const zones = curatedLayoutZones(geom);
			await persistSnapGeometryPreset(
				zones,
				t(`settingsPanel.expansionLayoutScenario.${scenarioId}.presetName`),
				t(`settingsPanel.expansionLayoutScenario.${scenarioId}.presetDesc`)
			);
		},
		[persistSnapGeometryPreset, t]
	);

	const applyScenarioWorkspaceLayout = useCallback(
		(scenarioId: DesktopScenarioWindowLayoutId) => {
			const geom = scenarioGeometryTemplate(scenarioId);
			onApplyCuratedWorkspaceLayout?.(geom);
		},
		[onApplyCuratedWorkspaceLayout]
	);

	const removeWorkspaceProfile = useCallback(
		async (profileId: string) => {
			const next = workspaceProfiles.filter(
				(profile) => profile.id !== profileId
			);
			setWorkspaceProfiles(next);
			await patchExpansion({ workspace_profiles: { profiles: next } });
		},
		[patchExpansion, workspaceProfiles]
	);

	const patchWorkspaceProfile = useCallback(
		async (
			profileId: string,
			patch: Partial<
				Pick<
					DesktopWorkspaceProfile,
					'name' | 'description' | 'desktopId' | 'wallpaper'
				>
			>
		) => {
			const next = workspaceProfiles.map((p) => {
				if (p.id !== profileId) return p;
				const name =
					typeof patch.name === 'string' ? patch.name.trim() || p.name : p.name;
				if (!name) return p;
				return {
					...p,
					name,
					description:
						patch.description !== undefined
							? patch.description.trim() || undefined
							: p.description,
					desktopId:
						patch.desktopId !== undefined
							? patch.desktopId === ''
								? undefined
								: patch.desktopId
							: p.desktopId,
					wallpaper:
						patch.wallpaper !== undefined
							? patch.wallpaper.trim() || undefined
							: p.wallpaper,
				};
			});
			setWorkspaceProfiles(next);
			await patchExpansion({ workspace_profiles: { profiles: next } });
		},
		[patchExpansion, workspaceProfiles]
	);

	const removeWindowLayoutPreset = useCallback(
		async (presetId: string) => {
			const next = windowLayoutPresets.filter(
				(preset) => preset.id !== presetId
			);
			setWindowLayoutPresets(next);
			await patchExpansion({ window_layout_presets: next });
		},
		[patchExpansion, windowLayoutPresets]
	);

	const applyWindowLayoutPreset = useCallback(
		(presetId: string) => {
			const preset = windowLayoutPresets.find((item) => item.id === presetId);
			if (preset) {
				onApplyWindowLayoutPreset?.(preset);
			}
		},
		[onApplyWindowLayoutPreset, windowLayoutPresets]
	);

	const collectCurrentWorkspaceWindows = useCallback(() => {
		onCollectCurrentWorkspaceWindows?.();
	}, [onCollectCurrentWorkspaceWindows]);

	const applyCuratedWorkspaceLayout = useCallback(
		(templateId: CuratedWorkspaceLayoutTemplateId) => {
			onApplyCuratedWorkspaceLayout?.(templateId);
		},
		[onApplyCuratedWorkspaceLayout]
	);

	const toggleWidgetSlot = useCallback(
		async (slotId: string) => {
			const next = {
				...widgetsLayout,
				slots: widgetsLayout.slots.map((slot) =>
					slot.id === slotId ? { ...slot, enabled: !slot.enabled } : slot
				),
			};
			setWidgetsLayout(next);
			await patchExpansion({ widgets_layout: next });
		},
		[patchExpansion, widgetsLayout]
	);

	const toggleWidgetSlotMode = useCallback(
		async (slotId: string) => {
			const next: DesktopWidgetsLayout = {
				...widgetsLayout,
				slots: widgetsLayout.slots.map((slot) => {
					if (slot.id !== slotId) return slot;
					const mode: DesktopWidgetLayoutSlot['mode'] =
						slot.mode === 'compact' ? 'expanded' : 'compact';
					return { ...slot, mode };
				}),
			};
			setWidgetsLayout(next);
			await patchExpansion({ widgets_layout: next });
		},
		[patchExpansion, widgetsLayout]
	);

	const toggleWidgetsPerWorkspace = useCallback(
		async (enabled: boolean) => {
			const next = { ...widgetsLayout, perWorkspace: enabled };
			setWidgetsLayout(next);
			await patchExpansion({ widgets_layout: next });
		},
		[patchExpansion, widgetsLayout]
	);

	const reorderWidgetSlots = useCallback(
		async (fromIndex: number, toIndex: number) => {
			const slots = reorderWidgetSlotsByIndex(
				widgetsLayout.slots,
				fromIndex,
				toIndex
			);
			const next: DesktopWidgetsLayout = { ...widgetsLayout, slots };
			setWidgetsLayout(next);
			await patchExpansion({ widgets_layout: next });
		},
		[patchExpansion, widgetsLayout]
	);

	const moveWidgetSlotStep = useCallback(
		async (slotId: string, direction: 'up' | 'down') => {
			const idx = widgetsLayout.slots.findIndex((s) => s.id === slotId);
			if (idx < 0) return;
			const toIndex = direction === 'up' ? idx - 1 : idx + 1;
			if (toIndex < 0 || toIndex >= widgetsLayout.slots.length) return;
			await reorderWidgetSlots(idx, toIndex);
		},
		[reorderWidgetSlots, widgetsLayout.slots]
	);

	const setWidgetSlotWorkspaceProfile = useCallback(
		async (slotId: string, workspaceProfileId: string | undefined) => {
			const next: DesktopWidgetsLayout = {
				...widgetsLayout,
				slots: widgetsLayout.slots.map((slot) =>
					slot.id === slotId
						? {
								...slot,
								workspaceProfileId:
									typeof workspaceProfileId === 'string' &&
									workspaceProfileId.trim()
										? workspaceProfileId.trim()
										: undefined,
							}
						: slot
				),
			};
			setWidgetsLayout(next);
			await patchExpansion({ widgets_layout: next });
		},
		[patchExpansion, widgetsLayout]
	);

	const setWidgetsPanelOffset = useCallback(
		async (offset: { x: number; y: number }) => {
			const next: DesktopWidgetsLayout = {
				...widgetsLayout,
				panelOffset: {
					x: Math.round(offset.x),
					y: Math.round(offset.y),
				},
			};
			setWidgetsLayout(next);
			await patchExpansion({ widgets_layout: next });
		},
		[patchExpansion, widgetsLayout]
	);

	const setWidgetsSlotPlacement = useCallback(
		async (placement: DesktopWidgetsSlotPlacement) => {
			if (placement === 'free') {
				const work = readDesktopWorkArea();
				const po = widgetsLayout.panelOffset ?? { x: 0, y: 0 };
				const init = computeInitialFreeSlotPositions(
					widgetsLayout.slots,
					widgetsPanelPosition,
					work.width,
					work.height,
					po,
					compactWidgetsGlobal
				);
				const next: DesktopWidgetsLayout = {
					...widgetsLayout,
					slotPlacement: 'free',
					slots: widgetsLayout.slots.map((slot) => {
						if (!slot.enabled) return slot;
						const p = init[slot.id];
						return p ? { ...slot, position: p } : slot;
					}),
				};
				setWidgetsLayout(next);
				await patchExpansion({ widgets_layout: next });
				return;
			}
			const next: DesktopWidgetsLayout = {
				...widgetsLayout,
				slotPlacement: undefined,
				slots: widgetsLayout.slots.map((slot) => {
					const { position: _p, ...rest } = slot;
					return rest;
				}),
			};
			setWidgetsLayout(next);
			await patchExpansion({ widgets_layout: next });
		},
		[compactWidgetsGlobal, patchExpansion, widgetsLayout, widgetsPanelPosition]
	);

	const setWidgetSlotPosition = useCallback(
		async (slotId: string, position: { x: number; y: number }) => {
			const next: DesktopWidgetsLayout = {
				...widgetsLayout,
				slots: widgetsLayout.slots.map((slot) =>
					slot.id === slotId
						? {
								...slot,
								position: {
									x: Math.round(position.x),
									y: Math.round(position.y),
								},
							}
						: slot
				),
			};
			setWidgetsLayout(next);
			await patchExpansion({ widgets_layout: next });
		},
		[patchExpansion, widgetsLayout]
	);

	const nudgeAllWidgetSlotPositions = useCallback(
		async (delta: { x: number; y: number }) => {
			const work = readDesktopWorkArea();
			const dx = Math.round(delta.x);
			const dy = Math.round(delta.y);
			const nextSlots = widgetsLayout.slots.map((slot) => {
				if (!slot.enabled || !slot.position) return slot;
				const cardH = estimateWidgetSlotHeight(
					slot.type,
					compactWidgetsGlobal || slot.mode === 'compact'
				);
				const clamped = clampWidgetPositionInWorkArea(
					{ x: slot.position.x + dx, y: slot.position.y + dy },
					work.width,
					work.height,
					WIDGET_SLOT_CARD_WIDTH_LAYOUT,
					cardH,
					WIDGET_WORK_MARGIN_PX
				);
				return { ...slot, position: clamped };
			});
			const next = { ...widgetsLayout, slots: nextSlots };
			setWidgetsLayout(next);
			await patchExpansion({ widgets_layout: next });
		},
		[compactWidgetsGlobal, patchExpansion, widgetsLayout]
	);

	const ensureFreeWidgetSlotPositions = useCallback(async () => {
		if (normalizedSlotPlacement(widgetsLayout.slotPlacement) !== 'free') {
			return;
		}
		if (!widgetsLayout.slots.some((s) => s.enabled && s.position == null)) {
			return;
		}
		const work = readDesktopWorkArea();
		const po = widgetsLayout.panelOffset ?? { x: 0, y: 0 };
		const init = computeInitialFreeSlotPositions(
			widgetsLayout.slots,
			widgetsPanelPosition,
			work.width,
			work.height,
			po,
			compactWidgetsGlobal
		);
		const next: DesktopWidgetsLayout = {
			...widgetsLayout,
			slotPlacement: 'free',
			slots: widgetsLayout.slots.map((slot) => {
				if (!slot.enabled || slot.position != null) return slot;
				const p = init[slot.id];
				return p ? { ...slot, position: p } : slot;
			}),
		};
		setWidgetsLayout(next);
		await patchExpansion({ widgets_layout: next });
	}, [
		compactWidgetsGlobal,
		patchExpansion,
		widgetsLayout,
		widgetsPanelPosition,
	]);

	const addAppCollection = useCallback(async () => {
		const next = [
			...appCollections,
			{
				id: createId('apps'),
				name: t('settingsPanel.expansionAppCollectionNewName', {
					count: appCollections.length + 1,
				}),
				description: t('settingsPanel.expansionAppCollectionNewDesc'),
				appIds: installedApps.slice(0, 6).map((app) => app.id),
			},
		].slice(-24);
		setAppCollections(next);
		await patchExpansion({ app_collections: next });
	}, [appCollections, installedApps, patchExpansion, t]);

	const addAppCollectionFromTemplate = useCallback(
		async (templateId: DesktopAppCollectionTemplateId) => {
			const def = DESKTOP_APP_COLLECTION_TEMPLATES.find(
				(item) => item.id === templateId
			);
			if (!def) return;
			const appIds: string[] = [];
			const seen = new Set<string>();
			for (const ac of def.appComponents) {
				const hit = installedApps.find((a) => a.appComponent === ac);
				if (hit && !seen.has(hit.id)) {
					appIds.push(hit.id);
					seen.add(hit.id);
				}
			}
			if (appIds.length === 0) {
				toast.info(t('settingsPanel.expansionAppCollectionTemplateEmpty'));
				return;
			}
			const next = [
				...appCollections,
				{
					id: createId('apps'),
					name: t(
						`settingsPanel.expansionAppCollectionTemplate.${templateId}.name`
					),
					description: t(
						`settingsPanel.expansionAppCollectionTemplate.${templateId}.desc`
					),
					appIds,
				},
			].slice(-24);
			setAppCollections(next);
			await patchExpansion({ app_collections: next });
		},
		[appCollections, installedApps, patchExpansion, t]
	);

	const removeAppCollection = useCallback(
		async (collectionId: string) => {
			const next = appCollections.filter(
				(collection) => collection.id !== collectionId
			);
			setAppCollections(next);
			await patchExpansion({ app_collections: next });
		},
		[appCollections, patchExpansion]
	);

	const addContentShortcut = useCallback(async () => {
		const folder = items.find(
			(item) => item.type === 'folder' && !item.parentId
		);
		const next = [
			...contentShortcuts,
			{
				id: createId('content'),
				label:
					folder?.name ??
					t('settingsPanel.expansionContentShortcutFallbackLabel'),
				type: 'desktop-folder' as const,
				target: { itemId: folder?.id ?? 'content' },
				workspaceProfileId: workspaceProfiles[0]?.id,
			},
		].slice(-48);
		setContentShortcuts(next);
		await patchExpansion({ content_shortcuts: next });
	}, [contentShortcuts, items, patchExpansion, t, workspaceProfiles]);

	const removeContentShortcut = useCallback(
		async (shortcutId: string) => {
			const next = contentShortcuts.filter(
				(shortcut) => shortcut.id !== shortcutId
			);
			setContentShortcuts(next);
			await patchExpansion({ content_shortcuts: next });
		},
		[contentShortcuts, patchExpansion]
	);

	const addSavedFilterContentShortcut = useCallback(
		async (fields: SavedFilterContentShortcutFields) => {
			const label =
				fields.label?.trim() ||
				t('settingsPanel.expansionSavedFilterShortcutFallbackLabel');
			const target = shortcutTargetFromSavedFilterFields({
				...fields,
				label,
			});
			const next = [
				...contentShortcuts,
				{
					id: createId('content'),
					label,
					type: 'saved-filter' as const,
					target,
					workspaceProfileId: workspaceProfiles[0]?.id,
				},
			].slice(-48);
			setContentShortcuts(next);
			await patchExpansion({ content_shortcuts: next });
		},
		[contentShortcuts, patchExpansion, t, workspaceProfiles]
	);

	const toggleAssistantAction = useCallback(
		async (actionId: string) => {
			const next = assistantContextActions.map((action) =>
				action.id === actionId
					? { ...action, enabled: !action.enabled }
					: action
			);
			setAssistantContextActions(next);
			await patchExpansion({ assistant_context_actions: next });
		},
		[assistantContextActions, patchExpansion]
	);

	const addVisualStylePreset = useCallback(
		async (
			fields: Omit<DesktopUserVisualStylePreset, 'id' | 'createdAt'> & {
				id?: string;
			}
		) => {
			const id = fields.id?.trim() || createId('vstyle');
			const entry: DesktopUserVisualStylePreset = {
				...fields,
				id,
				createdAt: new Date().toISOString(),
			};
			const next = [...visualStylePresets, entry].slice(-24);
			setVisualStylePresets(next);
			await patchExpansion({
				visual_style_presets: next,
			} as ExpansionShellStatePatch);
		},
		[patchExpansion, visualStylePresets]
	);

	const removeVisualStylePreset = useCallback(
		async (presetId: string) => {
			const next = visualStylePresets.filter((p) => p.id !== presetId);
			setVisualStylePresets(next);
			await patchExpansion({
				visual_style_presets: next,
			} as ExpansionShellStatePatch);
		},
		[patchExpansion, visualStylePresets]
	);

	const storageMap = useMemo(
		() => [
			{
				id: 'desktop-config',
				label: t('settingsPanel.storageMapDesktopConfigTitle'),
				description: t('settingsPanel.storageMapDesktopConfigDesc'),
				bucket: 'desktop_config' as const,
				fields: [
					'wallpaper',
					'wallpapers_history',
					'theme',
					'accent_color',
					'icon_size',
					'snap_to_grid',
					'grid_step',
					'live_wallpaper',
					'show_widget',
					'widget_position',
					'show_widgets_panel',
					'widgets_panel_position',
					'compact_widgets',
				],
			},
			{
				id: 'desktop-items',
				label: t('settingsPanel.storageMapDesktopItemsTitle'),
				description: t('settingsPanel.storageMapDesktopItemsDesc'),
				bucket: 'desktop_items' as const,
				fields: [
					'name',
					'type',
					'position',
					'is_pinned',
					'parent_id',
					'app_component',
					'system_key',
					'content_id',
					'folder_id',
					'metadata',
				],
			},
			{
				id: 'profile-ui',
				label: t('settingsPanel.storageMapProfileUiTitle'),
				description: t('settingsPanel.storageMapProfileUiDesc'),
				bucket: 'profile_ui' as const,
				fields: [
					'desktop_window_style',
					'desktop_taskbar_style',
					'desktop_icon_style',
					'desktop_widgets_style',
					'desktop_panel_opacity',
					'desktop_ui_scale',
					'desktop_scene_depth',
					'desktop_font_body',
					'desktop_font_display',
					'desktop_wallpaper_crossfade_enabled',
					'desktop_styled_tooltips',
					'desktop_shell_reduce_motion',
					'desktop_shell_parallax_enabled',
					'desktop_shell_parallax_intensity',
					'desktop_shell_window_morph_enabled',
					'desktop_shell_motion_speed',
					'desktop_menu_mode',
					'desktop_accent_follows_window_style',
					'desktop_open_apps_maximized',
					'desktop_floating_widget_visible',
					'desktop_reduce_backdrop_blur',
					'animations_enabled',
					'compact_mode',
					'default_view',
					'sidebar_collapsed',
				],
			},
			{
				id: 'shell-state',
				label: t('settingsPanel.storageMapShellStateTitle'),
				description: t('settingsPanel.storageMapShellStateDesc'),
				bucket: 'shell_state' as const,
				fields: [
					'virtual_desktops',
					'windows_snapshot',
					'workspace_profiles',
					'window_layout_presets',
					'widgets_layout',
					'app_collections',
					'content_shortcuts',
					'assistant_context_actions',
					'visual_style_presets',
					'recent_app_ids',
					'recent_app_ids_by_desktop',
					'recent_file_ids',
					'clipboard_history',
					'clock_show_seconds',
					'timezone',
					'quiet_mode',
					'tray_show_feedback',
					'tray_show_assistant',
					'now_playing',
					'gaf_chat_sound_enabled',
					'music_playlists',
					'ewa_hints',
				],
			},
			{
				id: 'local-session',
				label: t('settingsPanel.storageMapLocalSessionTitle'),
				description: t('settingsPanel.storageMapLocalSessionDesc'),
				bucket: 'local_session' as const,
				fields: [
					'performance_telemetry',
					'window_drag',
					'modal_focus',
					'personalization_staging',
					'persist_patch_queue',
				],
			},
		],
		[t]
	);

	const savedSessionSnapshotWindowCount = useMemo(
		() => sessionSnapshotWindows.length,
		[sessionSnapshotWindows]
	);

	return {
		storageMap,
		workspaceProfiles,
		savedSessionSnapshotWindowCount,
		windowLayoutPresets,
		widgetsLayout,
		appCollections,
		contentShortcuts,
		assistantContextActions,
		visualStylePresets,
		isLoading,
		isSaving,
		error,
		addWorkspaceProfile,
		addWorkspaceProfileFromOpenWindows,
		addWorkspaceProfileFromTemplate,
		addWorkspaceProfileFromSessionSnapshot,
		patchWorkspaceProfile,
		removeWorkspaceProfile,
		addWindowLayoutPreset,
		addWindowLayoutPresetFromCuratedTemplate,
		addWindowLayoutPresetFromScenario,
		removeWindowLayoutPreset,
		applyWindowLayoutPreset,
		applyCuratedWorkspaceLayout,
		applyScenarioWorkspaceLayout,
		collectCurrentWorkspaceWindows,
		toggleWidgetSlot,
		toggleWidgetSlotMode,
		toggleWidgetsPerWorkspace,
		reorderWidgetSlots,
		moveWidgetSlotStep,
		setWidgetSlotWorkspaceProfile,
		setWidgetsPanelOffset,
		setWidgetsSlotPlacement,
		setWidgetSlotPosition,
		nudgeAllWidgetSlotPositions,
		ensureFreeWidgetSlotPositions,
		addAppCollection,
		addAppCollectionFromTemplate,
		removeAppCollection,
		addContentShortcut,
		addSavedFilterContentShortcut,
		removeContentShortcut,
		addVisualStylePreset,
		removeVisualStylePreset,
		toggleAssistantAction,
		refresh,
	};
}
