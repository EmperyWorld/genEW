/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Live composite preview for Desktop Settings Visual Studio (wallpaper + chrome + motion demo).
 *
 * Invariants:
 * - Presentational only; motion props reflect current Visual Studio form state.
 *
 * Related:
 * - `DesktopSettingsVisualStudioSection.tsx`, `desktopSettingsPreviewComponents.tsx`
 */

import { cn } from '@/utils/cn';
import { LayoutGroup, motion } from 'framer-motion';
import type { FC, PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
	DesktopFontBodyId,
	DesktopFontDisplayId,
	DesktopIconStyle,
	DesktopSceneDepth,
	DesktopShellMotionSpeed,
	DesktopShellParallaxIntensity,
	DesktopTaskbarStyle,
	DesktopWidgetsStyle,
	DesktopWindowStyle,
} from '@/types/profile';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import { computeWallpaperParallaxOffsetPct } from '../../hooks/useDesktopWallpaperParallax';
import {
	desktopShellLayoutTransition,
	desktopShellMotionSpeedScale,
	desktopShellTransitionDurationSec,
	desktopWindowMorphLayoutId,
} from '../../utils/desktopShellMotion';
import { DESKTOP_SHELL_PARALLAX_INTENSITY_SCALE } from '../../utils/resolveDesktopShellMotion';
import {
	resolveDesktopFontDisplayStack,
	resolveDesktopFontFamilyStack,
} from '../../utils/desktopTypography';
import {
	DesktopSettingsWallpaperPreview,
	DesktopTaskbarStyleMiniPreview,
	DesktopWidgetsStyleMiniPreview,
	DesktopWindowStyleMiniPreview,
} from './desktopSettingsPreviewComponents';
import {
	type VisualStudioPreviewHotspotHandlers,
	type VisualStudioPreviewHotspotId,
	VISUAL_STUDIO_HOTSPOT_HINT_KEY,
	visualStudioPreviewHotspotButtonClass,
} from './desktopVisualStudioPreviewHotspots';

const PREVIEW_MORPH_WINDOW_ID = 'visual-studio-preview';

const HOTSPOT_ARIA_KEY: Record<
	VisualStudioPreviewHotspotId,
	| 'hotspotSceneAria'
	| 'hotspotDisplayFontAria'
	| 'hotspotBodyFontAria'
	| 'hotspotWindowAria'
	| 'hotspotTaskbarAria'
	| 'hotspotWidgetAria'
	| 'hotspotMorphAria'
	| 'hotspotMotionAria'
> = {
	scene: 'hotspotSceneAria',
	displayFont: 'hotspotDisplayFontAria',
	bodyFont: 'hotspotBodyFontAria',
	window: 'hotspotWindowAria',
	taskbar: 'hotspotTaskbarAria',
	widget: 'hotspotWidgetAria',
	morph: 'hotspotMorphAria',
	motion: 'hotspotMotionAria',
};

function PreviewHotspotRegion({
	hotspotId,
	handlers,
	className,
	chipLabel,
	children,
}: {
	hotspotId: VisualStudioPreviewHotspotId;
	handlers?: VisualStudioPreviewHotspotHandlers;
	className?: string;
	chipLabel?: string;
	children: ReactNode;
}) {
	const { t } = useTranslation('desktopUi');
	const setAnchorRef = useCallback(
		(element: HTMLButtonElement | null) => {
			handlers?.registerAnchor(hotspotId, element);
		},
		[handlers, hotspotId]
	);

	if (!handlers) {
		return <div className={className}>{children}</div>;
	}

	const active = handlers.activeHotspot === hotspotId;
	const hintLabel = t(
		`settingsPanel.visualStudio.${VISUAL_STUDIO_HOTSPOT_HINT_KEY[hotspotId]}`
	);
	return (
		<div className={cn('group/hotspot relative', className)}>
			{children}
			<span
				aria-hidden
				className={cn(
					'pointer-events-none absolute -top-5 left-0 z-30 max-w-[calc(100%+1rem)] truncate rounded-md',
					'bg-black/72 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/92',
					'opacity-0 shadow-md transition-opacity duration-150',
					'group-hover/hotspot:opacity-100 group-focus-within/hotspot:opacity-100',
					active && 'opacity-100'
				)}
			>
				{hintLabel}
			</span>
			<button
				ref={setAnchorRef}
				type="button"
				className={visualStudioPreviewHotspotButtonClass(
					active,
					Boolean(chipLabel)
				)}
				aria-label={t(
					`settingsPanel.visualStudio.${HOTSPOT_ARIA_KEY[hotspotId]}`
				)}
				aria-expanded={active}
				onClick={() => handlers.onHotspotClick(hotspotId)}
			>
				{chipLabel}
			</button>
		</div>
	);
}

export type DesktopVisualStudioPreviewProps = {
	wallpaper: string;
	theme: 'dark' | 'light' | 'auto';
	desktopWindowStyle: DesktopWindowStyle;
	desktopTaskbarStyle: DesktopTaskbarStyle;
	desktopWidgetsStyle: DesktopWidgetsStyle;
	desktopIconStyle: DesktopIconStyle;
	desktopPanelOpacity: number;
	desktopSceneDepth: DesktopSceneDepth;
	desktopFontBody: DesktopFontBodyId;
	desktopFontDisplay: DesktopFontDisplayId;
	accentLabel?: string;
	desktopShellReduceMotion: boolean;
	desktopShellParallaxEnabled: boolean;
	desktopShellParallaxIntensity: DesktopShellParallaxIntensity;
	desktopShellWindowMorphEnabled: boolean;
	desktopShellMotionSpeed: DesktopShellMotionSpeed;
	className?: string;
	hotspotHandlers?: VisualStudioPreviewHotspotHandlers;
};

export const DesktopVisualStudioPreview: FC<
	DesktopVisualStudioPreviewProps
> = ({
	wallpaper,
	theme,
	desktopWindowStyle,
	desktopTaskbarStyle,
	desktopWidgetsStyle,
	desktopIconStyle,
	desktopPanelOpacity,
	desktopSceneDepth,
	desktopFontBody,
	desktopFontDisplay,
	accentLabel,
	desktopShellReduceMotion,
	desktopShellParallaxEnabled,
	desktopShellParallaxIntensity,
	desktopShellWindowMorphEnabled,
	desktopShellMotionSpeed,
	className,
	hotspotHandlers,
}) => {
	const { t } = useTranslation('desktopUi');
	const bodyStack = resolveDesktopFontFamilyStack(desktopFontBody);
	const displayStack = resolveDesktopFontDisplayStack(
		desktopFontDisplay,
		bodyStack
	);
	const isLight = theme === 'light';
	const reduceMotion = desktopShellReduceMotion;
	const speed = desktopShellMotionSpeed;
	const parallaxScale =
		DESKTOP_SHELL_PARALLAX_INTENSITY_SCALE[desktopShellParallaxIntensity] ?? 1;
	const enterDurationSec = desktopShellTransitionDurationSec(
		reduceMotion,
		speed,
		0.24
	);
	const [morphMinimized, setMorphMinimized] = useState(false);
	const [parallaxOffset, setParallaxOffset] = useState({ x: '0%', y: '0%' });

	const morphActive =
		!reduceMotion && desktopShellWindowMorphEnabled && morphMinimized;
	const parallaxActive =
		!reduceMotion && desktopShellParallaxEnabled && parallaxScale > 0;

	const previewMotionKey = [
		wallpaper,
		desktopFontBody,
		desktopFontDisplay,
		desktopSceneDepth,
		desktopWindowStyle,
		desktopTaskbarStyle,
		desktopWidgetsStyle,
		desktopShellReduceMotion,
		desktopShellParallaxEnabled,
		desktopShellParallaxIntensity,
		desktopShellWindowMorphEnabled,
		desktopShellMotionSpeed,
	].join('|');

	useEffect(() => {
		if (
			!desktopShellWindowMorphEnabled ||
			reduceMotion ||
			hotspotHandlers?.pauseMorphDemo
		) {
			setMorphMinimized(false);
			return;
		}
		const ms = Math.max(
			480,
			Math.round(320 * desktopShellMotionSpeedScale(speed))
		);
		const timer = window.setInterval(() => {
			setMorphMinimized((prev) => !prev);
		}, ms);
		return () => window.clearInterval(timer);
	}, [
		desktopShellWindowMorphEnabled,
		hotspotHandlers?.pauseMorphDemo,
		reduceMotion,
		speed,
	]);

	const onPreviewPointerMove = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (!parallaxActive || event.pointerType !== 'mouse') return;
			const rect = event.currentTarget.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;
			const nx = (event.clientX - rect.left) / rect.width - 0.5;
			const ny = (event.clientY - rect.top) / rect.height - 0.5;
			const offset = computeWallpaperParallaxOffsetPct(
				nx,
				ny,
				desktopSceneDepth,
				parallaxScale
			);
			setParallaxOffset(offset);
		},
		[desktopSceneDepth, parallaxActive, parallaxScale]
	);

	const onPreviewPointerLeave = useCallback(() => {
		setParallaxOffset({ x: '0%', y: '0%' });
	}, []);

	const morphChipClass = useMemo(
		() =>
			cn(
				'flex h-8 w-8 items-center justify-center rounded-lg border border-white/25 bg-white/15 text-[10px] font-semibold uppercase text-white/90 shadow-lg backdrop-blur-md',
				desktopIconStyle === 'minimal' && 'rounded-md bg-white/10'
			),
		[desktopIconStyle]
	);

	return (
		<motion.div
			key={previewMotionKey}
			initial={reduceMotion ? false : { opacity: 0.92, scale: 0.992 }}
			animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
			transition={
				reduceMotion
					? { duration: 0 }
					: { duration: enterDurationSec, ease: [0.16, 1, 0.3, 1] }
			}
			className={cn(
				'relative overflow-hidden rounded-2xl border border-(--desktop-border-subtle) shadow-[0_24px_56px_rgba(0,0,0,0.38)]',
				className
			)}
			data-desktop-scene-depth={desktopSceneDepth}
			onPointerMove={onPreviewPointerMove}
			onPointerLeave={onPreviewPointerLeave}
			style={{
				fontFamily: bodyStack,
				['--desktop-font-family' as string]: bodyStack,
				['--desktop-font-display' as string]: displayStack,
			}}
		>
			<div
				className="absolute inset-0"
				style={{
					backgroundPosition: parallaxActive
						? `calc(50% + ${parallaxOffset.x}) calc(50% + ${parallaxOffset.y})`
						: '50% 50%',
					transition: reduceMotion
						? undefined
						: 'background-position 0.12s ease-out',
				}}
			>
				<DesktopSettingsWallpaperPreview
					wallpaper={wallpaper}
					className="absolute inset-0 h-full w-full"
				/>
			</div>
			<div
				aria-hidden
				className={cn(
					'pointer-events-none absolute inset-0',
					desktopSceneDepth === 'soft' &&
						'bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(0,0,0,0.22)_100%)]',
					desktopSceneDepth === 'balanced' &&
						'bg-[radial-gradient(ellipse_at_center,transparent_28%,rgba(0,0,0,0.38)_100%)]',
					desktopSceneDepth === 'immersive' &&
						'bg-[radial-gradient(ellipse_at_center,transparent_12%,rgba(0,0,0,0.52)_100%)]'
				)}
			/>
			<div
				aria-hidden
				className={cn(
					'pointer-events-none absolute inset-0',
					isLight ? 'bg-white/12' : 'bg-black/18'
				)}
			/>
			<LayoutGroup id="visual-studio-preview">
				<div className="relative flex min-h-56 flex-col justify-between p-3 sm:min-h-64 sm:p-4">
					<div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
						{hotspotHandlers ? (
							<PreviewHotspotRegion
								hotspotId="widget"
								handlers={hotspotHandlers}
								className="w-[7.25rem]"
							>
								<DesktopWidgetsStyleMiniPreview style={desktopWidgetsStyle} />
							</PreviewHotspotRegion>
						) : (
							<div className="w-[7.25rem]">
								<DesktopWidgetsStyleMiniPreview style={desktopWidgetsStyle} />
							</div>
						)}
						{!morphActive ? (
							<PreviewHotspotRegion
								hotspotId="morph"
								handlers={hotspotHandlers}
								className="size-8 shrink-0"
							>
								<motion.span
									layoutId={desktopWindowMorphLayoutId(PREVIEW_MORPH_WINDOW_ID)}
									className={morphChipClass}
									transition={desktopShellLayoutTransition(reduceMotion, speed)}
								>
									App
								</motion.span>
							</PreviewHotspotRegion>
						) : null}
					</div>
					<div className="flex items-start justify-between gap-2 pr-[7.75rem]">
						<div className="min-w-0 flex-1">
							<PreviewHotspotRegion
								hotspotId="bodyFont"
								handlers={hotspotHandlers}
								className="inline-block max-w-full"
							>
								<p
									className={cn(
										DESKTOP_TYPOGRAPHY.caption,
										'uppercase tracking-[0.18em] text-white/72'
									)}
								>
									{t('settingsPanel.visualStudio.previewBadge')}
								</p>
							</PreviewHotspotRegion>
							<PreviewHotspotRegion
								hotspotId="displayFont"
								handlers={hotspotHandlers}
								className="mt-1 inline-block w-fit max-w-full"
							>
								<p
									className="desktop-shell-display-text truncate text-lg font-semibold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]"
									style={{ fontFamily: displayStack }}
								>
									{t('settingsPanel.visualStudio.previewTitle')}
								</p>
							</PreviewHotspotRegion>
							{accentLabel ? (
								<p
									className={cn(
										DESKTOP_TYPOGRAPHY.small,
										'mt-0.5 text-white/78'
									)}
								>
									{accentLabel}
								</p>
							) : null}
							{hotspotHandlers ? (
								<PreviewHotspotRegion
									hotspotId="scene"
									handlers={hotspotHandlers}
									className="mt-1.5 inline-flex h-7 min-w-16"
									chipLabel={t('settingsPanel.visualStudio.hotspotSceneChip')}
								>
									<span className="sr-only">
										{t('settingsPanel.visualStudio.hotspotSceneAria')}
									</span>
								</PreviewHotspotRegion>
							) : null}
						</div>
					</div>

					<PreviewHotspotRegion
						hotspotId="window"
						handlers={hotspotHandlers}
						className="mx-auto w-full max-w-60 shrink-0 py-1"
					>
						<DesktopWindowStyleMiniPreview style={desktopWindowStyle} />
					</PreviewHotspotRegion>

					<PreviewHotspotRegion
						hotspotId="taskbar"
						handlers={hotspotHandlers}
						className="relative mt-3 shrink-0"
					>
						<DesktopTaskbarStyleMiniPreview
							style={desktopTaskbarStyle}
							panelOpacity={desktopPanelOpacity}
						/>
						{morphActive ? (
							<PreviewHotspotRegion
								hotspotId="morph"
								handlers={hotspotHandlers}
								className="absolute bottom-2 left-3 z-30 size-8"
							>
								<motion.span
									layoutId={desktopWindowMorphLayoutId(PREVIEW_MORPH_WINDOW_ID)}
									className={morphChipClass}
									transition={desktopShellLayoutTransition(reduceMotion, speed)}
								>
									App
								</motion.span>
							</PreviewHotspotRegion>
						) : null}
					</PreviewHotspotRegion>
				</div>
			</LayoutGroup>
		</motion.div>
	);
};
