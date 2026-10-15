/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Hotspot-driven controls on Visual Studio live preview — edit prefs in-place via anchored popovers.
 *
 * Invariants:
 * - Reuses existing profile onChange callbacks; one popover open at a time.
 *
 * Related:
 * - `DesktopVisualStudioPreview.tsx`, `DesktopSettingsVisualStudioSection.tsx`
 */

import { cn } from '@/utils/cn';
import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type FC,
	type ReactNode,
	type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
	DESKTOP_FONT_BODY_KEYS,
	DESKTOP_FONT_DISPLAY_KEYS,
	DESKTOP_PANEL_OPACITY_MAX,
	DESKTOP_PANEL_OPACITY_MIN,
	DESKTOP_SCENE_DEPTH_KEYS,
	DESKTOP_SHELL_MOTION_SPEED_KEYS,
	DESKTOP_SHELL_PARALLAX_INTENSITY_KEYS,
	DESKTOP_TASKBAR_STYLE_KEYS,
	type DesktopFontBodyId,
	type DesktopFontDisplayId,
	type DesktopSceneDepth,
	type DesktopShellMotionSpeed,
	type DesktopShellParallaxIntensity,
	type DesktopTaskbarStyle,
	type DesktopWidgetsStyle,
	type DesktopWindowStyle,
} from '@/types/profile';
import { useDesktopWindowPortalStackBase } from '../../context/DesktopWindowPortalStackContext';
import { useDesktopPopoverOpenGuard } from '../../hooks/useDesktopPopoverOpenGuard';
import {
	DESKTOP_CHROME_FOCUS_VISIBLE,
	DesktopAppButton,
} from '../DesktopAppChrome';
import { DesktopShellFloatingPortal } from '../DesktopShellFloatingPortal';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import { DESKTOP_SHELL_PARALLAX_INTENSITY_SCALE } from '../../utils/resolveDesktopShellMotion';
import {
	DESKTOP_FONT_BODY_LABEL_KEYS,
	DESKTOP_FONT_DISPLAY_LABEL_KEYS,
	DESKTOP_SCENE_DEPTH_LABEL_KEYS,
	resolveDesktopFontDisplayStack,
	resolveDesktopFontFamilyStack,
} from '../../utils/desktopTypography';
import type { DesktopSettingsVisualLabels } from './desktopSettingsShared.types';
import {
	DesktopTaskbarStyleMiniPreview,
	DesktopWidgetsStyleMiniPreview,
	DesktopWindowStyleMiniPreview,
} from './desktopSettingsPreviewComponents';
import {
	DesktopVisualStudioPreview,
	type DesktopVisualStudioPreviewProps,
} from './DesktopVisualStudioPreview';
import {
	type VisualStudioPreviewHotspotHandlers,
	type VisualStudioPreviewHotspotId,
	type VisualStudioSettingsNavigateTarget,
	VISUAL_STUDIO_HOTSPOT_LEGEND_KEY,
	VISUAL_STUDIO_PREVIEW_HOTSPOT_ORDER,
	visualStudioHotspotNavigateTarget,
} from './desktopVisualStudioPreviewHotspots';

export type DesktopVisualStudioPreviewInteractiveProps =
	DesktopVisualStudioPreviewProps & {
		visualLabels: DesktopSettingsVisualLabels;
		onOpenWallpaperPicker: () => void;
		onDesktopWindowStyleChange: (value: DesktopWindowStyle) => void;
		onDesktopTaskbarStyleChange: (value: DesktopTaskbarStyle) => void;
		onDesktopWidgetsStyleChange: (value: DesktopWidgetsStyle) => void;
		onDesktopPanelOpacityChange: (value: number) => void;
		onDesktopSceneDepthChange: (value: DesktopSceneDepth) => void;
		onDesktopFontBodyChange: (value: DesktopFontBodyId) => void;
		onDesktopFontDisplayChange: (value: DesktopFontDisplayId) => void;
		onDesktopShellParallaxEnabledChange: (value: boolean) => void;
		onDesktopShellParallaxIntensityChange: (
			value: DesktopShellParallaxIntensity
		) => void;
		onDesktopShellWindowMorphEnabledChange: (value: boolean) => void;
		onDesktopShellMotionSpeedChange: (value: DesktopShellMotionSpeed) => void;
		onDesktopShellReduceMotionChange: (value: boolean) => void;
		onDesktopWallpaperCrossfadeChange: (value: boolean) => void;
		onDesktopStyledTooltipsChange: (value: boolean) => void;
		desktopWallpaperCrossfadeEnabled: boolean;
		desktopStyledTooltips: boolean;
		shellCheckboxClass: string;
		onNavigateSettingsField?: (
			target: VisualStudioSettingsNavigateTarget
		) => void;
	};

function segmentButtonClass(active: boolean): string {
	return cn(
		'rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition-colors outline-none',
		DESKTOP_CHROME_FOCUS_VISIBLE,
		active
			? 'border-[rgb(var(--desktop-accent-rgb))] bg-[rgb(var(--desktop-accent-rgb)/0.14)] text-(--desktop-text-primary)'
			: 'border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary) hover:border-(--desktop-border-strong)'
	);
}

function VisualStudioHotspotPopover({
	open,
	anchorRef,
	onClose,
	title,
	children,
	footer,
	width = 300,
}: {
	open: boolean;
	anchorRef: RefObject<HTMLElement | null>;
	onClose: () => void;
	title: string;
	children: ReactNode;
	footer?: ReactNode;
	width?: number;
}) {
	const baseId = useId();
	const portalStackBase = useDesktopWindowPortalStackBase();
	const panelRef = useRef<HTMLDivElement>(null);
	const openClickGuardRef = useDesktopPopoverOpenGuard(open);
	const [panelPos, setPanelPos] = useState<{
		top: number;
		left: number;
		width: number;
	} | null>(null);

	const updatePosition = useCallback(() => {
		const el = anchorRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const margin = 8;
		const panelW = Math.min(window.innerWidth - 2 * margin, width);
		let left = r.left + r.width / 2 - panelW / 2;
		if (left < margin) left = margin;
		if (left + panelW > window.innerWidth - margin) {
			left = window.innerWidth - panelW - margin;
		}
		const measuredHeight = panelRef.current?.offsetHeight ?? 0;
		const panelH = measuredHeight > 0 ? measuredHeight : 280;
		let top = r.bottom + 6;
		if (top + panelH > window.innerHeight - margin) {
			top = Math.max(margin, r.top - panelH - 6);
		}
		setPanelPos({ top, left, width: panelW });
	}, [anchorRef, width]);

	useLayoutEffect(() => {
		if (!open || !panelRef.current) return;
		const node = panelRef.current;
		const observer = new ResizeObserver(() => updatePosition());
		observer.observe(node);
		return () => observer.disconnect();
	}, [open, updatePosition]);

	useLayoutEffect(() => {
		if (!open) {
			setPanelPos(null);
			return;
		}
		updatePosition();
		const onScrollOrResize = () => updatePosition();
		window.addEventListener('resize', onScrollOrResize);
		window.addEventListener('scroll', onScrollOrResize, true);
		return () => {
			window.removeEventListener('resize', onScrollOrResize);
			window.removeEventListener('scroll', onScrollOrResize, true);
		};
	}, [open, updatePosition]);

	useEffect(() => {
		if (!open) return;
		const onDoc = (event: MouseEvent) => {
			if (openClickGuardRef.current) return;
			const target = event.target as Node;
			if (
				anchorRef.current?.contains(target) ||
				panelRef.current?.contains(target)
			) {
				return;
			}
			onClose();
		};
		document.addEventListener('mousedown', onDoc, true);
		return () => document.removeEventListener('mousedown', onDoc, true);
	}, [anchorRef, onClose, open, openClickGuardRef]);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [onClose, open]);

	if (!open || !panelPos) return null;

	return (
		<DesktopShellFloatingPortal>
			<div
				ref={panelRef}
				id={`${baseId}-panel`}
				role="dialog"
				aria-label={title}
				className={cn(
					'fixed max-h-[min(70vh,420px)] overflow-y-auto rounded-(--desktop-radius-lg) text-(--desktop-text-primary)',
					'border border-(--desktop-border-subtle) bg-(--desktop-surface-panel-strong)/97 p-3 backdrop-blur-md',
					'shadow-lg ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.14)]'
				)}
				style={{
					top: panelPos.top,
					left: panelPos.left,
					width: panelPos.width,
					zIndex: portalStackBase + 2,
				}}
				onPointerDown={(event) => event.stopPropagation()}
			>
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.captionInherit,
						'mb-2.5 font-semibold text-(--desktop-text-primary)'
					)}
				>
					{title}
				</p>
				{children}
				{footer ? (
					<div className="mt-3 border-t border-(--desktop-border-subtle)/80 pt-2.5">
						{footer}
					</div>
				) : null}
			</div>
		</DesktopShellFloatingPortal>
	);
}

export const DesktopVisualStudioPreviewInteractive: FC<
	DesktopVisualStudioPreviewInteractiveProps
> = ({
	visualLabels,
	onOpenWallpaperPicker,
	onDesktopWindowStyleChange,
	onDesktopTaskbarStyleChange,
	onDesktopWidgetsStyleChange,
	onDesktopPanelOpacityChange,
	onDesktopSceneDepthChange,
	onDesktopFontBodyChange,
	onDesktopFontDisplayChange,
	onDesktopShellParallaxEnabledChange,
	onDesktopShellParallaxIntensityChange,
	onDesktopShellWindowMorphEnabledChange,
	onDesktopShellMotionSpeedChange,
	onDesktopShellReduceMotionChange,
	onDesktopWallpaperCrossfadeChange,
	onDesktopStyledTooltipsChange,
	desktopWallpaperCrossfadeEnabled,
	desktopStyledTooltips,
	shellCheckboxClass,
	onNavigateSettingsField,
	desktopPanelOpacity,
	desktopTaskbarStyle,
	desktopWidgetsStyle,
	desktopWindowStyle,
	desktopSceneDepth,
	desktopFontBody,
	desktopFontDisplay,
	desktopShellReduceMotion,
	desktopShellParallaxEnabled,
	desktopShellParallaxIntensity,
	desktopShellWindowMorphEnabled,
	desktopShellMotionSpeed,
	...previewProps
}) => {
	const { t } = useTranslation('desktopUi');
	const [activeHotspot, setActiveHotspot] =
		useState<VisualStudioPreviewHotspotId | null>(null);
	const [previewHovered, setPreviewHovered] = useState(false);
	const anchorElementsRef = useRef<
		Partial<Record<VisualStudioPreviewHotspotId, HTMLElement>>
	>({});

	const registerAnchor = useCallback(
		(id: VisualStudioPreviewHotspotId, element: HTMLElement | null) => {
			if (element) {
				anchorElementsRef.current[id] = element;
				return;
			}
			delete anchorElementsRef.current[id];
		},
		[]
	);

	const anchorRefFor = (
		id: VisualStudioPreviewHotspotId
	): RefObject<HTMLElement | null> => ({
		get current() {
			return anchorElementsRef.current[id] ?? null;
		},
	});

	const toggleHotspot = useCallback((id: VisualStudioPreviewHotspotId) => {
		setActiveHotspot((prev) => (prev === id ? null : id));
	}, []);

	const closePopover = () => setActiveHotspot(null);

	const hotspotHandlers = useMemo<VisualStudioPreviewHotspotHandlers>(
		() => ({
			activeHotspot,
			onHotspotClick: toggleHotspot,
			pauseMorphDemo: activeHotspot !== null || previewHovered,
			registerAnchor,
		}),
		[activeHotspot, previewHovered, registerAnchor, toggleHotspot]
	);

	const previewDemoBadges = useMemo(() => {
		const parallaxScale =
			DESKTOP_SHELL_PARALLAX_INTENSITY_SCALE[desktopShellParallaxIntensity] ??
			1;
		return {
			parallax:
				!desktopShellReduceMotion &&
				desktopShellParallaxEnabled &&
				parallaxScale > 0,
			morph: !desktopShellReduceMotion && desktopShellWindowMorphEnabled,
		};
	}, [
		desktopShellParallaxEnabled,
		desktopShellParallaxIntensity,
		desktopShellReduceMotion,
		desktopShellWindowMorphEnabled,
	]);

	const popoverDetailFooter = (id: VisualStudioPreviewHotspotId): ReactNode => {
		if (!onNavigateSettingsField) return null;
		return (
			<button
				type="button"
				className={cn(
					'w-full text-left text-[11px] font-medium text-[rgb(var(--desktop-accent-rgb))] underline-offset-2 hover:underline',
					DESKTOP_CHROME_FOCUS_VISIBLE
				)}
				onClick={() => {
					onNavigateSettingsField(visualStudioHotspotNavigateTarget(id));
					closePopover();
				}}
			>
				{t('settingsPanel.visualStudio.hotspotOpenDetailCard')}
			</button>
		);
	};

	const renderWindowStylePopoverHeader = (style: DesktopWindowStyle) => (
		<div className="mb-3 overflow-hidden rounded-xl ring-1 ring-(--desktop-border-subtle)">
			<DesktopWindowStyleMiniPreview style={style} />
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.meta,
					'border-t border-(--desktop-border-subtle)/70 bg-(--desktop-surface-soft)/60 px-2.5 py-2 text-(--desktop-text-secondary)'
				)}
			>
				<span className="font-semibold text-(--desktop-text-primary)">
					{visualLabels.windowStyle[style]}
				</span>
				{' — '}
				{visualLabels.windowStyleDesc[style]}
			</p>
		</div>
	);

	const renderTaskbarStylePopoverHeader = (style: DesktopTaskbarStyle) => (
		<div className="mb-3 overflow-hidden rounded-xl ring-1 ring-(--desktop-border-subtle)">
			<DesktopTaskbarStyleMiniPreview
				style={style}
				panelOpacity={desktopPanelOpacity}
			/>
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.meta,
					'border-t border-(--desktop-border-subtle)/70 bg-(--desktop-surface-soft)/60 px-2.5 py-2 text-(--desktop-text-secondary)'
				)}
			>
				<span className="font-semibold text-(--desktop-text-primary)">
					{visualLabels.windowStyle[style]}
				</span>
				{' — '}
				{visualLabels.windowStyleDesc[style]}
			</p>
		</div>
	);

	const renderWidgetStylePopoverHeader = (style: DesktopWidgetsStyle) => (
		<div className="mb-3 overflow-hidden rounded-xl ring-1 ring-(--desktop-border-subtle)">
			<DesktopWidgetsStyleMiniPreview style={style} />
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.meta,
					'border-t border-(--desktop-border-subtle)/70 bg-(--desktop-surface-soft)/60 px-2.5 py-2 text-(--desktop-text-secondary)'
				)}
			>
				<span className="font-semibold text-(--desktop-text-primary)">
					{visualLabels.windowStyle[style]}
				</span>
				{' — '}
				{visualLabels.windowStyleDesc[style]}
			</p>
		</div>
	);

	const bodyPreviewStack = resolveDesktopFontFamilyStack(desktopFontBody);

	const renderStyleSegmentGrid = (
		selected: DesktopWindowStyle | DesktopTaskbarStyle | DesktopWidgetsStyle,
		onSelect: (style: DesktopWindowStyle) => void
	) => (
		<div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto pr-0.5">
			{DESKTOP_TASKBAR_STYLE_KEYS.map((style) => (
				<button
					key={style}
					type="button"
					aria-pressed={selected === style}
					onClick={() => onSelect(style)}
					className={segmentButtonClass(selected === style)}
				>
					{visualLabels.windowStyle[style]}
				</button>
			))}
		</div>
	);

	const popoverTitle = (id: VisualStudioPreviewHotspotId): string => {
		switch (id) {
			case 'scene':
				return t('settingsPanel.visualStudio.hotspotSceneTitle');
			case 'displayFont':
				return t('settingsPanel.visualStudio.hotspotDisplayFontTitle');
			case 'bodyFont':
				return t('settingsPanel.visualStudio.hotspotBodyFontTitle');
			case 'window':
				return t('settingsPanel.visualStudio.hotspotWindowTitle');
			case 'taskbar':
				return t('settingsPanel.visualStudio.hotspotTaskbarTitle');
			case 'widget':
				return t('settingsPanel.visualStudio.hotspotWidgetTitle');
			case 'morph':
				return t('settingsPanel.visualStudio.hotspotMorphTitle');
			case 'motion':
				return t('settingsPanel.visualStudio.hotspotMotionTitle');
			default:
				return '';
		}
	};

	const popoverContent = (id: VisualStudioPreviewHotspotId): ReactNode => {
		switch (id) {
			case 'scene':
				return (
					<div className="space-y-3">
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="sm"
							className="w-full"
							onClick={() => {
								onOpenWallpaperPicker();
								closePopover();
							}}
						>
							{t('settingsPanel.visualStudio.hotspotChangeWallpaper')}
						</DesktopAppButton>
						<div className="grid grid-cols-1 gap-1.5">
							{DESKTOP_SCENE_DEPTH_KEYS.map((depth) => (
								<button
									key={depth}
									type="button"
									onClick={() => onDesktopSceneDepthChange(depth)}
									className={segmentButtonClass(desktopSceneDepth === depth)}
								>
									{t(DESKTOP_SCENE_DEPTH_LABEL_KEYS[depth])}
								</button>
							))}
						</div>
						<label className="flex cursor-pointer items-start gap-2">
							<input
								type="checkbox"
								checked={desktopShellParallaxEnabled}
								disabled={desktopShellReduceMotion}
								onChange={(event) =>
									onDesktopShellParallaxEnabledChange(event.target.checked)
								}
								className={shellCheckboxClass}
							/>
							<span className="text-xs text-(--desktop-text-primary)">
								{t('settingsPanel.visualStudio.wallpaperParallaxLabel')}
							</span>
						</label>
						<div className="grid grid-cols-3 gap-1.5">
							{DESKTOP_SHELL_PARALLAX_INTENSITY_KEYS.map((intensity) => (
								<button
									key={intensity}
									type="button"
									disabled={
										desktopShellReduceMotion || !desktopShellParallaxEnabled
									}
									onClick={() =>
										onDesktopShellParallaxIntensityChange(intensity)
									}
									className={segmentButtonClass(
										desktopShellParallaxIntensity === intensity
									)}
								>
									{t(
										`settingsPanel.visualStudio.parallaxIntensity_${intensity}`
									)}
								</button>
							))}
						</div>
					</div>
				);
			case 'displayFont':
				return (
					<div className="grid grid-cols-2 gap-1.5">
						{DESKTOP_FONT_DISPLAY_KEYS.map((id) => (
							<button
								key={id}
								type="button"
								onClick={() => onDesktopFontDisplayChange(id)}
								className={segmentButtonClass(desktopFontDisplay === id)}
								style={{
									fontFamily: resolveDesktopFontDisplayStack(
										id,
										bodyPreviewStack
									),
								}}
							>
								{t(DESKTOP_FONT_DISPLAY_LABEL_KEYS[id])}
							</button>
						))}
					</div>
				);
			case 'bodyFont':
				return (
					<div className="grid grid-cols-2 gap-1.5">
						{DESKTOP_FONT_BODY_KEYS.map((id) => (
							<button
								key={id}
								type="button"
								onClick={() => onDesktopFontBodyChange(id)}
								className={segmentButtonClass(desktopFontBody === id)}
								style={{ fontFamily: resolveDesktopFontFamilyStack(id) }}
							>
								{t(DESKTOP_FONT_BODY_LABEL_KEYS[id])}
							</button>
						))}
					</div>
				);
			case 'window':
				return (
					<>
						{renderWindowStylePopoverHeader(desktopWindowStyle)}
						{renderStyleSegmentGrid(
							desktopWindowStyle,
							onDesktopWindowStyleChange
						)}
					</>
				);
			case 'taskbar':
				return (
					<div className="space-y-3">
						{renderTaskbarStylePopoverHeader(desktopTaskbarStyle)}
						{renderStyleSegmentGrid(
							desktopTaskbarStyle,
							onDesktopTaskbarStyleChange
						)}
						<div className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between gap-2 text-xs">
								<span className="text-(--desktop-text-secondary)">
									{t('settingsPanel.panelOpacityLabel')}
								</span>
								<span className="tabular-nums text-(--desktop-text-primary)">
									{Math.round(desktopPanelOpacity * 100)}%
								</span>
							</div>
							<input
								type="range"
								min={Math.round(DESKTOP_PANEL_OPACITY_MIN * 100)}
								max={Math.round(DESKTOP_PANEL_OPACITY_MAX * 100)}
								step={5}
								value={Math.round(desktopPanelOpacity * 100)}
								disabled={desktopTaskbarStyle === 'glass'}
								onChange={(event) =>
									onDesktopPanelOpacityChange(Number(event.target.value) / 100)
								}
								className="w-full accent-[rgb(var(--desktop-accent-rgb))]"
							/>
						</div>
					</div>
				);
			case 'widget':
				return (
					<>
						{renderWidgetStylePopoverHeader(desktopWidgetsStyle)}
						{renderStyleSegmentGrid(
							desktopWidgetsStyle,
							onDesktopWidgetsStyleChange
						)}
					</>
				);
			case 'morph':
				return (
					<div className="space-y-2">
						<label className="flex cursor-pointer items-start gap-2">
							<input
								type="checkbox"
								checked={desktopShellWindowMorphEnabled}
								disabled={desktopShellReduceMotion}
								onChange={(event) =>
									onDesktopShellWindowMorphEnabledChange(event.target.checked)
								}
								className={shellCheckboxClass}
							/>
							<span className="text-xs text-(--desktop-text-primary)">
								{t('settingsPanel.visualStudio.windowMorphLabel')}
							</span>
						</label>
						<div className="grid grid-cols-3 gap-1.5">
							{DESKTOP_SHELL_MOTION_SPEED_KEYS.map((speed) => (
								<button
									key={speed}
									type="button"
									disabled={desktopShellReduceMotion}
									onClick={() => onDesktopShellMotionSpeedChange(speed)}
									className={segmentButtonClass(
										desktopShellMotionSpeed === speed
									)}
								>
									{t(`settingsPanel.visualStudio.shellMotionSpeed_${speed}`)}
								</button>
							))}
						</div>
					</div>
				);
			case 'motion':
				return (
					<div className="space-y-2.5">
						<label className="flex cursor-pointer items-start gap-2">
							<input
								type="checkbox"
								checked={desktopShellReduceMotion}
								onChange={(event) =>
									onDesktopShellReduceMotionChange(event.target.checked)
								}
								className={shellCheckboxClass}
							/>
							<span className="text-xs text-(--desktop-text-primary)">
								{t('settingsPanel.visualStudio.shellReduceMotionLabel')}
							</span>
						</label>
						<label className="flex cursor-pointer items-start gap-2">
							<input
								type="checkbox"
								checked={desktopWallpaperCrossfadeEnabled}
								onChange={(event) =>
									onDesktopWallpaperCrossfadeChange(event.target.checked)
								}
								className={shellCheckboxClass}
							/>
							<span className="text-xs text-(--desktop-text-primary)">
								{t('settingsPanel.visualStudio.wallpaperCrossfadeLabel')}
							</span>
						</label>
						<label className="flex cursor-pointer items-start gap-2">
							<input
								type="checkbox"
								checked={desktopStyledTooltips}
								onChange={(event) =>
									onDesktopStyledTooltipsChange(event.target.checked)
								}
								className={shellCheckboxClass}
							/>
							<span className="text-xs text-(--desktop-text-primary)">
								{t('settingsPanel.visualStudio.styledTooltipsLabel')}
							</span>
						</label>
					</div>
				);
			default:
				return null;
		}
	};

	return (
		<div
			className="group/preview-studio relative space-y-2.5"
			onPointerEnter={() => setPreviewHovered(true)}
			onPointerLeave={() => setPreviewHovered(false)}
		>
			<DesktopVisualStudioPreview
				{...previewProps}
				desktopWindowStyle={desktopWindowStyle}
				desktopTaskbarStyle={desktopTaskbarStyle}
				desktopWidgetsStyle={desktopWidgetsStyle}
				desktopPanelOpacity={desktopPanelOpacity}
				desktopSceneDepth={desktopSceneDepth}
				desktopFontBody={desktopFontBody}
				desktopFontDisplay={desktopFontDisplay}
				desktopShellReduceMotion={desktopShellReduceMotion}
				desktopShellParallaxEnabled={desktopShellParallaxEnabled}
				desktopShellParallaxIntensity={desktopShellParallaxIntensity}
				desktopShellWindowMorphEnabled={desktopShellWindowMorphEnabled}
				desktopShellMotionSpeed={desktopShellMotionSpeed}
				hotspotHandlers={hotspotHandlers}
			/>

			{(previewDemoBadges.parallax || previewDemoBadges.morph) && (
				<div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
					{previewDemoBadges.parallax ? (
						<span
							className={cn(
								DESKTOP_TYPOGRAPHY.meta,
								'rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/70 px-2 py-0.5 text-[10px] text-(--desktop-text-secondary)'
							)}
						>
							{t('settingsPanel.visualStudio.previewParallaxHint')}
						</span>
					) : null}
					{previewDemoBadges.morph ? (
						<span
							className={cn(
								DESKTOP_TYPOGRAPHY.meta,
								'rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/70 px-2 py-0.5 text-[10px] text-(--desktop-text-secondary)'
							)}
						>
							{t('settingsPanel.visualStudio.previewMorphHint')}
						</span>
					) : null}
				</div>
			)}

			<div
				className="flex flex-wrap gap-1.5"
				role="toolbar"
				aria-label={t('settingsPanel.visualStudio.hotspotLegendAria')}
			>
				{VISUAL_STUDIO_PREVIEW_HOTSPOT_ORDER.map((id) => {
					const active = activeHotspot === id;
					return (
						<button
							key={id}
							type="button"
							aria-pressed={active}
							onClick={() => toggleHotspot(id)}
							className={cn(
								'rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors',
								DESKTOP_CHROME_FOCUS_VISIBLE,
								active
									? 'border-[rgb(var(--desktop-accent-rgb))] bg-[rgb(var(--desktop-accent-rgb)/0.16)] text-(--desktop-text-primary)'
									: 'border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/80 text-(--desktop-text-secondary) hover:border-(--desktop-border-strong) hover:text-(--desktop-text-primary)'
							)}
						>
							{t(
								`settingsPanel.visualStudio.${VISUAL_STUDIO_HOTSPOT_LEGEND_KEY[id]}`
							)}
						</button>
					);
				})}
			</div>

			{activeHotspot ? (
				<VisualStudioHotspotPopover
					open
					anchorRef={anchorRefFor(activeHotspot)}
					onClose={closePopover}
					title={popoverTitle(activeHotspot)}
					footer={popoverDetailFooter(activeHotspot)}
					width={
						activeHotspot === 'window' ||
						activeHotspot === 'taskbar' ||
						activeHotspot === 'widget'
							? 320
							: 300
					}
				>
					{popoverContent(activeHotspot)}
				</VisualStudioHotspotPopover>
			) : null}
		</div>
	);
};
