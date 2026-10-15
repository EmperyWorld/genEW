/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared Desktop app chrome primitives: surfaces, buttons, inputs, modal shells,
 * product workspaces and menu structures used by user-facing desktop apps.
 * `DesktopProductWorkspace` is the default shell for App Store (page), GAF Chat,
 * Assistant, Feedback Hub, Notifications window, and Widget Shelf window.
 *
 * Invariants:
 * - Public primitives must keep keyboard-visible focus styles.
 * - No backdrop-filter / glass blur on shared chrome surfaces (flat opaque shell).
 * - Primitive fallback copy comes from shared i18n namespaces, not hard-coded labels.
 *
 * Related:
 * - documentation/product/desktop/DESKTOP_DESIGN_SYSTEM.md
 * - documentation/product/UX-UI-GLOBAL-IMPROVEMENT-PROGRAM-2026-05.md
 */

import { cn } from '@/utils/cn';
import { cva, type VariantProps } from '@/utils/cva';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { COMMON_UI_NS } from '@/i18n/namespaces';
import { useTranslation } from 'react-i18next';
import * as React from 'react';
import {
	forwardRef,
	type ButtonHTMLAttributes,
	type HTMLAttributes,
	type InputHTMLAttributes,
	type ReactNode,
	type SelectHTMLAttributes,
} from 'react';
import {
	DESKTOP_LUCIDE,
	DESKTOP_OVERLAY,
	DESKTOP_TYPOGRAPHY,
} from '@/pages/Desktop/constants';
import { DesktopChromeTooltip } from '@/pages/Desktop/components/DesktopChromeTooltip';
import { DesktopShellFloatingPortal } from '@/pages/Desktop/components/DesktopShellFloatingPortal';
import type { DesktopWindowStyle } from '../../../types/profile';
import { useDesktopShellFrame } from '../context/DesktopShellFrameContext';
import {
	DESKTOP_WINDOW_FRAME_STYLES,
	getDesktopNativeSelectControlClassName,
	getDesktopShellContentPanelClassName,
	getDesktopShellContextMenuClassName,
	getDesktopShellHeaderStripClassName,
	getDesktopShellPanelClassName,
} from '../utils/desktopVisualSystem';

/** Single inset focus ring for desktop chrome — avoids ring-offset double outlines */
export const DESKTOP_CHROME_FOCUS_VISIBLE =
	'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]';

export const DESKTOP_APP_STYLE_CONTRACT = {
	/** Transparent in desktop windows so framed/content chrome shows; full-page routes may override. */
	shell: 'bg-transparent text-(--desktop-text-primary)',
	panel:
		'rounded-(--desktop-radius-lg) border border-(--desktop-border-subtle) bg-(--desktop-surface-panel)',
	panelStrong:
		'rounded-(--desktop-radius-xl) border border-(--desktop-border-strong) bg-(--desktop-surface-panel-strong)',
	softCard:
		'rounded-(--desktop-radius) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)',
	toolbar:
		'flex min-w-0 items-center gap-2 border-b border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2 shrink-0',
	sectionLabel: cn(
		DESKTOP_TYPOGRAPHY.captionInherit,
		'uppercase tracking-[0.18em] text-(--desktop-text-secondary)'
	),
	/** Dense tiles (e.g. dashboard KPI) — same voice as sectionLabel, one step smaller */
	sectionLabelCompact: DESKTOP_TYPOGRAPHY.sectionPill,
	counterBadge:
		'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium',
	listRow: cn(
		'w-full text-left rounded-(--desktop-radius) px-3 py-3 transition-colors duration-200 motion-reduce:transition-none',
		DESKTOP_CHROME_FOCUS_VISIBLE
	),
	searchField:
		'w-full rounded-(--desktop-radius) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2.5 text-sm text-(--desktop-text-primary) placeholder:text-(--desktop-text-dim) outline-none transition-colors duration-200 motion-reduce:transition-none scheme-dark',
	helperText: DESKTOP_TYPOGRAPHY.caption,
	emptyIcon:
		'flex h-16 w-16 items-center justify-center rounded-(--desktop-radius-lg) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)',
	modalBackdrop: cn(
		'fixed inset-0 flex items-center justify-center',
		DESKTOP_OVERLAY.backdrop
	),
} as const;

export type DesktopAppFamily =
	| 'shell'
	| 'docs'
	| 'media'
	| 'ai'
	| 'communication'
	| 'productivity'
	| 'system'
	| 'iframe';

export type DesktopAppSurfaceMode = 'standard' | 'framed' | 'passthrough';

export const DESKTOP_APP_FAMILY_BY_COMPONENT: Record<string, DesktopAppFamily> =
	{
		AppStore: 'shell',
		DesktopShellSettings: 'shell',
		MarketingCabinet: 'shell',
		EwaApp: 'ai',
		CustomerCabinet: 'shell',
		UserSiteStudio: 'shell',
		KirsCuration: 'shell',
		KirsClientSite: 'shell',
		ContentManagerPro: 'docs',
		DocEditor: 'docs',
		DocEditorV2: 'docs',
		MusicPlayer: 'media',
		MusicGenerator: 'media',
		MusicEvolutionApp: 'media',
		MusicForgeApp: 'media',
		PoemmaApp: 'productivity',
		ProjectAboutApp: 'iframe',
		EmperyNexusChronicleApp: 'productivity',
		StudioGU: 'media',
		ImageStudio: 'media',
		VideoStudio: 'media',
		UGS: 'ai',
		UGSHubApp: 'ai',
		GAFChatApp: 'communication',
		VideoCallApp: 'communication',
		DesktopAiChatApp: 'productivity',
		FriendsApp: 'communication',
		SocialHubApp: 'communication',
		UserProfile: 'system',
		ClipboardManager: 'system',
		NotificationsApp: 'communication',
		DesktopWidgetShelfApp: 'productivity',
		DesktopDashboardFavoritesApp: 'productivity',
		FeedbackHubApp: 'communication',
		AssistantApp: 'communication',
		EWDeskApp: 'communication',
		ProfessionalWorlds: 'shell',
	};

const FAMILY_SURFACE_MODE: Record<DesktopAppFamily, DesktopAppSurfaceMode> = {
	shell: 'framed',
	docs: 'framed',
	media: 'framed',
	ai: 'passthrough',
	communication: 'framed',
	productivity: 'framed',
	system: 'passthrough',
	iframe: 'passthrough',
};

const COMPONENT_SURFACE_MODE_OVERRIDES: Partial<
	Record<string, DesktopAppSurfaceMode>
> = {
	FriendsApp: 'passthrough',
	SocialHubApp: 'passthrough',
	MusicPlayer: 'framed',
	MusicGenerator: 'framed',
	MusicEvolutionApp: 'framed',
	MusicForgeApp: 'framed',
	PoemmaApp: 'framed',
	ProjectAboutApp: 'passthrough',
	EmperyNexusChronicleApp: 'passthrough',
	ImageStudio: 'framed',
	VideoStudio: 'framed',
	/** Окно с полосой контента как у других приложений (`getDesktopShellPanelClassName` strong). */
	DocEditor: 'standard',
	DocEditorV2: 'standard',
	ContentManagerPro: 'standard',
	StudioGU: 'framed',
	UGS: 'framed',
	UGSHubApp: 'framed',
	EwaApp: 'standard',
	UserProfile: 'passthrough',
};

export function getDesktopAppFamily(
	appComponent?: string | null
): DesktopAppFamily {
	if (!appComponent) return 'shell';
	return DESKTOP_APP_FAMILY_BY_COMPONENT[appComponent] ?? 'system';
}

export function getDesktopAppSurfaceMode(
	appComponent?: string | null
): DesktopAppSurfaceMode {
	if (!appComponent) return 'framed';
	return (
		COMPONENT_SURFACE_MODE_OVERRIDES[appComponent] ??
		FAMILY_SURFACE_MODE[getDesktopAppFamily(appComponent)]
	);
}

/** Context menus: graphite shell — menu-specific border + theme-aware surface tint.
 *  Используем `border-[var(--…)]`, а не `border-(--…)` — иначе утилита может не попасть в CSS (JIT).
 */
const MENU_SURFACE =
	'rounded-(--desktop-radius-lg) border border-[var(--desktop-border-menu)] bg-(--desktop-surface-panel-strong)';

const surfaceVariants = cva('min-h-0', {
	variants: {
		variant: {
			shell: DESKTOP_APP_STYLE_CONTRACT.shell,
			panel: DESKTOP_APP_STYLE_CONTRACT.panel,
			panelStrong: DESKTOP_APP_STYLE_CONTRACT.panelStrong,
			/** Softer recessed bubble (e.g. assistant replies vs user panel). */
			inset: cn(
				'rounded-(--desktop-radius-lg) border border-(--desktop-border-subtle)',
				'border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.42)]',
				'bg-(--desktop-surface-soft)',
				'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]',
				'ring-1 ring-inset ring-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.08)_100%,transparent)]'
			),
			menu: MENU_SURFACE,
			soft: DESKTOP_APP_STYLE_CONTRACT.softCard,
		},
		padding: {
			none: '',
			sm: 'p-2',
			md: 'p-3',
			lg: 'p-4',
		},
	},
	defaultVariants: {
		variant: 'panel',
		padding: 'none',
	},
});

interface DesktopAppSurfaceProps
	extends HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof surfaceVariants> {}

export const DesktopAppSurface: React.FC<DesktopAppSurfaceProps> = ({
	className,
	variant,
	padding,
	style,
	...props
}) => {
	const surfaceShadowClass =
		variant === 'menu' || variant === 'panelStrong'
			? 'shadow-[var(--desktop-shadow-panel)]'
			: variant === 'panel' || variant === 'soft'
				? 'shadow-[var(--desktop-shadow-soft)]'
				: '';
	return (
		<div
			className={cn(
				surfaceVariants({ variant, padding }),
				surfaceShadowClass,
				className
			)}
			style={style}
			{...props}
		/>
	);
};

export const DesktopAppPanel: React.FC<DesktopAppSurfaceProps> = (props) => (
	<DesktopAppSurface variant="panel" {...props} />
);

export const DesktopAppToolbar: React.FC<HTMLAttributes<HTMLDivElement>> = ({
	className,
	...props
}) => (
	<div
		className={cn(DESKTOP_APP_STYLE_CONTRACT.toolbar, className)}
		{...props}
	/>
);

export interface DesktopProductWorkspaceProps
	extends HTMLAttributes<HTMLDivElement> {
	header?: ReactNode;
	toolbar?: ReactNode;
	status?: ReactNode;
	footer?: ReactNode;
	contentClassName?: string;
}

export const DesktopProductWorkspace = forwardRef<
	HTMLDivElement,
	DesktopProductWorkspaceProps
>(
	(
		{
			className,
			header,
			toolbar,
			status,
			children,
			footer,
			contentClassName,
			...props
		},
		ref
	) => (
		<div
			ref={ref}
			className={cn(
				'flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-(--desktop-text-primary)',
				className
			)}
			{...props}
		>
			{header ? <div className="shrink-0">{header}</div> : null}
			{toolbar ? <div className="shrink-0">{toolbar}</div> : null}
			{status ? <div className="shrink-0">{status}</div> : null}
			<div className={cn('min-h-0 flex-1 overflow-y-auto', contentClassName)}>
				{children}
			</div>
			{footer ? <div className="shrink-0">{footer}</div> : null}
		</div>
	)
);
DesktopProductWorkspace.displayName = 'DesktopProductWorkspace';

export interface DesktopProductHeaderProps
	extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
	eyebrow?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	meta?: ReactNode;
}

export const DesktopProductHeader: React.FC<DesktopProductHeaderProps> = ({
	className,
	eyebrow,
	title,
	description,
	actions,
	meta,
	...props
}) => (
	<header
		className={cn(
			'flex flex-wrap items-start justify-between gap-4 border-b border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/30 px-4 py-4',
			className
		)}
		{...props}
	>
		<div className="min-w-0 flex-1 space-y-1">
			{eyebrow ? (
				<DesktopAppSectionLabel>{eyebrow}</DesktopAppSectionLabel>
			) : null}
			{typeof title === 'string' ? (
				<DesktopChromeTooltip content={title} placement="top" offsetExtra={4}>
					<h1 className="desktop-shell-display-text truncate text-lg font-semibold tracking-tight text-(--desktop-text-primary)">
						{title}
					</h1>
				</DesktopChromeTooltip>
			) : (
				<h1 className="desktop-shell-display-text truncate text-lg font-semibold tracking-tight text-(--desktop-text-primary)">
					{title}
				</h1>
			)}
			{description ? (
				<p className="max-w-3xl text-sm leading-6 text-(--desktop-text-secondary)">
					{description}
				</p>
			) : null}
			{meta ? (
				<div className="text-xs leading-5 text-(--desktop-text-muted)">
					{meta}
				</div>
			) : null}
		</div>
		{actions ? (
			<div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
				{actions}
			</div>
		) : null}
	</header>
);

export type DesktopProductStatusTone =
	| 'info'
	| 'success'
	| 'warning'
	| 'danger'
	| 'neutral';

const PRODUCT_STATUS_TONE_CLASS: Record<DesktopProductStatusTone, string> = {
	info: 'border-sky-400/25 bg-sky-500/10 text-sky-50',
	success: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-50',
	warning: 'border-amber-400/25 bg-amber-500/10 text-amber-50',
	danger: 'border-red-400/25 bg-red-500/10 text-red-50',
	neutral:
		'border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary)',
};

export interface DesktopProductStatusBannerProps
	extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
	tone?: DesktopProductStatusTone;
	title?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}

export const DesktopProductStatusBanner: React.FC<
	DesktopProductStatusBannerProps
> = ({
	className,
	tone = 'info',
	title,
	description,
	actions,
	children,
	role = 'status',
	'aria-live': ariaLive = 'polite',
	...props
}) => (
	<div
		role={role}
		aria-live={ariaLive}
		className={cn(
			'flex flex-wrap items-start justify-between gap-3 border px-4 py-3 text-sm',
			PRODUCT_STATUS_TONE_CLASS[tone],
			className
		)}
		{...props}
	>
		<div className="min-w-0 flex-1">
			{title ? <div className="font-medium">{title}</div> : null}
			{description ? (
				<div className="mt-1 leading-6 opacity-85">{description}</div>
			) : null}
			{children ? (
				<div className={title || description ? 'mt-2' : undefined}>
					{children}
				</div>
			) : null}
		</div>
		{actions ? (
			<div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
				{actions}
			</div>
		) : null}
	</div>
);

export interface DesktopProductStatePanelProps
	extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
	state?:
		| 'empty'
		| 'loading'
		| 'error'
		| 'offline'
		| 'permissionDenied'
		| 'ready';
	icon?: ReactNode;
	title?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}

export const DesktopProductStatePanel: React.FC<
	DesktopProductStatePanelProps
> = ({
	className,
	state = 'empty',
	icon,
	title,
	description,
	actions,
	children,
	...props
}) => {
	const { t } = useTranslation(COMMON_UI_NS);
	const resolvedTitle = title ?? t(`states.${state}`);
	return (
		<DesktopAppEmptyState
			className={cn('min-h-72', className)}
			icon={icon}
			title={resolvedTitle}
			description={description}
			{...props}
		>
			{children}
			{actions ? (
				<div className="flex flex-wrap justify-center gap-2">{actions}</div>
			) : null}
		</DesktopAppEmptyState>
	);
};

export interface DesktopProductNextActionProps
	extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}

export const DesktopProductNextAction: React.FC<
	DesktopProductNextActionProps
> = ({ className, title, description, actions, children, ...props }) => {
	const { t } = useTranslation(COMMON_UI_NS);
	return (
		<DesktopAppSurface
			variant="soft"
			padding="sm"
			className={cn(
				'border-[rgb(var(--desktop-accent-rgb))]/25 bg-(--desktop-surface-accent)',
				className
			)}
			{...props}
		>
			<DesktopAppSectionLabel>
				{t('workspace.nextAction')}
			</DesktopAppSectionLabel>
			<div className="mt-2 text-sm font-medium text-(--desktop-text-primary)">
				{title}
			</div>
			{description ? (
				<p className="mt-1 text-sm leading-6 text-(--desktop-text-secondary)">
					{description}
				</p>
			) : null}
			{children ? <div className="mt-3">{children}</div> : null}
			{actions ? (
				<div className="mt-3 flex flex-wrap gap-2">{actions}</div>
			) : null}
		</DesktopAppSurface>
	);
};

export const DesktopAppSectionLabel: React.FC<
	HTMLAttributes<HTMLSpanElement>
> = ({ className, ...props }) => (
	<span
		className={cn(DESKTOP_APP_STYLE_CONTRACT.sectionLabel, className)}
		{...props}
	/>
);

const buttonVariants = cva(
	cn(
		'inline-flex items-center justify-center gap-2 rounded-(--desktop-radius) border text-sm transition-colors duration-200 motion-reduce:transition-none',
		DESKTOP_CHROME_FOCUS_VISIBLE,
		'disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none disabled:saturate-[0.65] disabled:grayscale-[0.2]'
	),
	{
		variants: {
			variant: {
				neutral:
					'border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary) hover:bg-(--desktop-surface-soft-hover) active:bg-(--desktop-surface-soft-active)',
				accent:
					'border-[rgb(var(--desktop-accent-rgb))]/25 bg-(--desktop-surface-accent) text-(--desktop-text-primary) hover:bg-(--desktop-surface-accent-strong) active:bg-(--desktop-surface-accent)',
				danger:
					'border-[color-mix(in_srgb,rgb(239_68_68)_42%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,rgb(239_68_68)_14%,var(--desktop-surface-soft))] text-[color-mix(in_srgb,rgb(185_28_28)_72%,var(--desktop-text-primary))] hover:bg-[color-mix(in_srgb,rgb(239_68_68)_22%,var(--desktop-surface-soft-hover))] active:bg-[color-mix(in_srgb,rgb(220_38_38)_26%,var(--desktop-surface-soft-active))] focus-visible:ring-[color-mix(in_srgb,rgb(239_68_68)_50%,transparent)]',
				ghost:
					'border-transparent bg-transparent text-(--desktop-text-muted) hover:bg-(--desktop-surface-soft) hover:text-(--desktop-text-primary) active:bg-(--desktop-surface-soft-hover)',
			},
			size: {
				sm: cn('px-2.5 py-1', DESKTOP_TYPOGRAPHY.captionInherit),
				md: 'px-3 py-2 text-sm',
				icon: 'h-10 w-10 min-h-10 min-w-10 p-0',
			},
			active: {
				true: 'text-[rgb(var(--desktop-accent-rgb))] border-[rgb(var(--desktop-accent-rgb))]/40 bg-(--desktop-surface-accent)',
				false: '',
			},
		},
		defaultVariants: {
			variant: 'neutral',
			size: 'md',
			active: false,
		},
	}
);

interface DesktopAppButtonProps
	extends ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {}

export const DesktopAppButton = React.forwardRef<
	HTMLButtonElement,
	DesktopAppButtonProps
>(({ className, variant, size, active, ...props }, ref) => (
	<button
		ref={ref}
		className={cn(buttonVariants({ variant, size, active }), className)}
		{...props}
	/>
));
DesktopAppButton.displayName = 'DesktopAppButton';

export const DesktopAppInput = forwardRef<
	HTMLInputElement,
	InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
	<input
		ref={ref}
		className={cn(
			DESKTOP_APP_STYLE_CONTRACT.searchField,
			DESKTOP_CHROME_FOCUS_VISIBLE,
			'focus:border-(--desktop-border-strong) focus:bg-(--desktop-surface-soft-hover)',
			className
		)}
		{...props}
	/>
));
DesktopAppInput.displayName = 'DesktopAppInput';

/** Нативный `<select>` с оболочкой десктопа (пресет окна) и кастомной стрелкой. */
export const DesktopNativeSelect = forwardRef<
	HTMLSelectElement,
	SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
	const shellFrame = useDesktopShellFrame();
	return (
		<div className="relative inline-flex w-full min-w-40 max-w-full align-middle">
			<select
				ref={ref}
				className={cn(
					getDesktopNativeSelectControlClassName(shellFrame),
					className
				)}
				{...props}
			>
				{children}
			</select>
			<ChevronDownIcon
				className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-(--desktop-text-muted)"
				aria-hidden
				strokeWidth={DESKTOP_LUCIDE.stroke}
			/>
		</div>
	);
});
DesktopNativeSelect.displayName = 'DesktopNativeSelect';

export { DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME } from '../utils/desktopVisualSystem';

interface DesktopAppListRowProps
	extends ButtonHTMLAttributes<HTMLButtonElement>,
		Pick<VariantProps<typeof buttonVariants>, 'active'> {
	tone?: 'default' | 'subtle';
}

export const DesktopAppListRow = forwardRef<
	HTMLButtonElement,
	DesktopAppListRowProps
>(function DesktopAppListRow(
	{ className, active, tone = 'default', ...props },
	ref
) {
	return (
		<button
			ref={ref}
			className={cn(
				DESKTOP_APP_STYLE_CONTRACT.listRow,
				tone === 'default'
					? active
						? 'bg-(--desktop-surface-soft-hover) border-(--desktop-border-subtle)'
						: 'hover:bg-(--desktop-surface-soft)'
					: active
						? 'bg-(--desktop-surface-accent)'
						: 'hover:bg-(--desktop-surface-soft)',
				className
			)}
			{...props}
		/>
	);
});
DesktopAppListRow.displayName = 'DesktopAppListRow';

interface DesktopAppEmptyStateProps
	extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
	icon?: ReactNode;
	title?: ReactNode;
	description?: ReactNode;
}

export const DesktopAppEmptyState: React.FC<DesktopAppEmptyStateProps> = ({
	className,
	icon,
	title,
	description,
	children,
	...props
}) => (
	<div
		className={cn(
			'flex flex-col items-center justify-center gap-4 p-8 text-center',
			className
		)}
		{...props}
	>
		{icon ? (
			<div className={DESKTOP_APP_STYLE_CONTRACT.emptyIcon}>{icon}</div>
		) : null}
		{title ? (
			<div className="text-sm font-medium text-(--desktop-text-secondary)">
				{title}
			</div>
		) : null}
		{description ? (
			<div className="max-w-xs text-sm leading-relaxed text-(--desktop-text-muted)">
				{description}
			</div>
		) : null}
		{children}
	</div>
);

interface DesktopAppErrorStateProps {
	message: ReactNode;
	actionLabel?: string;
	onAction?: () => void;
}

export const DesktopAppErrorState: React.FC<DesktopAppErrorStateProps> = ({
	message,
	actionLabel,
	onAction,
}) => {
	const { t } = useTranslation(COMMON_UI_NS);
	return (
		<div className="flex items-start gap-3 border-b border-[color-mix(in_srgb,rgb(239_68_68)_40%,var(--desktop-border-subtle))] bg-[color-mix(in_srgb,rgb(239_68_68)_12%,var(--desktop-surface-panel-strong))] px-4 py-4 text-sm text-(--desktop-text-primary)">
			<div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[rgb(239_68_68)] shadow-[0_0_10px_color-mix(in_srgb,rgb(239_68_68)_75%,transparent)]" />
			<div className="flex-1">
				<p>{message}</p>
				{onAction ? (
					<DesktopAppButton
						type="button"
						variant="ghost"
						size="sm"
						onClick={onAction}
						className="mt-2 border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-primary) hover:bg-(--desktop-surface-soft-hover)"
					>
						{actionLabel ?? t('actions.retry')}
					</DesktopAppButton>
				) : null}
			</div>
		</div>
	);
};

interface DesktopAppModalFrameProps
	extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
	title?: ReactNode;
	onClose?: () => void;
	closeLabel?: string;
}

export const DesktopAppModalFrame: React.FC<DesktopAppModalFrameProps> = ({
	className,
	title,
	onClose,
	closeLabel,
	children,
	...props
}) => {
	const { t } = useTranslation('desktopUi');
	const resolvedCloseLabel = closeLabel ?? t('modal.close');
	const shellFrame = useDesktopShellFrame();
	const preset =
		DESKTOP_WINDOW_FRAME_STYLES[shellFrame] ??
		DESKTOP_WINDOW_FRAME_STYLES.glass;

	return (
		<div
			className={cn(
				getDesktopShellPanelClassName(shellFrame, 'strong'),
				'flex w-full max-w-md max-h-[80vh] flex-col text-(--desktop-text-primary)',
				className
			)}
			{...props}
		>
			{title || onClose ? (
				<div
					className={cn(
						'flex min-h-[52px] shrink-0 items-center justify-between gap-3 px-4 py-3',
						getDesktopShellHeaderStripClassName(shellFrame)
					)}
				>
					{/* Compact embedded modal title — smaller than centered ModalAdvanced desktop (DESKTOP_TYPOGRAPHY.subtitle). */}
					{title ? (
						<DesktopChromeTooltip
							content={title}
							placement="top"
							offsetExtra={4}
						>
							<div className="min-w-0 flex-1 truncate text-sm font-semibold text-(--desktop-text-primary) tracking-tight antialiased">
								{title}
							</div>
						</DesktopChromeTooltip>
					) : (
						<div className="min-w-0 flex-1" aria-hidden />
					)}
					{onClose ? (
						<DesktopChromeTooltip
							content={resolvedCloseLabel}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="icon"
								onClick={onClose}
								aria-label={resolvedCloseLabel}
							>
								<XMarkIcon
									className={DESKTOP_LUCIDE.lg}
									strokeWidth={DESKTOP_LUCIDE.stroke}
									aria-hidden
								/>
							</DesktopAppButton>
						</DesktopChromeTooltip>
					) : null}
				</div>
			) : null}
			<div className={cn('min-h-0 flex-1 overflow-y-auto', preset.content)}>
				{children}
			</div>
		</div>
	);
};

/**
 * Portal confirm from embedded apps: fixed shell, clickable scrim
 * ({@link DESKTOP_OVERLAY.backdrop}), stacked z-index.
 * Always mounts through {@link DesktopShellFloatingPortal} so `#desktop-main`
 * theme / chrome CSS variables apply on `document.body` (no unstyled chameleon).
 */
export interface DesktopPortaledConfirmShellProps {
	onDismiss: () => void;
	/** Layer pair, or a single base z-index (content = base + 10). */
	zIndex: number | { backdrop: number; content: number };
	dismissAriaLabel: string;
	children: React.ReactNode;
	className?: string;
	contentClassName?: string;
}

function resolvePortaledConfirmZIndex(
	zIndex: DesktopPortaledConfirmShellProps['zIndex']
): { backdrop: number; content: number } {
	if (typeof zIndex === 'number') {
		return { backdrop: zIndex, content: zIndex + 10 };
	}
	return zIndex;
}

export const DesktopPortaledConfirmShell: React.FC<
	DesktopPortaledConfirmShellProps
> = ({
	onDismiss,
	zIndex,
	dismissAriaLabel,
	children,
	className,
	contentClassName,
}) => {
	const zIndexLayers = resolvePortaledConfirmZIndex(zIndex);
	return (
		<DesktopShellFloatingPortal>
			<div
				className={cn(
					'fixed inset-0 flex items-center justify-center p-4',
					className
				)}
				style={{ zIndex: zIndexLayers.backdrop }}
			>
				<button
					type="button"
					className={cn('absolute inset-0', DESKTOP_OVERLAY.backdrop)}
					aria-label={dismissAriaLabel}
					onClick={onDismiss}
				/>
				<div
					className={cn('relative w-full max-w-md', contentClassName)}
					style={{ zIndex: zIndexLayers.content }}
				>
					{children}
				</div>
			</div>
		</DesktopShellFloatingPortal>
	);
};

export const DesktopAppSkeleton: React.FC<HTMLAttributes<HTMLDivElement>> = ({
	className,
	...props
}) => (
	<div
		className={cn(
			'motion-safe:animate-pulse motion-reduce:animate-none rounded-(--desktop-radius) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)',
			className
		)}
		{...props}
	/>
);

/** Экспорт для меню, где статический a11y-анализатор должен «видеть» `role="menuitem"` на нативном `button`. */
export const menuItemVariants = cva(
	cn(
		'mx-0.5 flex w-[calc(100%-0.25rem)] items-center gap-3 rounded-[calc(var(--desktop-radius)-2px)] px-2.5 py-2 text-left font-medium leading-tight transition-colors duration-200 motion-reduce:transition-none',
		DESKTOP_TYPOGRAPHY.shellCopy13,
		DESKTOP_CHROME_FOCUS_VISIBLE,
		'disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-[0.7] disabled:grayscale-[0.15]'
	),
	{
		variants: {
			tone: {
				default:
					'text-(--desktop-text-secondary) hover:bg-(--desktop-surface-soft) hover:text-(--desktop-text-primary) active:bg-(--desktop-surface-soft-active)',
				danger:
					'text-[color-mix(in_srgb,rgb(220_38_38)_78%,var(--desktop-text-primary))] hover:bg-[color-mix(in_srgb,rgb(239_68_68)_12%,var(--desktop-surface-soft))] hover:text-(--desktop-text-primary) focus-visible:ring-[color-mix(in_srgb,rgb(239_68_68)_45%,transparent)]',
				active: 'bg-(--desktop-surface-accent) text-(--desktop-text-primary)',
			},
		},
		defaultVariants: {
			tone: 'default',
		},
	}
);

interface DesktopAppMenuSurfaceProps extends HTMLAttributes<HTMLDivElement> {
	/** Явный пресет (например из родителя); иначе — {@link useDesktopShellFrame}. */
	windowStyle?: DesktopWindowStyle;
	/**
	 * `false` — не обрезать содержимое по округлению контейнера (выпады рядом с меню).
	 * Нужно для контекстного меню со вложенными flyout-слоями; по умолчанию `true`.
	 */
	clipOverflow?: boolean;
}

/** ПКМ и выпадающие меню — фон/рамка по пресету «Стиль окон» (glass / framed / minimal). */
export const DesktopAppMenuSurface: React.FC<DesktopAppMenuSurfaceProps> = ({
	className,
	windowStyle: windowStyleProp,
	clipOverflow = true,
	...props
}) => {
	const shellFrameFromContext = useDesktopShellFrame();
	const shellFrame = windowStyleProp ?? shellFrameFromContext;
	return (
		<div
			className={cn(
				getDesktopShellContextMenuClassName(shellFrame, { clipOverflow }),
				'min-w-[220px]',
				className
			)}
			{...props}
		/>
	);
};

export interface DesktopAppMenuHeaderProps
	extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
	/** Верхняя строка мелким капсом (часто `DesktopAppSectionLabel`) */
	eyebrow?: ReactNode;
	/** Основной заголовок (строка или произвольный узел) */
	title?: ReactNode;
	/** Подзаголовок */
	subtitle?: ReactNode;
	/** Слева: иконка приложения и т.п. */
	leading?: ReactNode;
	/** Справа: бейдж, мета */
	trailing?: ReactNode;
}

/** Единая шапка для контекстных меню (Пуск, редактор, …) */
export const DesktopAppMenuHeader: React.FC<DesktopAppMenuHeaderProps> = ({
	className,
	eyebrow,
	title,
	subtitle,
	leading,
	trailing,
	...props
}) => (
	<div
		role="presentation"
		className={cn(
			'relative overflow-hidden border-b border-[color-mix(in_srgb,var(--desktop-border-menu)_30%,transparent)] bg-(--desktop-surface-soft)/40 px-3 py-2.5',
			className
		)}
		{...props}
	>
		<div
			className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgb(var(--desktop-accent-rgb)/0.08),transparent_55%)]"
			aria-hidden
		/>
		<div
			className={cn(
				'relative flex gap-3',
				leading ? 'items-center' : 'items-start',
				trailing ? 'justify-between' : ''
			)}
		>
			{leading ? <div className="shrink-0">{leading}</div> : null}
			<div className="min-w-0 flex-1">
				{eyebrow ? <div className="mb-0.5">{eyebrow}</div> : null}
				{title != null ? (
					typeof title === 'string' ? (
						<DesktopChromeTooltip
							content={title}
							placement="top"
							offsetExtra={4}
						>
							<p className="desktop-shell-display-text truncate text-sm font-semibold tracking-tight text-(--desktop-text-primary)">
								{title}
							</p>
						</DesktopChromeTooltip>
					) : (
						title
					)
				) : null}
				{subtitle != null ? (
					typeof subtitle === 'string' ? (
						<DesktopChromeTooltip
							content={subtitle}
							placement="top"
							offsetExtra={4}
						>
							<p
								className={cn(
									DESKTOP_TYPOGRAPHY.small,
									'mt-0.5 truncate text-(--desktop-text-muted)',
									!title && !eyebrow ? 'mt-0' : ''
								)}
							>
								{subtitle}
							</p>
						</DesktopChromeTooltip>
					) : (
						subtitle
					)
				) : null}
			</div>
			{trailing ? <div className="relative shrink-0">{trailing}</div> : null}
		</div>
	</div>
);

/** Uppercase section stripe at top of a context menu (e.g. «Переместить…») */
export const DesktopAppMenuSectionLabel: React.FC<
	HTMLAttributes<HTMLDivElement>
> = ({ className, children, ...props }) => (
	<div
		role="presentation"
		className={cn(
			'border-b border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/40 px-3 py-2',
			className
		)}
		{...props}
	>
		<span className={DESKTOP_APP_STYLE_CONTRACT.sectionLabel}>{children}</span>
	</div>
);

/** Single-line title for ПКМ over a named item (file, row, …) */
export const DesktopAppContextMenuTitle: React.FC<
	HTMLAttributes<HTMLDivElement>
> = ({ className, children, ...props }) => (
	<div
		role="presentation"
		className={cn(
			'border-b border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/30 px-3 py-2.5 text-sm font-medium text-(--desktop-text-primary)',
			className
		)}
		{...props}
	>
		{typeof children === 'string' ? (
			<DesktopChromeTooltip content={children} placement="top" offsetExtra={4}>
				<span className="block truncate">{children}</span>
			</DesktopChromeTooltip>
		) : (
			children
		)}
	</div>
);

interface DesktopAppMenuItemProps
	extends ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof menuItemVariants> {
	icon?: ReactNode;
	shortcut?: ReactNode;
	badge?: ReactNode;
	hasSubmenu?: boolean;
}

export const DesktopAppMenuItem: React.FC<DesktopAppMenuItemProps> = ({
	className,
	tone,
	icon,
	shortcut,
	badge,
	hasSubmenu,
	children,
	...props
}) => {
	const labelNode =
		typeof children === 'string' ? (
			<DesktopChromeTooltip
				content={children}
				placement="right"
				offsetExtra={4}
			>
				<span className="truncate">{children}</span>
			</DesktopChromeTooltip>
		) : (
			<span className="truncate">{children}</span>
		);

	return (
		<button className={cn(menuItemVariants({ tone }), className)} {...props}>
			<span className="flex min-w-0 flex-1 items-center gap-3">
				{icon ? (
					<span
						className={cn(
							'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-(--desktop-surface-soft) text-(--desktop-text-muted) [&_svg]:stroke-[1.35]',
							tone === 'danger'
								? 'bg-[color-mix(in_srgb,rgb(239_68_68)_10%,var(--desktop-surface-soft))] text-[color-mix(in_srgb,rgb(248_113_113)_65%,var(--desktop-text-muted))]'
								: ''
						)}
						aria-hidden="true"
					>
						{icon}
					</span>
				) : null}
				{labelNode}
				{badge ? (
					<span className={cn(DESKTOP_TYPOGRAPHY.meta, 'ml-2')}>{badge}</span>
				) : null}
			</span>
			<span className="flex shrink-0 items-center gap-2 text-xs text-(--desktop-text-dim)">
				{shortcut}
				{hasSubmenu ? <span aria-hidden>›</span> : null}
			</span>
		</button>
	);
};

export const DesktopAppMenuDivider: React.FC<HTMLAttributes<HTMLHRElement>> = ({
	className,
	...props
}) => (
	<hr
		className={cn(
			'mx-2 my-1.5 border-0 border-t border-[color-mix(in_srgb,var(--desktop-border-menu)_35%,transparent)]',
			className
		)}
		{...props}
	/>
);

export const DesktopAppStatusBadge: React.FC<
	HTMLAttributes<HTMLSpanElement>
> = ({ className, ...props }) => (
	<span
		className={cn(
			'inline-flex items-center rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-0.5 font-medium',
			DESKTOP_TYPOGRAPHY.small,
			'text-(--desktop-text-secondary)',
			className
		)}
		{...props}
	/>
);

interface DesktopAppContentWrapperProps extends HTMLAttributes<HTMLDivElement> {
	appComponent?: string | null;
	mode?: DesktopAppSurfaceMode;
	/** Согласован с ПКМ → стиль окон (рамка оболочки — см. {@link getDesktopShellPanelClassName}) */
	windowStyle?: DesktopWindowStyle;
}

export const DesktopAppContentWrapper: React.FC<
	DesktopAppContentWrapperProps
> = ({
	appComponent,
	mode,
	windowStyle = 'glass',
	className,
	children,
	...props
}) => {
	const resolvedMode = mode ?? getDesktopAppSurfaceMode(appComponent);

	if (resolvedMode === 'passthrough') {
		return (
			<div
				className={cn('h-full min-h-0', className)}
				data-desktop-app-surface="passthrough"
				{...props}
			>
				{children}
			</div>
		);
	}

	if (resolvedMode === 'framed') {
		return (
			<div
				className={cn(
					'flex h-full min-h-0 flex-col text-(--desktop-text-primary)',
					className
				)}
				data-desktop-app-surface="framed"
				data-desktop-app-family={getDesktopAppFamily(appComponent)}
				{...props}
			>
				<div
					className={cn(
						'h-full min-h-0 min-w-0 flex-1 overflow-hidden flex flex-col',
						getDesktopShellContentPanelClassName(windowStyle)
					)}
				>
					{children}
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				'h-full min-h-0 px-3 py-3 text-(--desktop-text-primary) md:px-4 md:py-4',
				className
			)}
			data-desktop-app-surface="standard"
			data-desktop-app-family={getDesktopAppFamily(appComponent)}
			{...props}
		>
			<div
				className={cn(
					'h-full min-h-0 overflow-hidden',
					getDesktopShellPanelClassName(windowStyle, 'strong')
				)}
			>
				{children}
			</div>
		</div>
	);
};
