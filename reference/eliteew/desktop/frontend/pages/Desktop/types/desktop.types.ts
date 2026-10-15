/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * TypeScript contracts for Elite Desktop items, window state, and app-specific initial payloads, including transient
 * **companion** keys (`companionSurfaceExcerpt`, `companionSurfaceSelectionPlain`, `companionListingPlain` for shell_context —
 * stripped before snapshot persistence).
 *
 * Invariants:
 * - Payload fields remain JSON-serializable for persist/restore; optional keys use `undefined` omission in merges.
 *
 * Related:
 * - src/pages/Desktop/hooks/useWindowManager.ts
 * - src/pages/Desktop/utils/desktopOpenPayloads.ts
 * - src/features/ewa/ewaPersonaCatalog.ts (`ewaDesktopPersonaId`)
 */

import type { MarketingCabinetDeepLinkState } from '../../MarketingCabinet/hooks/useMarketingCabinetNavigation';

export interface DesktopItem {
	id: string;
	name: string;
	type: 'folder' | 'file' | 'app';
	color?: string;
	gradient?: string;
	position: { x: number; y: number };
	children?: DesktopItem[];
	fileType?: string;
	size?: number;
	isPinned?: boolean;
	appComponent?: string;
	icon?: React.ReactNode;
	description?: string;
	/** System folders (documents, images, etc.) cannot be deleted or renamed */
	isSystem?: boolean;
	systemKey?: string;
	/** Category for Start menu grouping (from app catalog) */
	category?: string;
	/** Per-app policy from catalog (store API): allow multiple windows. */
	allowMultipleWindows?: boolean;
	/** Per-app policy from catalog (store API): max simultaneous windows. */
	maxWindowInstances?: number;
	/** App Store/catalog hint: show as newly featured without changing launch policy. */
	isFeaturedNew?: boolean;
	/** Parent folder id for nested items (folders inside folders). */
	parentId?: string;
	/** User folder glyph id (meta.folder_icon); not used for system folders. */
	folderIconId?: string;
	/** Opaque server meta (project guard flags, folder_icon wire, etc.). */
	meta?: Record<string, unknown>;
	/** From API: created_at / updated_at for Properties modal */
	created_at?: string;
	updated_at?: string;
}

/** Thumbnail hints on folder desktop icons (up to a few direct children). */
export type DesktopFolderPreviewEntry = Pick<
	DesktopItem,
	'id' | 'type' | 'fileType' | 'appComponent'
>;

/**
 * GAF Chat: fields stored on `WindowState.initialPayload` when opening from the launcher,
 * `desktop-open-app` (see `DesktopWorkspaceContent`), `requestOpenGafChatByUsername`, or notifications.
 *
 * Canonical keys on the **window payload** are `targetUsername` / `targetChatId` (stable for events and merges).
 * The window shell maps them to {@link GafChatAppInitialTargetProps} when rendering `GAFChatApp`.
 */
export interface GafChatWindowInitialPayload {
	/** Counterpart username/login; opens or creates a 1:1 chat. */
	targetUsername?: string;
	/** Existing chat id from the GAF Chat API; selects that thread. */
	targetChatId?: string;
}

/**
 * Prop names used by `GAFChatApp` for the same intent as {@link GafChatWindowInitialPayload}.
 * `EnhancedWindow` / `DesktopWindow` pass `initialTargetUsername` ← `targetUsername`, `initialTargetChatId` ← `targetChatId`.
 */
export type GafChatAppInitialTargetProps = {
	initialTargetUsername?: string;
	initialTargetChatId?: string;
};

/** Canonical target type for opening Document Editor from desktop deep-links. */
export type DocEditorTargetType = 'docEditor' | 'unifiedContent';

/** Canonical open target for DocEditor payload builders/mergers. */
export type DocEditorOpenTarget = {
	targetType: DocEditorTargetType;
	id: string;
	/** Optional display name of the opened target file/document. */
	title?: string;
	/** Trace id propagated from deep-link to document load telemetry. */
	requestId?: string;
	/** Request explicit new window (subject to duplicate guards and instance policy). */
	forceNewWindow?: boolean;
	openCollabPanel?: boolean;
	autoJoinCollaboration?: boolean;
};

export type DocEditorTabSource = 'docEditor' | 'unifiedContent';

/** Canonical DocEditor tab payload for mixed source tabs. */
export type DocEditorTabTarget = {
	source: DocEditorTabSource;
	id: string;
	title?: string;
	requestId?: string;
};

/** Canonical active tab pointer in DocEditor window payload. */
export type DocEditorActiveTab = {
	source: DocEditorTabSource;
	id: string;
};

/** Content Manager list scope when opening from a saved-filter shortcut or window payload. */
export interface ContentManagerInitialFilterSnapshot {
	searchQuery?: string;
	filterType?: string;
	filterVisibility?: string;
	filterFolderId?: string;
	filterCompanyId?: string;
	filterProjectId?: string;
	filesBrowseMode?: string;
	explorerFolderTarget?: string;
}

/** Payload passed when opening an app (e.g. DocEditor with a specific document, GAF Chat with target user). */
export interface WindowInitialPayload extends GafChatWindowInitialPayload {
	/** Video calls: internal call id resolved through `/api/v1/video-calls/{id}/join`. */
	videoCallId?: string;
	/** Optional pre-authorized meeting URL returned to the caller at call creation time. */
	videoCallJoinUrl?: string;
	/** Optional display title for the call window. */
	videoCallTitle?: string;
	/** Canonical mixed tab list (doc editor ids + unified content ids). */
	docEditorTabs?: DocEditorTabTarget[];
	/** Canonical active tab for mixed tab model. */
	activeDocEditorTab?: DocEditorActiveTab;
	documentId?: string;
	/** Несколько открытых документов во вкладках (Doc Editor API); `documentId` дублирует активный для обратной совместимости. */
	documentIds?: string[];
	/** Активная вкладка среди `documentIds`. */
	activeDocumentId?: string;
	/** Кэш заголовков для вкладок (после F5 до догрузки документа). */
	tabTitles?: Record<string, string>;
	/** Ultimate Doc Editor: после загрузки документа открыть панель «Совместная работа». */
	openCollabPanel?: boolean;
	/** Ultimate Doc Editor: после загрузки нажать «Подключиться» к совместному редактированию. */
	autoJoinCollaboration?: boolean;
	/** Trace id for DocEditor open/load flow (deep-link -> content load telemetry). */
	docOpenRequestId?: string;
	/** Unified content catalog id — UltimateDocEditor loads via file exchange (`/api/v1/content/:id`). */
	unifiedContentId?: string;
	/** UGS desktop app: open a specific internal section. */
	ugsView?: 'hub' | 'dashboard' | 'analytics' | 'admin' | 'builder';
	/** UGS desktop app: target workflow for builder mode. */
	ugsWorkflowId?: string | null;
	/** Маркетинговый кабинет: состояние из ?mc_* после авто-открытия с десктопа (URL очищается). */
	marketingCabinetDeepLink?: MarketingCabinetDeepLinkState;
	/** Legacy deep-link markers; окно EWA их не трактует как маркетинговый AMKA контур. */
	amkaCompanyId?: string;
	/** Legacy deep-link маркеры; только мосты кабинета. */
	amkaProjectId?: string;
	/** Окно приложения EWA (`EwaApp`): идентификатор сессии платформенной оркестрации (`desktop-orchestration`, persist). */
	ewaDesktopSessionId?: string;
	/**
	 * EWA desktop (`EwaApp`): сохранённый выбор лица помощи (`parent` | `mela` | `zera` | `kora` | `tala` | `feni`; см.
	 * `src/features/ewa/ewaPersonaCatalog.ts`). UI/persist локально до явного включения поля в оркестратор.
	 */
	ewaDesktopPersonaId?: string;
	/**
	 * EWA desktop (`EwaApp`): user-facing companion display label (for titlebar/taskbar/desktop shortcut chrome).
	 * Runtime display only; app id/component remain `EwaApp`.
	 */
	ewaDesktopDisplayName?: string;
	/** Content Manager: открытие из кабинета с привязкой к проекту (проводник + папка на рабочем столе). */
	contentManagerProjectId?: string;
	contentManagerCompanyId?: string;
	/** Отображаемое имя папки на рабочем столе при первом создании. */
	contentManagerProjectName?: string;
	/** Узкий режим: без переключения каталог/проводник и без смены компании/проекта в фильтрах. */
	contentManagerCabinetView?: boolean;
	/** Открытие из окна папки рабочего стола: выставить проводник / «Все файлы» на эту папку (`item_id`, для Content Library — `content`). */
	contentManagerFolderItemId?: string;
	/** Content Manager: начальные фильтры списка (ярлык «Сохранённый фильтр», deep link). Ключи см. `contentManagerFilterShortcut.ts`. */
	contentManagerInitialFilter?: ContentManagerInitialFilterSnapshot;
	/** Content Manager: выделить unified content после загрузки списка (например из ПКМ рабочего стола). */
	contentManagerFocusUnifiedContentId?: string;
	/** Content Manager: открыть модалку привязки к компании/проекту (после фокуса по contentManagerFocusUnifiedContentId). */
	contentManagerOpenAssignProject?: boolean;
	/** Desktop AI Chat: открыть существующий чат по id. */
	desktopAiChatId?: string;
	/** GAF Chat: после выбора чата — вложение в композере (unified content id). */
	gafComposerAttachmentContentId?: string;
	gafComposerAttachmentFileName?: string;
	gafComposerAttachmentMimeType?: string | null;
	gafComposerAttachmentSize?: number | null;
	/**
	 * GAF Chat: подставить черновик в композер при выбранном чате
	 * (контекст проекта Content Manager, сценарии expansion).
	 */
	gafComposerSeed?: string;
	/** Desktop AI Chat: привязать существующий unified content к активному чату при открытии. */
	desktopAiAttachContentId?: string;
	desktopAiAttachSourceLabel?: string | null;
	/**
	 * Desktop AI Chat: подставить черновик в композер один раз при готовности чата
	 * (волна 7 — сценарии expansion / контекст окна).
	 */
	desktopAiComposerSeed?: string;
	/**
	 * Opt-in: приложение в окне передаёт ярлык контекста для Assistant (без сканирования DOM).
	 * Обновляется через merge {@link WindowState.initialPayload}.
	 */
	assistantSurfaceContext?: {
		label: string;
		detail?: string;
		unifiedContentIds?: string[];
	};
	/**
	 * Live plain excerpt (HTML stripped on the Doc Editor host) for EWA **`shell_context`**.
	 * **Not** written to **`windows_snapshot`** — see **`sanitizeWindowPayloadForShellPersistence`**.
	 */
	companionSurfaceExcerpt?: string;
	/**
	 * Debounced plain selected text from the Doc Editor tip host → **`surface_selection`** in **`shell_context`**.
	 * **Not** written to **`windows_snapshot`** — stripped with **`sanitizeWindowPayloadForShellPersistence`**.
	 */
	companionSurfaceSelectionPlain?: string;
	/**
	 * Host-built plaintext inventories (folder file names, Presentations picker/history headings, …) mapped to **`surface_listing`** in companion **`shell_context`**.
	 * **Not** written to **`windows_snapshot`** — stripped with **`sanitizeWindowPayloadForShellPersistence`**.
	 */
	companionListingPlain?: string;
	/** EWDesk: открыть новость по id (см. `?ewdesk_news=` в useDesktopUrlLaunchEffects). */
	ewDeskNewsId?: string;
	/** Social Hub: открыть конкретную вкладку при запуске из уведомления, трея или другого приложения. */
	socialHubTab?:
		| 'overview'
		| 'inbox'
		| 'friends'
		| 'circles'
		| 'privacy'
		| 'profile'
		| 'mobile-app';
	/** Social Hub/Friends: выделить карточку конкретного друга после загрузки списка. */
	socialHubFriendUserId?: string;
	/** Генератор песен: вкладка при открытии по deep link (уведомление с unified content id). `editor` в payload мапится на `generations` — вкладка редактора отключена. */
	musicGeneratorTab?:
		| 'wizard'
		| 'ugs_v2'
		| 'ace_v2'
		| 'generator'
		| 'professional'
		| 'chaotic'
		| 'generations'
		| 'editor';
	/** Music Evolution: открыть конкретный durable run. */
	musicEvolutionRunId?: string;
	/** MusicForge: открыть конкретный durable run. */
	musicForgeRunId?: string;
	/** Экран обслуживания (DesktopAppMaintenance) */
	maintenanceAppName?: string;
	maintenanceAppId?: string;
	maintenance_title?: string | null;
	maintenance_reason?: string | null;
	maintenance_expected_outcome?: string | null;
	maintenance_eta_note?: string | null;
	/** Обращения: фокус в поле текста (трей) */
	feedbackQuickMode?: 'text';
	/** Обращения: предзаполнить основное поле (например из «Справочника»). */
	feedbackDraftBody?: string;
	/** Survey Hub: open runner for a specific survey (GAF deep link). */
	surveyId?: string;
	/** Окно {@link DesktopWidgetShelfApp}: активная вкладка при открытии. */
	widgetShelfTab?: 'notes' | 'todos';
	/** Окно настроек оболочки: начальная вкладка (см. `DesktopSettingsPanel`). */
	shellSettingsTab?:
		| 'personalize'
		| 'icons'
		| 'chrome'
		| 'shell'
		| 'performance';
	/** После открытия — прокрутить к элементу с этим `id` (вкладка shell). */
	shellSettingsScrollToElementId?: string;
	/**
	 * Professional Worlds cross-app draft: `sessionStorage` key written by
	 * `openProfessionalDraftDestination` before `desktop-open-app`.
	 */
	professionalWorldsCrossAppDraftKey?: string;
	/** EWRP desktop app: open a specific completed job (companion presentation show/open). */
	ewrpJobId?: string;
}

export interface WindowState {
	id: string;
	title: string;
	type: 'folder' | 'app';
	position: { x: number; y: number };
	size: { width: number; height: number };
	/** Last non-maximized / non-snapped bounds for restore. Not persisted. */
	restoreBounds?: {
		position: { x: number; y: number };
		size: { width: number; height: number };
	} | null;
	isMinimized: boolean;
	/** Transient: true while playing minimize-to-taskbar animation (not persisted). */
	isMinimizing?: boolean;
	isMaximized: boolean;
	zIndex: number;
	/** Runtime-only: window stays above normal z-order until toggled off. */
	alwaysOnTop?: boolean;
	folderId?: string;
	path: string[];
	appComponent?: string;
	icon?: React.ReactNode;
	/** Optional payload when opening app (e.g. documentId for DocEditor). Not persisted. */
	initialPayload?: WindowInitialPayload;
	/** Runtime-only: set when window is recreated from `windows_snapshot` (skip EWA opening preloader). */
	openedFromSessionRestore?: boolean;
}

/** Serializable window state for persistence (no React nodes). */
export interface PersistedWindowState {
	folderId?: string;
	path: string[];
	appComponent?: string;
	title: string;
	type: 'folder' | 'app';
	position: { x: number; y: number };
	size: { width: number; height: number };
	isMinimized: boolean;
	isMaximized: boolean;
	zIndex: number;
	desktopId?: string;
	/** Восстанавливается после F5 (документ, GAF target, UGS view и т.д.). */
	initialPayload?: WindowInitialPayload;
}

/** Return true to allow close, false to block (e.g. confirm unsaved). */
export type BeforeCloseHandler = () => Promise<boolean> | boolean;

/** Snap/tiling zone for window placement. */
export type SnapZone =
	| 'left'
	| 'right'
	| 'top'
	| 'bottom'
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right'
	| 'left-third'
	| 'center-third'
	| 'right-third'
	| null;

export interface ContextMenuState {
	isOpen: boolean;
	x: number;
	y: number;
	targetItem?: DesktopItem;
	targetType: 'desktop' | 'item';
}

export interface Notification {
	id: string;
	title: string;
	message: string;
	type: 'info' | 'success' | 'warning' | 'error';
	time: Date;
	read: boolean;
}

/** Canonical type for recent files (Start menu, QuickSearch). */
export interface RecentFile {
	id: string;
	name: string;
	type: 'document' | 'image' | 'video' | 'audio' | 'folder' | 'project';
	path: string;
	openedAt: Date;
	icon?: React.ReactNode;
}

export type WidgetsPanelPosition =
	| 'top-right'
	| 'top-left'
	| 'bottom-right'
	| 'bottom-left';

export interface DesktopConfig {
	id?: string;
	user_id: string;
	wallpaper: string;
	/** All wallpapers used by this user (DB-backed, most recent first). */
	wallpaper_history?: string[];
	icon_size: 'small' | 'medium' | 'large';
	show_widget: boolean;
	widget_position: { x: number; y: number };
	theme: 'dark' | 'light' | 'auto';
	/** Preset id (purple, blue, …) или `#rrggbb` для своего цвета. См. API `accent_color`. */
	accent?: string;
	/** Legacy поле конфига; в UI не используется (раньше — слой «живых» обоев). */
	liveWallpaper?: boolean;
	/** When true, icons snap to grid on drag end */
	snap_to_grid?: boolean;
	/** Grid step for snap (small/medium/large) */
	grid_step?: 'small' | 'medium' | 'large';
	/** Widgets panel position (saved in DB). */
	widgets_panel_position?: WidgetsPanelPosition;
	/** Compact widgets mode (saved in DB). */
	compact_widgets?: boolean;
	/** Show widgets panel preference (saved in DB). */
	show_widgets_panel?: boolean;
	created_at?: string;
	updated_at?: string;
}

export interface DesktopItemConfig {
	id?: string;
	user_id: string;
	item_id: string;
	item_type: 'folder' | 'app' | 'file';
	name: string;
	position: { x: number; y: number };
	color?: string;
	gradient?: string;
	is_pinned: boolean;
	parent_id?: string;
	app_component?: string;
	is_system?: boolean;
	system_key?: string;
	created_at?: string;
	updated_at?: string;
}

export interface Wallpaper {
	id: string;
	name: string;
	style: string;
	isCustom?: boolean;
	imageUrl?: string;
}

export interface FolderColor {
	id: string;
	color: string;
	gradient: string;
}

export interface WeatherData {
	temp: number;
	condition: 'sunny' | 'rainy' | 'cloudy' | 'snowy' | 'stormy';
	location?: string;
}

export interface SystemStats {
	cpu: number;
	memory: number;
	disk: number;
}

export interface DesktopTheme {
	id: 'dark' | 'light' | 'auto';
	name: string;
	colors: {
		background: string;
		surface: string;
		text: string;
		textSecondary: string;
		accent: string;
		border: string;
	};
}

export interface NoteWidget {
	id: string;
	content: string;
	color: string;
	position: { x: number; y: number };
	createdAt: Date;
	/** Optional tags for grouping/filtering notes */
	tags?: string[];
}

export interface TodoItem {
	id: string;
	text: string;
	completed: boolean;
	createdAt: Date;
	/** Priority for quick filters and highlighting */
	priority?: 'low' | 'medium' | 'high';
	/** Optional tags for advanced filtering */
	tags?: string[];
}

export interface CalendarEvent {
	id: string;
	title: string;
	date: Date;
	color?: string;
}
