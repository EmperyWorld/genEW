/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Mini preview widgets for Desktop Settings Center style pickers.
 *
 * Invariants:
 * - Window-style mini previews use frame/titlebar presets (chrome CSS vars), never hardcoded dark washes.
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`
 * - `DesktopChromeTooltip.tsx`
 * - `documentation/product/DESKTOP-WINDOW-SHELL-STYLE.md`
 */

import { cn } from '@/utils/cn';
import { isDesktopWallpaperImageRef } from '../../utils/desktopWallpaper';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '../DesktopAppChrome';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';
import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	type ComponentType,
	type FC,
	type SVGProps,
} from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { MoonIcon, SparklesIcon, SunIcon } from '@heroicons/react/24/outline';
import {
	DESKTOP_PANEL_OPACITY_MAX,
	DESKTOP_PANEL_OPACITY_MIN,
	normalizeDesktopTaskbarStyle,
	type DesktopTaskbarStyle,
	type DesktopWidgetsStyle,
	type DesktopWindowStyle,
} from '@/types/profile';
import {
	DESKTOP_TASKBAR_STYLE_PRESETS,
	TASKBAR_PANEL_OPACITY_OVERLAY_WEIGHT,
	DESKTOP_WINDOW_FRAME_STYLES,
	DESKTOP_WINDOW_TITLEBAR_STYLES,
	getDesktopWindowShellTier,
} from '../../utils/desktopVisualSystem';
import type {
	DesktopCuratedStyleSet,
	DesktopThemeModeForPreset,
} from '../../constants/desktopCuratedStyleSets';
import { DESKTOP_CURATED_STYLE_SETS } from '../../constants/desktopCuratedStyleSets';
import {
	buildVisualStudioPresetMetaLine,
	hasVisualStudioPresetMeta,
} from '../../utils/desktopVisualStudioMeta';
import {
	builtinDesktopWallpaperPath,
	DESKTOP_TYPOGRAPHY,
} from '../../constants';

export function DesktopSettingsWallpaperPreview({
	wallpaper,
	className,
	fit = 'cover',
}: {
	wallpaper: string;
	className: string;
	/** `contain` — полное изображение с уменьшенным масштабом; `cover` — заполнение области. */
	fit?: 'cover' | 'contain';
}) {
	const { t } = useTranslation('desktopUi');
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (isDesktopWallpaperImageRef(wallpaper)) {
			el.style.background = '';
			el.style.backgroundImage = `url("${wallpaper}")`;
			el.style.backgroundSize = fit;
			el.style.backgroundPosition = 'center center';
			el.style.backgroundRepeat = 'no-repeat';
		} else {
			el.style.background = wallpaper;
			el.style.backgroundImage = '';
			el.style.backgroundSize = '';
			el.style.backgroundPosition = '';
			el.style.backgroundRepeat = '';
		}
	}, [wallpaper, fit]);
	return (
		<div
			ref={ref}
			role="img"
			className={className}
			aria-label={t('modal.settingsWallpaperCurrentAria')}
		/>
	);
}

export function DesktopTaskbarPreviewStrip({
	desktopTaskbarStyle,
	desktopPanelOpacity,
	className,
	surfaceClassName,
	children,
}: {
	desktopTaskbarStyle: DesktopTaskbarStyle;
	desktopPanelOpacity: number;
	className: string;
	surfaceClassName: string;
	children: React.ReactNode;
}) {
	const backdropRef = useRef<HTMLDivElement>(null);
	const taskbarStyleKey = normalizeDesktopTaskbarStyle(desktopTaskbarStyle);
	const preset =
		DESKTOP_TASKBAR_STYLE_PRESETS[taskbarStyleKey] ??
		DESKTOP_TASKBAR_STYLE_PRESETS.glass;
	const panelOpacity = useMemo(() => {
		if (
			typeof desktopPanelOpacity !== 'number' ||
			!Number.isFinite(desktopPanelOpacity)
		) {
			return DESKTOP_PANEL_OPACITY_MAX;
		}
		return Math.min(
			DESKTOP_PANEL_OPACITY_MAX,
			Math.max(DESKTOP_PANEL_OPACITY_MIN, desktopPanelOpacity)
		);
	}, [desktopPanelOpacity]);
	const solidOverlayOpacity = useMemo(() => {
		const span = DESKTOP_PANEL_OPACITY_MAX - DESKTOP_PANEL_OPACITY_MIN;
		const progress =
			span > 0 ? (panelOpacity - DESKTOP_PANEL_OPACITY_MIN) / span : 1;
		const weight = TASKBAR_PANEL_OPACITY_OVERLAY_WEIGHT[taskbarStyleKey] ?? 0.5;
		return Math.min(1, Math.max(0, progress * weight));
	}, [panelOpacity, taskbarStyleKey]);

	useLayoutEffect(() => {
		const el = backdropRef.current;
		if (!el) return;
		const s = preset.surfaceStyle;
		el.style.background = s.background != null ? String(s.background) : '';
		el.style.backgroundColor =
			s.backgroundColor != null ? String(s.backgroundColor) : '';
		el.style.borderTopColor = s.borderTopColor ?? '';
		el.style.boxShadow = s.boxShadow ?? '';
		el.style.backdropFilter = s.backdropFilter ?? '';
		el.style.setProperty(
			'-webkit-backdrop-filter',
			s.WebkitBackdropFilter ?? ''
		);
		el.style.backgroundImage =
			s.backgroundImage !== undefined ? String(s.backgroundImage) : '';
	}, [preset]);

	return (
		<div className={cn(className, 'relative overflow-hidden')}>
			<div
				ref={backdropRef}
				aria-hidden
				className={cn('pointer-events-none absolute inset-0', surfaceClassName)}
			/>
			{solidOverlayOpacity > 0.008 ? (
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 z-1 rounded-t-(--desktop-radius-shell)"
					style={{
						opacity: solidOverlayOpacity,
						background:
							taskbarStyleKey === 'premium'
								? 'var(--desktop-taskbar-bg-opaque-premium)'
								: 'var(--desktop-taskbar-bg-opaque)',
						backdropFilter: 'none',
						WebkitBackdropFilter: 'none',
					}}
				/>
			) : null}
			{children}
		</div>
	);
}

/** Мини-превью нижней полосы для сетки «Стиль панели задач». */
export function DesktopTaskbarStyleMiniPreview({
	style,
	panelOpacity,
}: {
	style: DesktopTaskbarStyle;
	panelOpacity: number;
}) {
	const key = normalizeDesktopTaskbarStyle(style);
	const preset =
		DESKTOP_TASKBAR_STYLE_PRESETS[key] ?? DESKTOP_TASKBAR_STYLE_PRESETS.glass;
	return (
		<DesktopTaskbarPreviewStrip
			desktopTaskbarStyle={style}
			desktopPanelOpacity={panelOpacity}
			className="pointer-events-none relative h-11 w-full overflow-hidden rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.42)] ring-1 ring-black/25"
			surfaceClassName={preset.surfaceClassName}
		>
			<div className="relative z-1 flex h-full min-h-0 items-center gap-2 px-2.5">
				<div
					className="relative size-6 shrink-0 overflow-hidden rounded-[0.55rem] border border-[rgb(var(--desktop-accent-rgb)/0.28)] bg-[linear-gradient(155deg,rgba(255,255,255,0.1)_0%,rgba(0,0,0,0.35)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
					aria-hidden
				>
					<img
						src="/logo.webp"
						alt=""
						className="size-full object-contain mix-blend-screen"
						loading="lazy"
						decoding="async"
					/>
				</div>
				<span className="h-2 min-w-9 flex-1 rounded-md bg-[rgb(var(--desktop-fg-primary-rgb)/0.09)] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.06)]" />
				<span className="size-3 shrink-0 rounded-md bg-[rgb(var(--desktop-fg-primary-rgb)/0.11)] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.08)]" />
			</div>
		</DesktopTaskbarPreviewStrip>
	);
}

function curatedPresetThemeBadge(
	theme: DesktopThemeModeForPreset,
	t: TFunction<'desktopUi'>
): {
	label: string;
	Icon: ComponentType<SVGProps<SVGSVGElement>>;
	chipClass: string;
	overlayBottomClass: string;
} {
	switch (theme) {
		case 'light':
			return {
				label: t('curatedStylePreset.themeBadgeLight'),
				Icon: SunIcon,
				chipClass:
					'border border-amber-900/12 bg-[#f8f4ec]/88 font-["Manrope"] text-[#1a1410] shadow-[0_4px_16px_rgba(26,20,16,0.1)] backdrop-blur-sm',
				overlayBottomClass:
					'bg-[linear-gradient(180deg,rgba(10,10,12,0.02)_18%,rgba(10,10,12,0.42)_100%)]',
			};
		case 'auto':
			return {
				label: t('curatedStylePreset.themeBadgeAuto'),
				Icon: SunIcon,
				chipClass:
					'border border-white/10 bg-[#0d0c10]/78 font-["Manrope"] text-[#e8e4dc] shadow-[0_6px_20px_rgba(0,0,0,0.38)] backdrop-blur-md',
				overlayBottomClass:
					'bg-[linear-gradient(180deg,rgba(10,10,12,0.05)_20%,rgba(10,10,12,0.58)_100%)]',
			};
		default:
			return {
				label: t('curatedStylePreset.themeBadgeDark'),
				Icon: MoonIcon,
				chipClass:
					'border border-white/8 bg-[#0a0a0c]/82 font-["Manrope"] text-[#f1ede6] shadow-[0_6px_20px_rgba(0,0,0,0.48)] backdrop-blur-md',
				overlayBottomClass:
					'bg-[linear-gradient(180deg,rgba(10,10,12,0.06)_20%,rgba(10,10,12,0.66)_100%)]',
			};
	}
}

export const CuratedStylePresetsRow: FC<{
	onApplyCuratedStyleSet: (set: DesktopCuratedStyleSet) => void | Promise<void>;
}> = ({ onApplyCuratedStyleSet }) => {
	const { t } = useTranslation('desktopUi');
	const stripRef = useRef<HTMLElement>(null);

	useEffect(() => {
		const el = stripRef.current;
		if (!el) return;

		const onWheel = (event: WheelEvent) => {
			if (event.ctrlKey || event.metaKey) return;
			if (el.scrollWidth <= el.clientWidth + 1) return;

			let delta =
				Math.abs(event.deltaX) > Math.abs(event.deltaY)
					? event.deltaX
					: event.deltaY;
			if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
				delta *= 16;
			} else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
				delta *= el.clientWidth * 0.9;
			}
			if (delta === 0) return;

			const before = el.scrollLeft;
			el.scrollLeft += delta;
			if (el.scrollLeft !== before) {
				event.preventDefault();
			}
		};

		el.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			el.removeEventListener('wheel', onWheel);
		};
	}, []);

	return (
		<section
			ref={stripRef}
			aria-label={t('modal.settingsWallpaperPresetsStripAria')}
			className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 scrollbar-thin [scrollbar-color:color-mix(in_srgb,rgba(212,175,106,0.28)_transparent)_transparent]"
		>
			{DESKTOP_CURATED_STYLE_SETS.map((set) => {
				const tone = curatedPresetThemeBadge(set.theme, t);
				const ToneIcon = tone.Icon;
				const name = t(`curatedStylePreset.sets.${set.id}.name`);
				const blurb = t(`curatedStylePreset.sets.${set.id}.blurb`);
				const studioMeta = buildVisualStudioPresetMetaLine(
					{
						fontBody: set.fontBody,
						fontDisplay: set.fontDisplay,
						sceneDepth: set.sceneDepth,
					},
					t
				);
				const tooltipContent = studioMeta
					? `${name} — ${blurb} · ${studioMeta}`
					: `${name} — ${blurb}`;
				return (
					<DesktopChromeTooltip
						key={set.id}
						content={tooltipContent}
						placement="top"
						offsetExtra={4}
					>
						<button
							type="button"
							onClick={() => onApplyCuratedStyleSet(set)}
							className={cn(
								'group snap-start shrink-0 rounded-sm border border-white/5 bg-[#0d0c10]/55 text-left outline-none backdrop-blur-md',
								'transition-all duration-300 motion-reduce:transition-none',
								'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
								DESKTOP_CHROME_FOCUS_VISIBLE,
								'min-w-46 max-w-47',
								'hover:border-amber-500/15 hover:bg-[#0a0a0c]/72',
								'hover:shadow-[0_0_28px_rgba(72,168,186,0.08),inset_0_1px_0_0_rgba(255,255,255,0.06)]',
								'hover:[&_.curated-preset-title]:text-[rgb(var(--desktop-accent-rgb)/0.96)]'
							)}
						>
							<div className="relative h-18 w-full overflow-hidden rounded-t-sm bg-[#0a0a0c]">
								<img
									src={builtinDesktopWallpaperPath(set.wallpaperIndex)}
									alt=""
									className="absolute inset-0 size-full object-cover opacity-92"
									loading="lazy"
									decoding="async"
								/>
								<div
									className="pointer-events-none absolute inset-0 opacity-85 mix-blend-soft-light"
									style={{ background: set.preview }}
									aria-hidden
								/>
								<div
									className={cn(
										'pointer-events-none absolute inset-0',
										tone.overlayBottomClass
									)}
									aria-hidden
								/>
								<span
									className={cn(
										'pointer-events-none absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5',
										tone.chipClass
									)}
								>
									<ToneIcon
										className="size-3 shrink-0 opacity-90"
										aria-hidden
									/>
									<span className="text-[10px] font-medium leading-none tracking-wide">
										{tone.label}
									</span>
								</span>
								<span className="absolute bottom-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-sm border border-white/8 bg-[#0a0a0c]/62 text-amber-100/88 shadow-[0_0_14px_rgba(72,168,186,0.1)] backdrop-blur-md transition-all duration-300 group-hover:border-amber-500/20">
									<SparklesIcon
										className="h-3.5 w-3.5 text-[rgba(72,168,186,0.88)]"
										strokeWidth={1.75}
										aria-hidden
									/>
								</span>
							</div>
							<div className="space-y-1 border-t border-white/5 px-2.5 py-2.5">
								<div className="curated-preset-title desktop-shell-display-text text-[13px] font-medium leading-tight tracking-wide text-(--desktop-text-primary) transition-colors duration-300">
									{name}
								</div>
								<div className="font-['Manrope'] text-[11px] leading-snug tracking-wide text-(--desktop-text-dim)">
									{blurb}
								</div>
								{hasVisualStudioPresetMeta({
									fontBody: set.fontBody,
									fontDisplay: set.fontDisplay,
									sceneDepth: set.sceneDepth,
								}) ? (
									<div className="text-[10px] leading-snug tracking-wide text-[rgb(var(--desktop-accent-rgb)/0.82)]">
										{studioMeta}
									</div>
								) : null}
							</div>
						</button>
					</DesktopChromeTooltip>
				);
			})}
		</section>
	);
};
export function DesktopWidgetsStyleMiniPreview({
	style,
}: {
	style: DesktopWidgetsStyle;
}) {
	const preset =
		DESKTOP_WINDOW_FRAME_STYLES[style] ?? DESKTOP_WINDOW_FRAME_STYLES.glass;
	const tier = getDesktopWindowShellTier(style);
	const radius =
		tier === 'minimal'
			? 'rounded-xl'
			: tier === 'framed'
				? 'rounded-2xl'
				: 'rounded-[1.45rem]';
	const extraShadow =
		tier === 'glass'
			? 'shadow-[0_18px_42px_rgba(2,6,23,0.32)]'
			: tier === 'framed'
				? 'shadow-[0_22px_50px_rgba(0,0,0,0.46)]'
				: 'shadow-[0_14px_34px_rgba(0,0,0,0.24)]';
	return (
		<div
			className={cn(
				'pointer-events-none mb-1 w-full select-none overflow-hidden ring-1 ring-black/26',
				radius,
				preset.frame,
				extraShadow
			)}
		>
			<div className={cn('min-h-13 px-2.5 py-2', preset.content)}>
				<div className="flex items-center justify-between gap-2">
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.captionInherit,
							'tabular-nums tracking-tight text-(--desktop-text-secondary)'
						)}
					>
						14:02
					</span>
					<span
						className="size-6 shrink-0 rounded-full bg-[rgb(var(--desktop-fg-primary-rgb)/0.11)] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.12)]"
						aria-hidden
					/>
				</div>
				<div className="mt-2 flex items-center gap-1.5">
					<span className="h-2 min-w-0 flex-1 rounded-md bg-[rgb(var(--desktop-fg-primary-rgb)/0.09)] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.06)]" />
					<span className="size-5 shrink-0 rounded-md bg-[rgb(var(--desktop-accent-rgb)/0.22)] ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.2)]" />
				</div>
			</div>
		</div>
	);
}

/** Компактное превью рамки окна для сетки пресетов «Стиль окон». */
export function DesktopWindowStyleMiniPreview({
	style,
}: {
	style: DesktopWindowStyle;
}) {
	const preset =
		DESKTOP_WINDOW_FRAME_STYLES[style] ?? DESKTOP_WINDOW_FRAME_STYLES.glass;
	const titlebar =
		DESKTOP_WINDOW_TITLEBAR_STYLES[style] ??
		DESKTOP_WINDOW_TITLEBAR_STYLES.glass;
	return (
		<div
			className={cn(
				'pointer-events-none mb-1 w-full select-none overflow-hidden rounded-xl shadow-(--desktop-shadow-soft) ring-1 ring-(--desktop-border-subtle)',
				preset.frame
			)}
			data-desktop-window-style-mini={style}
		>
			<div className={cn('flex h-7 items-center gap-1 px-2', titlebar.root)}>
				<span className="size-2 rounded-full bg-[#ff5f56]/92 shadow-inner ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.12)]" />
				<span className="size-2 rounded-full bg-[#febc2e]/92 shadow-inner ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.1)]" />
				<span className="size-2 rounded-full bg-[#28c840]/92 shadow-inner ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.1)]" />
				<span
					className={cn(
						'ml-auto h-1 w-12 max-w-[46%] rounded-full',
						titlebar.pill
					)}
				/>
			</div>
			<div className={cn('h-[2.85rem] px-2 py-2', preset.content)}>
				<div className="h-full w-full rounded-lg bg-[rgb(var(--desktop-fg-primary-rgb)/0.06)] shadow-inner ring-1 ring-(--desktop-border-subtle)" />
			</div>
		</div>
	);
}
