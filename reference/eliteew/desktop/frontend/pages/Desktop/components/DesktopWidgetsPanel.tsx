/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Docked desktop widgets panel with composition slots (notes/todos/now-playing/etc) and compact previews.
 *
 * Invariants:
 * - Panel mirrors shell/widget state, not separate domain stores.
 * - Heavy applications stay opt-in via open-in-window actions.
 *
 * Related:
 * - src/pages/Desktop/components/DesktopWorkspaceFloatingWidget.tsx
 * - src/pages/Desktop/context/NowPlayingContext.tsx
 * - DesktopChromeTooltip.tsx
 */
import { MiniAudioControls } from '../../../components/Audio/MiniAudioControls';
import { NowPlayingLoadHint } from '../../../components/Audio/NowPlayingLoadHint';
import { ContentThumbnail } from '../../../components/UnifiedContent/components/ContentThumbnail';
import type { DesktopWidgetsStyle } from '../../../types/profile';
import { cn } from '@/utils/cn';
import { formatDuration } from '../../../utils/formatDuration';
import * as React from 'react';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
	DESKTOP_LAYOUT,
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
	DESKTOP_Z_INDEX,
} from '../constants';
import { useMusicPlaybackDomain } from '../context/MusicPlaybackDomainContext';
import {
	useNowPlayingTime,
	useNowPlayingTransport,
} from '../context/NowPlayingContext';
import { useWidgetNotes, useWidgetTodos } from '../hooks/useWidgetNotesTodos';
import type {
	DesktopAppCollection,
	DesktopContentShortcut,
	DesktopWidgetLayoutSlot,
	DesktopWidgetsLayout,
	DesktopWidgetsSlotPlacement,
	DesktopWorkspaceProfile,
} from '../types/desktopExpansion.types';
import type { RecentFile, WidgetsPanelPosition } from '../types/desktop.types';
import {
	DESKTOP_WINDOW_FRAME_STYLES,
	getDesktopWindowShellTier,
} from '../utils/desktopVisualSystem';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';
import { requestOpenDesktopApp } from '../utils/desktopDeepLink';
import {
	clampWidgetPositionInWorkArea,
	computeInitialFreeSlotPositions,
	filterDesktopWidgetSlots,
	WIDGET_SLOT_CARD_WIDTH_LAYOUT,
	WIDGET_WORK_MARGIN_PX,
} from '../utils/desktopWidgetLayoutUtils';
import { DesktopAppButton } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { DashboardFavoritesSlotBody } from './DashboardFavoritesSlotBody';
import { EwDeskWidgetPreview } from './ewDesk/EwDeskWidgetPreview';
import {
	Bars2Icon,
	MusicalNoteIcon,
	NewspaperIcon,
} from '@heroicons/react/24/outline';

export type DesktopWidgetsPanelProps = {
	widgetsLayout: DesktopWidgetsLayout;
	workspaceProfiles: DesktopWorkspaceProfile[];
	activeDesktopId: string;
	panelPosition: WidgetsPanelPosition;
	compactWidgetsGlobal: boolean;
	widgetsStyle: DesktopWidgetsStyle;
	appCollections: DesktopAppCollection[];
	contentShortcuts: DesktopContentShortcut[];
	recentOpened: RecentFile[];
	desktopUnreadCount: number;
	markAllAsRead: () => void;
	onOpenNotificationCenter: () => void;
	onOpenEwDesk: () => void;
	onOpenMusicPlayer: () => void;
	onOpenContentShortcut: (id: string) => void;
	onOpenAppCollection: (id: string) => void;
	onOpenRecentFile: (file: RecentFile) => void;
	/** Сдвиг от якоря (сохраняется в `shell_state.widgets_layout.panelOffset`). */
	panelOffset: { x: number; y: number };
	onPanelOffsetCommit?: (next: { x: number; y: number }) => void;
	/** Свободная раскладка: зафиксировать позицию слота (layout px). */
	onSlotPositionCommit?: (
		slotId: string,
		next: { x: number; y: number }
	) => void;
	/** Свободная раскладка: сдвинуть все включённые слоты на дельту (layout px). */
	onAllWidgetSlotsOffsetCommit?: (delta: { x: number; y: number }) => void;
	/** Дозаполнить отсутствующие координаты при `slotPlacement: free`. */
	onEnsureFreeSlotPositions?: () => void;
	/** Режим expanded: открыть контент в отдельном окне приложения. */
	onOpenWidgetSlotExpanded?: (type: DesktopWidgetLayoutSlot['type']) => void;
};

const PANEL_POSITION_CLASS: Record<WidgetsPanelPosition, string> = {
	'top-right': 'top-4 right-4',
	'top-left': 'top-4 left-4',
	'bottom-right': 'bottom-20 right-4',
	'bottom-left': 'bottom-20 left-4',
};

function slotEffectiveCompact(
	slot: DesktopWidgetLayoutSlot,
	compactWidgetsGlobal: boolean
): boolean {
	return compactWidgetsGlobal || slot.mode === 'compact';
}

const PanelNowPlaying = React.memo(function PanelNowPlaying({
	compact,
	onOpenMusicPlayer,
}: {
	compact: boolean;
	onOpenMusicPlayer: () => void;
}) {
	const { t } = useTranslation('desktopUi');
	const np = useNowPlayingTransport();
	const currentTime = useNowPlayingTime();
	const { hasPrev, hasNext } = useMusicPlaybackDomain();

	if (!np.track) {
		return (
			<p
				className={cn(DESKTOP_TYPOGRAPHY.caption, 'text-(--desktop-text-dim)')}
			>
				{t('settingsPanel.widgetsPanel.nowPlayingEmpty')}
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<DesktopChromeTooltip
				content={`${t('settingsPanel.widgetsPanel.openApp')}: ${np.track.name}`}
				placement="top"
				offsetExtra={4}
			>
				<button
					type="button"
					onClick={onOpenMusicPlayer}
					className={cn(
						'flex w-full min-w-0 items-start gap-2 rounded-xl p-1.5 text-left transition-colors',
						'hover:bg-(--desktop-surface-soft) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
					)}
				>
					<div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-(--desktop-border-subtle)">
						<ContentThumbnail
							contentId={np.track.id}
							className="h-full w-full object-cover"
							skipThumbnail
						>
							<div className="flex h-full w-full items-center justify-center bg-transparent">
								<MusicalNoteIcon className="h-4 w-4 text-(--desktop-text-muted)" />
							</div>
						</ContentThumbnail>
					</div>
					<div className="min-w-0 flex-1">
						<p
							className={cn(
								DESKTOP_TYPOGRAPHY.caption,
								'text-(--desktop-text-dim)'
							)}
						>
							{t('settingsPanel.widgetSlot.now-playing')}
						</p>
						<p className={DESKTOP_TYPOGRAPHY.widgetTrackTitle}>
							{np.track.name}
						</p>
						{!compact && np.duration > 0 && (
							<p
								className={cn(
									DESKTOP_TYPOGRAPHY.caption,
									'text-(--desktop-text-dim) tabular-nums'
								)}
							>
								{formatDuration(currentTime)} / {formatDuration(np.duration)}
							</p>
						)}
						<NowPlayingLoadHint
							compact
							className="mt-1"
							isLoadingStalled={np.isLoadingStalled}
							error={
								np.error ??
								(np.errorTrackId
									? t('settingsPanel.widgetsPanel.playbackError')
									: null)
							}
							onRetry={() => {
								void np.retryCurrentTrack();
							}}
						/>
					</div>
				</button>
			</DesktopChromeTooltip>
			{!compact && (
				<div
					className="rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5"
					onPointerDown={(e) => e.stopPropagation()}
				>
					<MiniAudioControls
						compact
						className="w-full"
						playing={np.playing}
						isLoading={np.isLoading}
						isLoadingStalled={np.isLoadingStalled}
						hasPrev={hasPrev}
						hasNext={hasNext}
						onTogglePlayPause={np.togglePlayPause}
						onPrev={np.prev}
						onNext={np.next}
						currentTime={currentTime}
						duration={np.duration}
						bufferedRanges={np.bufferedRanges}
						onSeek={np.seek}
						volume={np.volume}
						onVolumeChange={np.setVolume}
						playbackError={
							np.error ??
							(np.errorTrackId
								? t('settingsPanel.widgetsPanel.playbackError')
								: null)
						}
						onRetryPlayback={() => {
							void np.retryCurrentTrack();
						}}
					/>
				</div>
			)}
		</div>
	);
});

function NotesSlotBody({ compact }: { compact: boolean }) {
	const { t } = useTranslation('desktopUi');
	const { t: tWorkspace } = useTranslation('desktopUi', {
		keyPrefix: 'workspace',
	});
	const { notes, isLoading, isLocalOnly, storageWriteFailed } =
		useWidgetNotes();

	const localOnlyBanner = isLocalOnly ? (
		<p
			className={cn(DESKTOP_TYPOGRAPHY.caption, 'text-(--desktop-text-dim)')}
			data-local-only="true"
		>
			{tWorkspace('localOnlyHint')}
		</p>
	) : null;
	const storageFailedBanner = storageWriteFailed ? (
		<p
			className={cn(DESKTOP_TYPOGRAPHY.caption, 'text-(--desktop-text-dim)')}
			role="alert"
		>
			{tWorkspace('localStorageWriteFailed')}
		</p>
	) : null;

	if (isLoading && notes.length === 0) {
		return (
			<div
				className="flex flex-col gap-1.5"
				data-local-only={isLocalOnly ? 'true' : undefined}
			>
				{localOnlyBanner}
				{storageFailedBanner}
				<p className={DESKTOP_TYPOGRAPHY.caption}>
					{t('settingsPanel.widgetsPanel.loading')}
				</p>
			</div>
		);
	}
	if (notes.length === 0) {
		return (
			<div
				className="flex flex-col gap-1.5"
				data-local-only={isLocalOnly ? 'true' : undefined}
			>
				{localOnlyBanner}
				{storageFailedBanner}
				<p className={DESKTOP_TYPOGRAPHY.caption}>
					{t('settingsPanel.widgetsPanel.notesEmpty')}
				</p>
			</div>
		);
	}
	if (compact) {
		const preview = notes[0]?.content?.trim().slice(0, 80) ?? '';
		return (
			<div
				className="flex flex-col gap-1.5"
				data-local-only={isLocalOnly ? 'true' : undefined}
			>
				{localOnlyBanner}
				{storageFailedBanner}
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'line-clamp-2 text-(--desktop-text-secondary)'
					)}
				>
					{t('settingsPanel.widgetsPanel.notesSummary', {
						count: notes.length,
						preview,
					})}
				</p>
			</div>
		);
	}
	return (
		<div
			className="flex flex-col gap-1.5"
			data-local-only={isLocalOnly ? 'true' : undefined}
		>
			{localOnlyBanner}
			{storageFailedBanner}
			<ul className="max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
				{notes.slice(0, 6).map((n) => (
					<li
						key={n.id}
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'wrap-break-word rounded-md border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 text-(--desktop-text-secondary)'
						)}
					>
						{n.content?.trim() || t('settingsPanel.widgetsPanel.emptyNote')}
					</li>
				))}
			</ul>
		</div>
	);
}

function TodosSlotBody({ compact }: { compact: boolean }) {
	const { t } = useTranslation('desktopUi');
	const { t: tWorkspace } = useTranslation('desktopUi', {
		keyPrefix: 'workspace',
	});
	const { todos, isLoading, isLocalOnly, storageWriteFailed } =
		useWidgetTodos();

	const localOnlyBanner = isLocalOnly ? (
		<p
			className={cn(DESKTOP_TYPOGRAPHY.caption, 'text-(--desktop-text-dim)')}
			data-local-only="true"
		>
			{tWorkspace('localOnlyHint')}
		</p>
	) : null;
	const storageFailedBanner = storageWriteFailed ? (
		<p
			className={cn(DESKTOP_TYPOGRAPHY.caption, 'text-(--desktop-text-dim)')}
			role="alert"
		>
			{tWorkspace('localStorageWriteFailed')}
		</p>
	) : null;

	if (isLoading && todos.length === 0) {
		return (
			<div
				className="flex flex-col gap-1.5"
				data-local-only={isLocalOnly ? 'true' : undefined}
			>
				{localOnlyBanner}
				{storageFailedBanner}
				<p className={DESKTOP_TYPOGRAPHY.caption}>
					{t('settingsPanel.widgetsPanel.loading')}
				</p>
			</div>
		);
	}
	const open = todos.filter((x) => !x.completed).length;
	if (todos.length === 0) {
		return (
			<div
				className="flex flex-col gap-1.5"
				data-local-only={isLocalOnly ? 'true' : undefined}
			>
				{localOnlyBanner}
				{storageFailedBanner}
				<p className={DESKTOP_TYPOGRAPHY.caption}>
					{t('settingsPanel.widgetsPanel.todosEmpty')}
				</p>
			</div>
		);
	}
	if (compact) {
		return (
			<div
				className="flex flex-col gap-1.5"
				data-local-only={isLocalOnly ? 'true' : undefined}
			>
				{localOnlyBanner}
				{storageFailedBanner}
				<p className={DESKTOP_TYPOGRAPHY.caption}>
					{t('settingsPanel.widgetsPanel.todosSummary', {
						open,
						total: todos.length,
					})}
				</p>
			</div>
		);
	}
	return (
		<div
			className="flex flex-col gap-1.5"
			data-local-only={isLocalOnly ? 'true' : undefined}
		>
			{localOnlyBanner}
			{storageFailedBanner}
			<ul className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
				{todos.slice(0, 8).map((td) => (
					<li
						key={td.id}
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'flex items-start gap-2 rounded-md border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1 text-(--desktop-text-secondary)',
							td.completed && 'opacity-60 line-through'
						)}
					>
						<span className="min-w-0 flex-1 wrap-break-word">{td.text}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function ProjectShortcutsSlotBody({
	compact,
	appCollections,
	contentShortcuts,
	onOpenContentShortcut,
	onOpenAppCollection,
}: Pick<
	DesktopWidgetsPanelProps,
	| 'appCollections'
	| 'contentShortcuts'
	| 'onOpenContentShortcut'
	| 'onOpenAppCollection'
> & { compact: boolean }) {
	const { t } = useTranslation('desktopUi');
	const filteredShortcuts = useMemo(
		() =>
			contentShortcuts.filter(
				(s) =>
					s.type === 'project-folder' ||
					s.type === 'saved-filter' ||
					s.type === 'desktop-folder'
			),
		[contentShortcuts]
	);
	const maxC = compact ? 2 : 4;
	const maxS = compact ? 3 : 6;
	const collections = appCollections.slice(0, maxC);
	const shortcuts = filteredShortcuts.slice(0, maxS);

	if (collections.length === 0 && shortcuts.length === 0) {
		return (
			<p className={DESKTOP_TYPOGRAPHY.caption}>
				{t('settingsPanel.widgetsPanel.projectShortcutsEmpty')}
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{collections.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{collections.map((c) => (
						<DesktopChromeTooltip
							key={c.id}
							content={c.name}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="neutral"
								size="sm"
								className="h-auto min-h-0 max-w-full px-2 py-1 text-[11px] font-medium"
								onClick={() => onOpenAppCollection(c.id)}
							>
								<span className="truncate">{c.name}</span>
							</DesktopAppButton>
						</DesktopChromeTooltip>
					))}
				</div>
			)}
			{shortcuts.length > 0 && (
				<ul className="space-y-1">
					{shortcuts.map((s) => (
						<li key={s.id}>
							<DesktopChromeTooltip
								content={s.label}
								placement="top"
								offsetExtra={4}
							>
								<button
									type="button"
									onClick={() => onOpenContentShortcut(s.id)}
									className={cn(
										DESKTOP_TYPOGRAPHY.caption,
										'w-full rounded-md px-2 py-1 text-left text-(--desktop-text-secondary) transition-colors',
										'hover:bg-(--desktop-surface-soft) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
									)}
								>
									<span className="line-clamp-2">{s.label}</span>
								</button>
							</DesktopChromeTooltip>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function RecentContentSlotBody({
	compact,
	recentOpened,
	onOpenRecentFile,
}: Pick<DesktopWidgetsPanelProps, 'recentOpened' | 'onOpenRecentFile'> & {
	compact: boolean;
}) {
	const { t } = useTranslation('desktopUi');
	const rows = compact ? recentOpened.slice(0, 3) : recentOpened.slice(0, 6);
	if (rows.length === 0) {
		return (
			<p className={DESKTOP_TYPOGRAPHY.caption}>
				{t('settingsPanel.widgetsPanel.recentEmpty')}
			</p>
		);
	}
	return (
		<ul className="space-y-0.5">
			{rows.map((f) => (
				<li key={f.id}>
					<DesktopChromeTooltip
						content={f.name}
						placement="top"
						offsetExtra={4}
					>
						<button
							type="button"
							onClick={() => onOpenRecentFile(f)}
							className={cn(
								DESKTOP_TYPOGRAPHY.caption,
								'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-(--desktop-text-secondary) transition-colors',
								'hover:bg-(--desktop-surface-soft) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
							)}
						>
							<NewspaperIcon
								className="h-3.5 w-3.5 shrink-0 opacity-70"
								aria-hidden
							/>
							<span className="min-w-0 truncate">{f.name}</span>
						</button>
					</DesktopChromeTooltip>
				</li>
			))}
		</ul>
	);
}

function useWidgetWorkAreaVersion(): number {
	const [v, setV] = useState(0);
	useEffect(() => {
		const bump = () => setV((n) => n + 1);
		const main = document.getElementById('desktop-main');
		const ro =
			typeof ResizeObserver !== 'undefined' ? new ResizeObserver(bump) : null;
		if (main && ro) ro.observe(main);
		window.addEventListener('resize', bump);
		return () => {
			ro?.disconnect();
			window.removeEventListener('resize', bump);
		};
	}, []);
	return v;
}

function ExpandedSlotPlaceholder({
	slotType,
	onOpen,
}: {
	slotType: DesktopWidgetLayoutSlot['type'];
	onOpen?: (type: DesktopWidgetLayoutSlot['type']) => void;
}) {
	const { t } = useTranslation('desktopUi');
	return (
		<div className="flex flex-col gap-2 py-0.5">
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.caption,
					'text-(--desktop-text-secondary)'
				)}
			>
				{t('settingsPanel.widgetsPanel.expandedSlotHint')}
			</p>
			{onOpen ? (
				<DesktopChromeTooltip
					content={t('settingsPanel.widgetsPanel.openExpandedApp')}
					placement="top"
					offsetExtra={4}
				>
					<DesktopAppButton
						type="button"
						size="sm"
						onClick={() => onOpen(slotType)}
					>
						{t('settingsPanel.widgetsPanel.openExpandedApp')}
					</DesktopAppButton>
				</DesktopChromeTooltip>
			) : null}
		</div>
	);
}

export function DesktopWidgetsPanel({
	widgetsLayout,
	workspaceProfiles,
	activeDesktopId,
	panelPosition,
	compactWidgetsGlobal,
	widgetsStyle,
	appCollections,
	contentShortcuts,
	recentOpened,
	desktopUnreadCount,
	markAllAsRead,
	onOpenNotificationCenter,
	onOpenEwDesk,
	onOpenMusicPlayer,
	onOpenContentShortcut,
	onOpenAppCollection,
	onOpenRecentFile,
	panelOffset,
	onPanelOffsetCommit,
	onSlotPositionCommit,
	onAllWidgetSlotsOffsetCommit,
	onEnsureFreeSlotPositions,
	onOpenWidgetSlotExpanded,
}: DesktopWidgetsPanelProps) {
	const { t } = useTranslation('desktopUi');
	const slotPlacement: DesktopWidgetsSlotPlacement =
		widgetsLayout.slotPlacement === 'free' ? 'free' : 'stacked';
	const workAreaVersion = useWidgetWorkAreaVersion();

	const rootRef = useRef<HTMLDivElement | null>(null);
	const dragStartRef = useRef<{ x: number; y: number } | null>(null);
	const [drag, setDrag] = useState({ dx: 0, dy: 0 });

	const freeStripDragRef = useRef<{ x: number; y: number } | null>(null);
	const [freeStripDrag, setFreeStripDrag] = useState({ dx: 0, dy: 0 });

	const slotDragRef = useRef<{
		slotId: string;
		clientStartX: number;
		clientStartY: number;
		origX: number;
		origY: number;
	} | null>(null);
	const [slotDragLive, setSlotDragLive] = useState<{
		id: string;
		dx: number;
		dy: number;
	} | null>(null);

	const ox = panelOffset.x;
	const oy = panelOffset.y;

	const fallbackPos = useMemo(() => {
		void workAreaVersion;
		const work = readDesktopWorkArea();
		return computeInitialFreeSlotPositions(
			widgetsLayout.slots,
			panelPosition,
			work.width,
			work.height,
			panelOffset,
			compactWidgetsGlobal
		);
	}, [
		widgetsLayout.slots,
		panelPosition,
		panelOffset,
		compactWidgetsGlobal,
		workAreaVersion,
	]);

	const slots = useMemo(
		() =>
			filterDesktopWidgetSlots(
				widgetsLayout,
				activeDesktopId,
				workspaceProfiles
			),
		[widgetsLayout, activeDesktopId, workspaceProfiles]
	);

	useLayoutEffect(() => {
		if (slotPlacement !== 'free' || !onEnsureFreeSlotPositions) return;
		if (!widgetsLayout.slots.some((s) => s.enabled && s.position == null)) {
			return;
		}
		void onEnsureFreeSlotPositions();
	}, [slotPlacement, widgetsLayout.slots, onEnsureFreeSlotPositions]);

	const handlePanelDragPointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!onPanelOffsetCommit || e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			dragStartRef.current = { x: e.clientX, y: e.clientY };
			(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
		},
		[onPanelOffsetCommit]
	);

	const handlePanelDragPointerMove = useCallback((e: React.PointerEvent) => {
		if (!dragStartRef.current) return;
		setDrag({
			dx: e.clientX - dragStartRef.current.x,
			dy: e.clientY - dragStartRef.current.y,
		});
	}, []);

	const cancelPanelDragVisual = useCallback(() => {
		dragStartRef.current = null;
		setDrag({ dx: 0, dy: 0 });
	}, []);

	const handlePanelDragPointerUp = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!dragStartRef.current || !onPanelOffsetCommit) {
				cancelPanelDragVisual();
				return;
			}
			const start = dragStartRef.current;
			dragStartRef.current = null;
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			const dx = e.clientX - start.x;
			const dy = e.clientY - start.y;
			setDrag({ dx: 0, dy: 0 });
			const el = rootRef.current;
			if (!el) return;
			const pad = 8;
			const tb = DESKTOP_LAYOUT.TASKBAR_HEIGHT_PX;
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			let nx = ox + dx;
			let ny = oy + dy;
			el.style.transform = `translate3d(${nx}px, ${ny}px, 0)`;
			const r = el.getBoundingClientRect();
			el.style.transform = '';
			if (r.left < pad) nx += pad - r.left;
			if (r.top < pad) ny += pad - r.top;
			if (r.right > vw - pad) nx -= r.right - (vw - pad);
			if (r.bottom > vh - tb - pad) ny -= r.bottom - (vh - tb - pad);
			onPanelOffsetCommit({ x: Math.round(nx), y: Math.round(ny) });
		},
		[cancelPanelDragVisual, ox, oy, onPanelOffsetCommit]
	);

	const handlePanelDragPointerCancel = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!dragStartRef.current) return;
			dragStartRef.current = null;
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			setDrag({ dx: 0, dy: 0 });
		},
		[]
	);

	const cancelFreeStripDrag = useCallback(() => {
		freeStripDragRef.current = null;
		setFreeStripDrag({ dx: 0, dy: 0 });
	}, []);

	const handleFreeStripPointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!onAllWidgetSlotsOffsetCommit || e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			freeStripDragRef.current = { x: e.clientX, y: e.clientY };
			(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
		},
		[onAllWidgetSlotsOffsetCommit]
	);

	const handleFreeStripPointerMove = useCallback((e: React.PointerEvent) => {
		if (!freeStripDragRef.current) return;
		setFreeStripDrag({
			dx: e.clientX - freeStripDragRef.current.x,
			dy: e.clientY - freeStripDragRef.current.y,
		});
	}, []);

	const handleFreeStripPointerUp = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!freeStripDragRef.current || !onAllWidgetSlotsOffsetCommit) {
				cancelFreeStripDrag();
				return;
			}
			const start = freeStripDragRef.current;
			freeStripDragRef.current = null;
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			setFreeStripDrag({ dx: 0, dy: 0 });
			const work = readDesktopWorkArea();
			const dx = Math.round((e.clientX - start.x) / work.layoutScale);
			const dy = Math.round((e.clientY - start.y) / work.layoutScale);
			if (dx !== 0 || dy !== 0) {
				onAllWidgetSlotsOffsetCommit({ x: dx, y: dy });
			}
		},
		[cancelFreeStripDrag, onAllWidgetSlotsOffsetCommit]
	);

	const handleFreeStripPointerCancel = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!freeStripDragRef.current) return;
			freeStripDragRef.current = null;
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			setFreeStripDrag({ dx: 0, dy: 0 });
		},
		[]
	);

	const handleSlotDragPointerDown = useCallback(
		(slotId: string, base: { x: number; y: number }) =>
			(e: React.PointerEvent<HTMLDivElement>) => {
				if (!onSlotPositionCommit || e.button !== 0) return;
				e.preventDefault();
				e.stopPropagation();
				slotDragRef.current = {
					slotId,
					clientStartX: e.clientX,
					clientStartY: e.clientY,
					origX: base.x,
					origY: base.y,
				};
				(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
			},
		[onSlotPositionCommit]
	);

	const handleSlotDragPointerMove = useCallback((e: React.PointerEvent) => {
		const s = slotDragRef.current;
		if (!s) return;
		setSlotDragLive({
			id: s.slotId,
			dx: e.clientX - s.clientStartX,
			dy: e.clientY - s.clientStartY,
		});
	}, []);

	const handleSlotDragPointerUp = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const s = slotDragRef.current;
			if (!s || !onSlotPositionCommit) {
				slotDragRef.current = null;
				setSlotDragLive(null);
				return;
			}
			slotDragRef.current = null;
			setSlotDragLive(null);
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			const work = readDesktopWorkArea();
			const sc = work.layoutScale;
			const dx = (e.clientX - s.clientStartX) / sc;
			const dy = (e.clientY - s.clientStartY) / sc;
			const card = e.currentTarget.closest(
				'[data-widget-slot-card]'
			) as HTMLElement | null;
			const h = card?.offsetHeight ?? 180;
			const next = clampWidgetPositionInWorkArea(
				{ x: s.origX + dx, y: s.origY + dy },
				work.width,
				work.height,
				WIDGET_SLOT_CARD_WIDTH_LAYOUT,
				h,
				WIDGET_WORK_MARGIN_PX
			);
			onSlotPositionCommit(s.slotId, next);
		},
		[onSlotPositionCommit]
	);

	const handleSlotDragPointerCancel = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!slotDragRef.current) return;
			slotDragRef.current = null;
			setSlotDragLive(null);
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
		},
		[]
	);

	const tier = getDesktopWindowShellTier(widgetsStyle);
	const preset =
		DESKTOP_WINDOW_FRAME_STYLES[widgetsStyle] ??
		DESKTOP_WINDOW_FRAME_STYLES.glass;
	const width = tier === 'minimal' ? 'w-72 min-w-72' : 'w-80 min-w-80';
	const radius =
		tier === 'minimal'
			? 'rounded-xl'
			: tier === 'framed'
				? 'rounded-2xl'
				: 'rounded-[1.35rem]';

	if (slots.length === 0) return null;

	const layoutScale = readDesktopWorkArea().layoutScale;

	const renderSlotBody = (slot: DesktopWidgetLayoutSlot) => {
		if (slot.mode === 'expanded') {
			return (
				<ExpandedSlotPlaceholder
					slotType={slot.type}
					onOpen={onOpenWidgetSlotExpanded}
				/>
			);
		}
		const compact = slotEffectiveCompact(slot, compactWidgetsGlobal);
		return (
			<>
				{slot.type === 'notes' && <NotesSlotBody compact={compact} />}
				{slot.type === 'todos' && <TodosSlotBody compact={compact} />}
				{slot.type === 'favorites' && (
					<DashboardFavoritesSlotBody compact={compact} />
				)}
				{slot.type === 'ewdesk' && (
					<EwDeskWidgetPreview
						compact={compact}
						onOpenEwDesk={onOpenEwDesk}
						onOpenPost={(postId) => {
							requestOpenDesktopApp({
								appComponent: 'EWDeskApp',
								initialPayload: { ewDeskNewsId: postId },
							});
						}}
					/>
				)}
				{slot.type === 'notifications' && (
					<div className="flex flex-col gap-2">
						<p className={DESKTOP_TYPOGRAPHY.caption}>
							{t('settingsPanel.widgetsPanel.notificationsSummary', {
								count: desktopUnreadCount,
							})}
						</p>
						<div className="flex flex-wrap gap-2">
							<DesktopChromeTooltip
								content={t('settingsPanel.widgetsPanel.openCenter')}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									variant="neutral"
									size="sm"
									onClick={onOpenNotificationCenter}
								>
									{t('settingsPanel.widgetsPanel.openCenter')}
								</DesktopAppButton>
							</DesktopChromeTooltip>
							{desktopUnreadCount > 0 && (
								<DesktopChromeTooltip
									content={t('settingsPanel.widgetsPanel.markAllRead')}
									placement="top"
									offsetExtra={4}
								>
									<DesktopAppButton
										type="button"
										variant="ghost"
										size="sm"
										onClick={markAllAsRead}
									>
										{t('settingsPanel.widgetsPanel.markAllRead')}
									</DesktopAppButton>
								</DesktopChromeTooltip>
							)}
						</div>
					</div>
				)}
				{slot.type === 'now-playing' && (
					<PanelNowPlaying
						compact={compact}
						onOpenMusicPlayer={onOpenMusicPlayer}
					/>
				)}
				{slot.type === 'project-shortcuts' && (
					<ProjectShortcutsSlotBody
						compact={compact}
						appCollections={appCollections}
						contentShortcuts={contentShortcuts}
						onOpenContentShortcut={onOpenContentShortcut}
						onOpenAppCollection={onOpenAppCollection}
					/>
				)}
				{slot.type === 'recent-content' && (
					<RecentContentSlotBody
						compact={compact}
						recentOpened={recentOpened}
						onOpenRecentFile={onOpenRecentFile}
					/>
				)}
			</>
		);
	};

	if (slotPlacement === 'free') {
		return (
			<div
				data-desktop-welcome-guide="widgets-panel"
				className="pointer-events-none absolute inset-0 max-h-full min-h-0"
				style={{ zIndex: DESKTOP_Z_INDEX.PANEL }}
			>
				{onAllWidgetSlotsOffsetCommit ? (
					<DesktopChromeTooltip
						content={t('settingsPanel.widgetsPanel.freeStripDragHint')}
						placement="bottom"
						offsetExtra={6}
					>
						<div
							role="toolbar"
							aria-label={t('settingsPanel.widgetsPanel.freeStripDragAria')}
							className={cn(
								'pointer-events-auto absolute left-1/2 top-3 z-10 flex cursor-grab touch-none items-center gap-2 rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/95 px-3 py-1.5 shadow-(--desktop-shadow-panel) backdrop-blur-xl active:cursor-grabbing',
								'text-(--desktop-text-muted) select-none'
							)}
							style={{
								transform: `translate3d(calc(-50% + ${freeStripDrag.dx}px), ${freeStripDrag.dy}px, 0)`,
							}}
							onPointerDown={handleFreeStripPointerDown}
							onPointerMove={handleFreeStripPointerMove}
							onPointerUp={handleFreeStripPointerUp}
							onPointerCancel={handleFreeStripPointerCancel}
						>
							<Bars2Icon
								className="size-4 shrink-0"
								strokeWidth={DESKTOP_LUCIDE.stroke}
								aria-hidden
							/>
							<span className={DESKTOP_TYPOGRAPHY.caption}>
								{t('settingsPanel.widgetsPanel.freeStripDragHint')}
							</span>
						</div>
					</DesktopChromeTooltip>
				) : null}
				{slots.map((slot) => {
					const base = slot.position ??
						fallbackPos[slot.id] ?? {
							x: WIDGET_WORK_MARGIN_PX,
							y: WIDGET_WORK_MARGIN_PX,
						};
					const live = slotDragLive?.id === slot.id ? slotDragLive : null;
					const dx = live ? live.dx / layoutScale : 0;
					const dy = live ? live.dy / layoutScale : 0;
					return (
						<section
							key={slot.id}
							data-widget-slot-card
							data-desktop-welcome-guide={
								slot.type === 'favorites' ? 'favorites-widget' : undefined
							}
							aria-label={t(`settingsPanel.widgetSlot.${slot.type}`)}
							className={cn(
								'pointer-events-auto absolute max-h-[min(72vh,calc(100%-5rem))] overflow-hidden border border-(--desktop-border-subtle) shadow-(--desktop-shadow-panel)',
								width,
								radius,
								preset.frame,
								'bg-(--desktop-surface-panel)/90 backdrop-blur-xl'
							)}
							style={{
								left: base.x + dx,
								top: base.y + dy,
							}}
						>
							<div className="flex max-h-full flex-col overflow-hidden">
								<div className="flex max-h-full flex-col overflow-hidden px-2.5 py-2">
									<div className="mb-1.5 flex items-center justify-between gap-2">
										<div className="flex min-w-0 flex-1 items-center gap-1">
											{onSlotPositionCommit ? (
												<DesktopChromeTooltip
													content={t(
														'settingsPanel.widgetsPanel.slotDragHandleAria'
													)}
													placement="top"
													offsetExtra={4}
												>
													<div
														role="presentation"
														aria-label={t(
															'settingsPanel.widgetsPanel.slotDragHandleAria'
														)}
														className={cn(
															'flex shrink-0 cursor-grab touch-none rounded-md p-0.5 active:cursor-grabbing',
															'text-(--desktop-text-muted)'
														)}
														onPointerDown={handleSlotDragPointerDown(
															slot.id,
															base
														)}
														onPointerMove={handleSlotDragPointerMove}
														onPointerUp={handleSlotDragPointerUp}
														onPointerCancel={handleSlotDragPointerCancel}
													>
														<Bars2Icon
															className="size-4"
															strokeWidth={DESKTOP_LUCIDE.stroke}
															aria-hidden
														/>
													</div>
												</DesktopChromeTooltip>
											) : null}
											<h3
												className={cn(
													DESKTOP_TYPOGRAPHY.labelOverline,
													'min-w-0 truncate text-(--desktop-text-primary)'
												)}
											>
												{t(`settingsPanel.widgetSlot.${slot.type}`)}
											</h3>
										</div>
										{slot.mode !== 'expanded' && slot.type === 'ewdesk' && (
											<DesktopChromeTooltip
												content={t('settingsPanel.widgetsPanel.openApp')}
												placement="top"
												offsetExtra={4}
											>
												<DesktopAppButton
													type="button"
													variant="ghost"
													size="sm"
													className="h-auto min-h-0 shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
													onClick={onOpenEwDesk}
												>
													{t('settingsPanel.widgetsPanel.openApp')}
												</DesktopAppButton>
											</DesktopChromeTooltip>
										)}
										{slot.mode !== 'expanded' &&
											slot.type === 'now-playing' && (
												<DesktopChromeTooltip
													content={t('settingsPanel.widgetsPanel.openApp')}
													placement="top"
													offsetExtra={4}
												>
													<DesktopAppButton
														type="button"
														variant="ghost"
														size="sm"
														className="h-auto min-h-0 shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
														onClick={onOpenMusicPlayer}
													>
														{t('settingsPanel.widgetsPanel.openApp')}
													</DesktopAppButton>
												</DesktopChromeTooltip>
											)}
									</div>
									<div className="min-h-0 flex-1 overflow-y-auto">
										{renderSlotBody(slot)}
									</div>
								</div>
							</div>
						</section>
					);
				})}
			</div>
		);
	}

	const panelTranslate = `translate3d(${ox + drag.dx}px, ${oy + drag.dy}px, 0)`;

	return (
		<aside
			ref={rootRef}
			data-desktop-welcome-guide="widgets-panel"
			aria-label={t('settingsPanel.widgetsPanel.ariaLabel')}
			className={cn(
				'pointer-events-auto absolute max-h-[min(72vh,calc(100%-5rem))] overflow-hidden',
				PANEL_POSITION_CLASS[panelPosition]
			)}
			style={{
				zIndex: DESKTOP_Z_INDEX.PANEL,
				transform: panelTranslate,
			}}
		>
			<div
				className={cn(
					'flex max-h-full flex-col overflow-hidden border border-(--desktop-border-subtle) shadow-(--desktop-shadow-panel)',
					width,
					radius,
					preset.frame,
					'backdrop-blur-xl'
				)}
			>
				{onPanelOffsetCommit ? (
					<DesktopChromeTooltip
						content={t('settingsPanel.widgetsPanel.dragHandleAria')}
						placement="top"
						offsetExtra={4}
					>
						<div
							role="toolbar"
							aria-label={t('settingsPanel.widgetsPanel.dragHandleAria')}
							className={cn(
								'flex shrink-0 cursor-grab touch-none items-center gap-2 border-b border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/90 px-2 py-1.5 active:cursor-grabbing',
								'text-(--desktop-text-muted) select-none'
							)}
							onPointerDown={handlePanelDragPointerDown}
							onPointerMove={handlePanelDragPointerMove}
							onPointerUp={handlePanelDragPointerUp}
							onPointerCancel={handlePanelDragPointerCancel}
						>
							<Bars2Icon
								className="size-4 shrink-0"
								strokeWidth={DESKTOP_LUCIDE.stroke}
								aria-hidden
							/>
							<span className={DESKTOP_TYPOGRAPHY.caption}>
								{t('settingsPanel.widgetsPanel.dragHint')}
							</span>
						</div>
					</DesktopChromeTooltip>
				) : null}
				<div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
					<div className="flex flex-col gap-3">
						{slots.map((slot) => (
							<section
								key={slot.id}
								data-desktop-welcome-guide={
									slot.type === 'favorites' ? 'favorites-widget' : undefined
								}
								aria-label={t(`settingsPanel.widgetSlot.${slot.type}`)}
								className="rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/80 px-2.5 py-2"
							>
								<div className="mb-1.5 flex items-center justify-between gap-2">
									<h3
										className={cn(
											DESKTOP_TYPOGRAPHY.labelOverline,
											'text-(--desktop-text-primary)'
										)}
									>
										{t(`settingsPanel.widgetSlot.${slot.type}`)}
									</h3>
									{slot.mode !== 'expanded' && slot.type === 'ewdesk' && (
										<DesktopChromeTooltip
											content={t('settingsPanel.widgetsPanel.openApp')}
											placement="top"
											offsetExtra={4}
										>
											<DesktopAppButton
												type="button"
												variant="ghost"
												size="sm"
												className="h-auto min-h-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
												onClick={onOpenEwDesk}
											>
												{t('settingsPanel.widgetsPanel.openApp')}
											</DesktopAppButton>
										</DesktopChromeTooltip>
									)}
									{slot.mode !== 'expanded' && slot.type === 'now-playing' && (
										<DesktopChromeTooltip
											content={t('settingsPanel.widgetsPanel.openApp')}
											placement="top"
											offsetExtra={4}
										>
											<DesktopAppButton
												type="button"
												variant="ghost"
												size="sm"
												className="h-auto min-h-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
												onClick={onOpenMusicPlayer}
											>
												{t('settingsPanel.widgetsPanel.openApp')}
											</DesktopAppButton>
										</DesktopChromeTooltip>
									)}
								</div>
								{renderSlotBody(slot)}
							</section>
						))}
					</div>
				</div>
			</div>
		</aside>
	);
}
