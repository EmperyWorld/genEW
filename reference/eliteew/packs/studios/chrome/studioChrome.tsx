import * as React from 'react';
import { useCallback, useMemo } from 'react';
import { TooltipV2 } from '../../components/ui/TooltipV2';
import { cn } from '../../lib/utils';
import { DESKTOP_INTERACTIVE } from '../Desktop/constants';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '../Desktop/components/DesktopAppChrome';
import { useDesktopShellFrame } from '../Desktop/context/DesktopShellFrameContext';
import {
	getDesktopShellContentPanelClassName,
	getDesktopShellEmbeddedAppRootClassName,
	getDesktopShellToolbarClusterClassName,
	getDesktopShellToolbarClusterInsetControlClassName,
} from '../Desktop/utils/desktopVisualSystem';
import type { DesktopWindowStyle } from '../../types/profile';
import {
	ArrowPathIcon,
	QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';

const studioPrimaryBase = `${DESKTOP_CHROME_FOCUS_VISIBLE} font-medium text-white transition hover:brightness-110 active:brightness-95 focus:outline-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none bg-[rgb(var(--desktop-accent-rgb))]`;

/** Creative studio apps: standalone page chrome (full route, not desktop window). */
export const studioPageShellClass =
	'h-full overflow-auto bg-(--desktop-surface-app) text-(--desktop-text-primary) antialiased';

/**
 * Embedded desktop window root — transparent so window `content` + framed
 * {@link getDesktopShellContentPanelClassName} preset show through.
 */
export const studioPageEmbeddedShellClass =
	getDesktopShellEmbeddedAppRootClassName();

/** Единственная прокручиваемая область embedded-студии. */
export const studioPageScrollRegionClass =
	'min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [scrollbar-width:thin] motion-reduce:scroll-auto';

export const studioPageChromeInsetClass =
	'shrink-0 space-y-4 px-4 pt-4 sm:space-y-5 sm:px-6 sm:pt-5 lg:px-8';

export const studioPageBodyInsetClass =
	'px-4 pb-6 pt-1 sm:px-6 lg:px-8 xl:pb-8';

export const studioPageContentClass =
	'w-full p-4 sm:p-6 lg:p-8 xl:p-10 space-y-4 sm:space-y-5 lg:space-y-6';

export const studioPanelInnerClass = 'p-5 sm:p-6 lg:p-7';

export const studioFieldLabelClass =
	'mb-1.5 block text-sm font-medium text-(--desktop-text-secondary)';
export const studioFieldMetaClass = 'text-xs text-(--desktop-text-dim)';
export const studioDisclosureHintClass =
	'text-xs uppercase tracking-[0.16em] text-(--desktop-text-dim)';

export const studioTabLabelClass = 'min-w-0 truncate text-left';

export const studioWorkspaceGridClass =
	'grid min-h-0 min-w-0 gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]';
export const studioSidebarStackClass = 'space-y-6';
export const studioMainStackClass = 'space-y-6 min-w-0';

export const studioParamsScrollClass =
	'min-h-0 min-w-0 w-full max-h-[min(72vh,920px)] overflow-y-auto overflow-x-hidden pr-1 [scrollbar-width:thin] motion-reduce:scroll-auto';

export const studioPrimaryButtonClass = cn(
	'inline-flex items-center gap-2 rounded-2xl px-5 py-3 shadow-[0_14px_36px_rgba(0,0,0,0.42)] active:scale-[0.98] motion-reduce:active:scale-100',
	studioPrimaryBase
);

export const studioPrimaryActionSmClass = cn(
	'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs shadow-[0_10px_24px_rgba(0,0,0,0.35)]',
	studioPrimaryBase
);

export const studioSliderClass =
	'h-2 w-full cursor-pointer appearance-none rounded-full bg-(--desktop-border-subtle) accent-[rgb(var(--desktop-accent-rgb))]';

export type CreativeStudioShellClasses = {
	shellFrame: DesktopWindowStyle;
	studioPanelClass: string;
	studioMutedPanelClass: string;
	studioSoftPanelClass: string;
	studioTabRailClass: string;
	studioInputClass: string;
	studioPrimaryButtonClass: string;
	studioSecondaryButtonClass: string;
	studioGhostChipClass: string;
	studioDropzoneClass: string;
	studioHistoryCardClass: string;
	studioListItemClass: string;
	studioInlineActionClass: string;
	studioAudioClass: string;
	studioAlertClass: string;
	studioDisclosureButtonClass: string;
	studioPreviewWellClass: string;
	studioTabButtonClass: (
		active: boolean,
		accent?: 'violet' | 'emerald' | 'fuchsia'
	) => string;
	studioHeroIconWrapClass: string;
	studioMetricTileClass: string;
	studioSliderClass: string;
};

/**
 * Пресет «Стиль окон» (glass / framed / minimal) для Creative Studio:
 * музыка, видео, изображения и т.д.
 */
export function useCreativeStudioShellClasses(): CreativeStudioShellClasses {
	const shellFrame = useDesktopShellFrame();

	const studioPanelClass = useMemo(
		() =>
			cn(
				getDesktopShellContentPanelClassName(shellFrame),
				'rounded-[var(--desktop-radius-shell)]'
			),
		[shellFrame]
	);

	const studioMutedPanelClass = useMemo(
		() =>
			cn(
				getDesktopShellContentPanelClassName(shellFrame),
				'rounded-(--desktop-radius-xl) overflow-hidden'
			),
		[shellFrame]
	);

	const studioSoftPanelClass = useMemo(
		() =>
			cn(
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'rounded-(--desktop-radius-lg) shadow-(--desktop-shadow-soft)'
			),
		[shellFrame]
	);

	const studioTabRailClass = useMemo(
		() =>
			cn(
				getDesktopShellToolbarClusterClassName(shellFrame),
				'flex w-full flex-nowrap gap-2 overflow-x-auto overflow-y-hidden rounded-(--desktop-radius-xl) p-2 [scrollbar-width:thin] motion-reduce:scroll-auto'
			),
		[shellFrame]
	);

	const studioInputClass = useMemo(
		() =>
			cn(
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				DESKTOP_CHROME_FOCUS_VISIBLE,
				'box-border w-full min-w-0 rounded-2xl px-4 py-3 text-sm text-(--desktop-text-primary) placeholder:text-(--desktop-text-dim) shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm transition',
				DESKTOP_INTERACTIVE.inputFocus
			),
		[shellFrame]
	);

	const studioSecondaryButtonClass = useMemo(
		() =>
			cn(
				DESKTOP_CHROME_FOCUS_VISIBLE,
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'inline-flex items-center gap-2 rounded-2xl px-4 py-3 font-medium text-(--desktop-text-secondary) active:scale-[0.98] motion-reduce:active:scale-100 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50'
			),
		[shellFrame]
	);

	const studioGhostChipClass = useMemo(
		() =>
			cn(
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-(--desktop-text-muted)'
			),
		[shellFrame]
	);

	const studioDropzoneClass = useMemo(
		() =>
			cn(
				getDesktopShellContentPanelClassName(shellFrame),
				'flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-(--desktop-radius-xl) border-2 border-dashed border-(--desktop-border-subtle) p-6 text-center transition-all hover:border-[rgb(var(--desktop-accent-rgb)/0.35)]'
			),
		[shellFrame]
	);

	const studioHistoryCardClass = useMemo(
		() =>
			cn(
				getDesktopShellContentPanelClassName(shellFrame),
				'overflow-hidden rounded-(--desktop-radius-lg) transition-all hover:-translate-y-0.5 hover:border-(--desktop-border-strong) motion-reduce:transition-none motion-reduce:hover:translate-y-0'
			),
		[shellFrame]
	);

	const studioListItemClass = useMemo(
		() =>
			cn(
				getDesktopShellContentPanelClassName(shellFrame),
				'flex items-center gap-4 rounded-(--desktop-radius-lg) p-4 transition-all hover:-translate-y-0.5 hover:border-(--desktop-border-strong) motion-reduce:transition-none motion-reduce:hover:translate-y-0'
			),
		[shellFrame]
	);

	const studioInlineActionClass = useMemo(
		() =>
			cn(
				DESKTOP_CHROME_FOCUS_VISIBLE,
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-(--desktop-text-secondary)'
			),
		[shellFrame]
	);

	const studioAudioClass = useMemo(
		() =>
			cn(
				'h-10 rounded-2xl',
				DESKTOP_CHROME_FOCUS_VISIBLE,
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame)
			),
		[shellFrame]
	);

	const studioAlertClass = useMemo(
		() =>
			cn(
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'flex items-center gap-3 rounded-2xl p-4 text-sm shadow-inner'
			),
		[shellFrame]
	);

	const studioDisclosureButtonClass = useMemo(
		() =>
			cn(
				DESKTOP_CHROME_FOCUS_VISIBLE,
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'inline-flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-(--desktop-text-secondary) transition'
			),
		[shellFrame]
	);

	const studioPreviewWellClass = useMemo(
		() =>
			cn(
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'relative min-h-0 overflow-hidden rounded-(--desktop-radius-xl) p-3 ring-1 ring-black/10 sm:p-4'
			),
		[shellFrame]
	);

	const studioHeroIconWrapClass = useMemo(
		() =>
			cn(
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-(--desktop-text-secondary)'
			),
		[shellFrame]
	);

	const studioMetricTileClass = useMemo(
		() =>
			cn(
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
				'min-w-[118px] rounded-(--desktop-radius-lg) px-3 py-2.5'
			),
		[shellFrame]
	);

	const studioTabButtonClass = useCallback(
		(active: boolean, accent?: 'violet' | 'emerald' | 'fuchsia') => {
			void accent;
			return cn(
				DESKTOP_CHROME_FOCUS_VISIBLE,
				'inline-flex min-w-0 shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 motion-reduce:transition-none',
				active
					? 'border border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.14)] text-(--desktop-text-primary) shadow-[0_12px_32px_rgba(0,0,0,0.18)] ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.28)]'
					: cn(
							getDesktopShellToolbarClusterInsetControlClassName(shellFrame),
							'border-transparent bg-transparent shadow-none ring-0 hover:border-(--desktop-border-subtle) hover:bg-(--desktop-surface-soft)',
							'text-(--desktop-text-muted) hover:text-(--desktop-text-secondary)'
						)
			);
		},
		[shellFrame]
	);

	return useMemo(
		() => ({
			shellFrame,
			studioPanelClass,
			studioMutedPanelClass,
			studioSoftPanelClass,
			studioTabRailClass,
			studioInputClass,
			studioPrimaryButtonClass,
			studioSecondaryButtonClass,
			studioGhostChipClass,
			studioDropzoneClass,
			studioHistoryCardClass,
			studioListItemClass,
			studioInlineActionClass,
			studioAudioClass,
			studioAlertClass,
			studioDisclosureButtonClass,
			studioPreviewWellClass,
			studioTabButtonClass,
			studioHeroIconWrapClass,
			studioMetricTileClass,
			studioSliderClass,
		}),
		[
			shellFrame,
			studioPanelClass,
			studioMutedPanelClass,
			studioSoftPanelClass,
			studioTabRailClass,
			studioInputClass,
			studioSecondaryButtonClass,
			studioGhostChipClass,
			studioDropzoneClass,
			studioHistoryCardClass,
			studioListItemClass,
			studioInlineActionClass,
			studioAudioClass,
			studioAlertClass,
			studioDisclosureButtonClass,
			studioPreviewWellClass,
			studioTabButtonClass,
			studioHeroIconWrapClass,
			studioMetricTileClass,
		]
	);
}

interface StudioHeroHeaderProps {
	kicker: string;
	title: string;
	subtitle: string;
	icon: React.ReactNode;
	/** @deprecated Ignored — single neutral treatment for all studios */
	accent?: 'violet' | 'emerald' | 'fuchsia';
	meta?: React.ReactNode;
	/** По умолчанию компактная шапка для всех студий. `default` — крупнее (редко нужно). */
	density?: 'default' | 'compact';
}

export const StudioHeroHeader: React.FC<StudioHeroHeaderProps> = ({
	kicker,
	title,
	subtitle,
	icon,
	accent: _accent,
	meta,
	density = 'compact',
}) => {
	void _accent;
	const { studioPanelClass, studioGhostChipClass, studioHeroIconWrapClass } =
		useCreativeStudioShellClasses();

	const compact = density === 'compact';

	return (
		<section className={cn(studioPanelClass, 'relative overflow-hidden')}>
			<div
				className="pointer-events-none absolute inset-0 motion-reduce:opacity-80"
				aria-hidden
			>
				<div className="absolute inset-x-0 top-0 h-px bg-(--desktop-border-strong)" />
				<div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent_32%,rgba(0,0,0,0.18)_100%)] motion-reduce:bg-none" />
				<div
					className={cn(
						'absolute -left-10 rounded-full bg-[rgb(var(--desktop-accent-rgb)/0.06)] blur-3xl motion-reduce:blur-none motion-reduce:opacity-40',
						compact ? 'top-3 h-12 w-12 opacity-70' : 'top-5 h-20 w-20'
					)}
				/>
			</div>
			<div
				className={cn(
					'relative flex flex-col lg:flex-row lg:items-center lg:justify-between',
					compact
						? 'gap-2 p-3 sm:p-4 lg:gap-3'
						: 'gap-3 p-4 sm:p-5 lg:gap-4 lg:p-6'
				)}
			>
				<div className="min-w-0">
					<div
						className={cn(
							studioGhostChipClass,
							compact
								? 'px-2 py-0.5 text-[9px] tracking-[0.2em]'
								: 'px-2.5 py-1 text-[10px] tracking-[0.22em]'
						)}
					>
						{kicker}
					</div>
					<div
						className={cn(
							'flex items-start gap-3',
							compact ? 'mt-1.5' : 'mt-2.5'
						)}
					>
						<div
							className={cn(
								studioHeroIconWrapClass,
								compact && 'h-9 w-9 rounded-xl'
							)}
						>
							{icon}
						</div>
						<div className="min-w-0">
							<h1
								className={cn(
									'font-semibold tracking-[-0.03em] text-(--desktop-text-primary)',
									compact
										? 'text-base sm:text-lg'
										: 'text-lg sm:text-xl lg:text-2xl'
								)}
							>
								{title}
							</h1>
							<p
								className={cn(
									'text-(--desktop-text-muted)',
									compact
										? 'mt-0.5 max-w-3xl text-xs leading-snug line-clamp-2'
										: 'mt-1 max-w-3xl text-xs leading-5 sm:text-sm'
								)}
							>
								{subtitle}
							</p>
						</div>
					</div>
				</div>
				{meta ? (
					<div
						className={cn(
							'grid shrink-0 grid-cols-2 gap-2',
							compact ? 'lg:min-w-[220px]' : 'lg:min-w-[260px]'
						)}
					>
						{meta}
					</div>
				) : null}
			</div>
		</section>
	);
};

interface StudioMetricProps {
	label: string;
	value: string;
}

export const StudioMetric: React.FC<StudioMetricProps> = ({ label, value }) => {
	const { studioMetricTileClass } = useCreativeStudioShellClasses();
	return (
		<div className={studioMetricTileClass}>
			<p className="text-[10px] uppercase tracking-[0.16em] text-(--desktop-text-dim)">
				{label}
			</p>
			<p className="mt-1 text-sm font-semibold tracking-[-0.02em] text-(--desktop-text-primary)">
				{value}
			</p>
		</div>
	);
};

/** Карточка-секция для групп полей (Image/Video/Music Studio). */
export interface StudioSectionCardProps {
	title?: string;
	hint?: string;
	children: React.ReactNode;
}

export const StudioSectionCard: React.FC<StudioSectionCardProps> = ({
	title,
	hint,
	children,
}) => {
	const { studioPanelClass } = useCreativeStudioShellClasses();
	return (
		<div className={cn(studioPanelClass, 'min-h-0 min-w-0')}>
			<div className={cn(studioPanelInnerClass, 'min-h-0 min-w-0')}>
				{title && (
					<div className="mb-4 border-b border-(--desktop-border-subtle) pb-3">
						<h3 className="text-sm font-semibold text-(--desktop-text-primary)">
							{title}
						</h3>
						{hint && (
							<p className="mt-0.5 text-xs text-(--desktop-text-dim)">{hint}</p>
						)}
					</div>
				)}
				{children}
			</div>
		</div>
	);
};

/** Кнопка «?» с подсказкой — токены десктопа, не slate. */
export const StudioHelpIconButton: React.FC<{ help: string }> = ({ help }) => {
	const { studioInlineActionClass } = useCreativeStudioShellClasses();
	return (
		<TooltipV2 content={help} placement="top" delayShow={150}>
			<button
				type="button"
				className={cn(
					studioInlineActionClass,
					'h-8 w-8 shrink-0 rounded-full p-0 text-(--desktop-text-muted) hover:bg-(--desktop-surface-soft) hover:text-(--desktop-text-secondary)'
				)}
				aria-label="Подсказка"
			>
				<QuestionMarkCircleIcon className="h-3.5 w-3.5" aria-hidden />
			</button>
		</TooltipV2>
	);
};

/** Скелет загрузки списка истории (единый для студий). */
export const StudioHistoryLoadingState: React.FC<{ message?: string }> = ({
	message = 'Загрузка списка…',
}) => {
	const { studioMutedPanelClass } = useCreativeStudioShellClasses();
	return (
		<div
			className={cn(
				studioMutedPanelClass,
				'flex min-h-[220px] flex-col items-center justify-center gap-4'
			)}
			role="status"
			aria-live="polite"
		>
			<ArrowPathIcon
				className="h-10 w-10 animate-spin text-[rgb(var(--desktop-accent-rgb)/0.9)] motion-reduce:animate-none"
				aria-hidden
			/>
			<p className="text-sm text-(--desktop-text-secondary)">{message}</p>
		</div>
	);
};

export interface StudioEmptyStateProps {
	icon: React.ReactNode;
	title: string;
	hint: string;
	description: string;
	/** Например min-h-[300px] для превью-зоны */
	className?: string;
}

/** Пустое состояние списка/превью в студиях. */
export const StudioEmptyState: React.FC<StudioEmptyStateProps> = ({
	icon,
	title,
	hint,
	description,
	className,
}) => {
	const { studioMutedPanelClass } = useCreativeStudioShellClasses();
	return (
		<div
			className={cn(
				studioMutedPanelClass,
				'flex min-h-[220px] flex-col items-center justify-center px-8 text-center',
				className
			)}
			role="status"
		>
			<div className="mb-4 text-(--desktop-text-muted) [&_svg]:h-12 [&_svg]:w-12">
				{icon}
			</div>
			<p className="text-base font-medium text-(--desktop-text-primary)">
				{title}
			</p>
			<p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-(--desktop-text-dim)">
				{hint}
			</p>
			<p className="mt-3 max-w-md text-sm text-(--desktop-text-muted)">
				{description}
			</p>
		</div>
	);
};
