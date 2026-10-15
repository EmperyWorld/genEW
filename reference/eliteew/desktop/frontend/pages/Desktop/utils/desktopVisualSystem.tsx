/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Central visual system for Desktop icons, shell presets and shared chrome tokens.
 * Distinct opaque static presets per DesktopWindowStyle key (no blur, no sheen).
 * Nested content panels share Settings-style surfaces for strong window presets.
 *
 * Invariants:
 * - App component visual identities remain stable for persisted desktop items.
 * - Every DesktopWindowStyle key keeps a distinct premium look; no backdrop-filter / chameleon motion.
 * - No infinite CSS animation on window, taskbar, or widget chrome.
 * - Framed apps must not paint opaque surface-app over content-panel / window content.
 * - Chrome gradient tokens (`--desktop-chrome-*-bg`) use `[background-image:var(--…)]`,
 *   never Tailwind `bg-(--…)` (that emits `background-color`, which drops gradients).
 *
 * Related:
 * - `pages/Desktop/constants/index.ts`
 * - `documentation/product/DESKTOP-WINDOW-SHELL-STYLE.md`
 */
import { cn } from '@/utils/cn';
import {
	BellIcon,
	BriefcaseIcon,
	BuildingStorefrontIcon,
	ChatBubbleLeftRightIcon,
	CircleStackIcon,
	ClipboardDocumentListIcon,
	ClipboardIcon,
	Cog6ToothIcon,
	CpuChipIcon,
	DocumentTextIcon,
	FolderIcon,
	GlobeAltIcon,
	MegaphoneIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	NewspaperIcon,
	PhotoIcon,
	PresentationChartBarIcon,
	RectangleStackIcon,
	ShieldCheckIcon,
	SparklesIcon,
	Squares2X2Icon,
	StarIcon,
	UserGroupIcon,
	UserIcon,
	VideoCameraIcon,
} from '@heroicons/react/24/outline';
import {
	type ComponentType,
	type CSSProperties,
	type ReactNode,
	type SVGProps,
	useLayoutEffect,
	useRef,
} from 'react';
import type {
	DesktopIconStyle,
	DesktopTaskbarStyle,
	DesktopWidgetsStyle,
	DesktopWindowStyle,
} from '../../../types/profile';
import {
	DESKTOP_ICON_SVG_QUALITY,
	DESKTOP_LUCIDE,
} from '../constants/lucideDesktop';

interface DesktopTaskbarStylePreset {
	dividerClass: string;
	buttonSurface: string;
	buttonActiveSurface: string;
	surfaceClassName: string;
	surfaceStyle: CSSProperties;
}

/** Backgrounds that depend on dynamic colors — paint on the DOM to avoid JSX `style` (webhint no-inline-styles). */
function DesktopPaintedSpan({
	className,
	paint,
	depsKey,
}: {
	className: string;
	paint: (el: HTMLSpanElement) => void;
	/** Changes when visual inputs change; avoids unstable `deps` array identity. */
	depsKey: string;
}) {
	const ref = useRef<HTMLSpanElement>(null);
	const paintRef = useRef(paint);
	paintRef.current = paint;
	// biome-ignore lint/correctness/useExhaustiveDependencies: depsKey reruns paint when serialized visual deps change; paint is held in ref
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		paintRef.current(el);
	}, [depsKey]);
	return <span ref={ref} aria-hidden className={className} />;
}

/**
 * Shared desktop chrome inventory.
 * Use this as a reminder that new desktop UI should reuse system primitives
 * instead of composing fresh slate/white glass bundles in leaf components.
 */
export const DESKTOP_SHARED_CHROME_PRIMITIVES = [
	'DesktopAppSurface',
	'DesktopAppToolbar',
	'DesktopAppPanel',
	'DesktopAppSectionLabel',
	'DesktopAppButton',
	'DesktopAppInput',
	'DesktopAppListRow',
	'DesktopAppEmptyState',
	'DesktopAppErrorState',
	'DesktopAppModalFrame',
	'DesktopAppSkeleton',
] as const;

/** Taskbar chrome buttons: higher contrast than generic `--desktop-surface-soft` (too washed out). */
const TB_TASKBAR_BUTTONS = {
	buttonSurface:
		'bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb))_10%,transparent)] fine-hover:bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb))_16%,transparent)] border border-[rgb(var(--desktop-fg-primary-rgb)/0.14)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]',
	buttonActiveSurface:
		'bg-[rgb(var(--desktop-accent-rgb)/0.24)] fine-hover:bg-[rgb(var(--desktop-accent-rgb)/0.32)] border border-[rgb(var(--desktop-accent-rgb)/0.45)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]',
} as const;

/** Кнопки таскбара в духе premium titlebar / controlGroup (золото; light/dark via chrome vars). */
const TB_TASKBAR_PREMIUM_BUTTONS = {
	buttonSurface:
		'bg-(--desktop-chrome-premium-button-bg) fine-hover:bg-(--desktop-chrome-premium-button-hover-bg) border border-[rgba(212,175,106,0.28)] shadow-[inset_0_1px_0_rgba(255,250,240,0.35)]',
	buttonActiveSurface:
		'bg-[rgba(212,175,106,0.26)] fine-hover:bg-[rgba(212,175,106,0.34)] border border-[rgba(212,175,106,0.48)] shadow-[inset_0_1px_0_rgba(255,250,240,0.25)]',
} as const;

/** Opaque framed taskbar helper — same surface as {@link DESKTOP_TASKBAR_STYLE_PRESETS}.framed. */
export const DESKTOP_FLAT_TASKBAR: DesktopTaskbarStylePreset = {
	dividerClass: 'bg-(--desktop-border-strong)',
	...TB_TASKBAR_BUTTONS,
	surfaceClassName:
		'rounded-t-(--desktop-radius-shell) border-t border-(--desktop-border-strong)',
	surfaceStyle: {
		backgroundColor: 'var(--desktop-taskbar-bg-solid-color)',
		background: 'var(--desktop-taskbar-bg-solid)',
		borderTopColor: 'var(--desktop-taskbar-border-top)',
		boxShadow:
			'var(--desktop-taskbar-shadow-solid), inset 0 1px 0 rgba(255,255,255,0.06)',
		backgroundImage: 'none',
	},
};

/** Нижняя панель: те же ключи, что и `DesktopWindowStyle`, визуально согласованы с `shellFooterStrip` окон. */
export const DESKTOP_TASKBAR_STYLE_PRESETS: Record<
	DesktopTaskbarStyle,
	DesktopTaskbarStylePreset
> = {
	glass: {
		dividerClass: 'bg-(--desktop-border-subtle)',
		...TB_TASKBAR_BUTTONS,
		surfaceClassName:
			'rounded-t-(--desktop-radius-shell) border-t border-(--desktop-border-subtle)',
		surfaceStyle: {
			backgroundColor: 'var(--desktop-taskbar-bg-solid-color)',
			background: 'var(--desktop-taskbar-bg-glass)',
			borderTopColor: 'var(--desktop-taskbar-border-top)',
			boxShadow: 'var(--desktop-taskbar-shadow-glass)',
			backgroundImage: 'none',
		},
	},
	framed: DESKTOP_FLAT_TASKBAR,
	minimal: {
		dividerClass: 'bg-(--desktop-border-subtle)',
		...TB_TASKBAR_BUTTONS,
		surfaceClassName:
			'rounded-t-(--desktop-radius-shell) border-t border-(--desktop-border-subtle)',
		surfaceStyle: {
			backgroundColor: 'rgb(var(--desktop-bg-secondary-rgb))',
			background:
				'linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.97)_0%,rgb(var(--desktop-bg-primary-rgb)/0.97)_100%)',
			borderTopColor: 'var(--desktop-taskbar-border-top)',
			boxShadow:
				'0 -6px 24px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.04)',
			backgroundImage: 'none',
		},
	},
	noir: {
		dividerClass: 'bg-(--desktop-border-strong)',
		...TB_TASKBAR_BUTTONS,
		surfaceClassName:
			'rounded-t-(--desktop-radius-shell) border-t border-(--desktop-border-strong)',
		surfaceStyle: {
			background: 'var(--desktop-chrome-noir-taskbar-bg)',
			borderTopColor: 'var(--desktop-border-strong)',
			boxShadow: 'var(--desktop-chrome-noir-taskbar-shadow)',
			backgroundImage: 'none',
		},
	},
	neon: {
		dividerClass: 'bg-[rgb(var(--desktop-accent-rgb)/0.4)]',
		buttonSurface:
			'bg-[rgb(var(--desktop-accent-rgb)/0.16)] hover:bg-[rgb(var(--desktop-accent-rgb)/0.24)] border border-[rgb(var(--desktop-accent-rgb)/0.32)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
		buttonActiveSurface:
			'bg-[rgb(var(--desktop-accent-rgb)/0.3)] hover:bg-[rgb(var(--desktop-accent-rgb)/0.38)] border border-[rgb(var(--desktop-accent-rgb)/0.5)]',
		surfaceClassName:
			'rounded-t-(--desktop-radius-shell) border-t-2 border-[rgb(var(--desktop-accent-rgb)/0.38)]',
		surfaceStyle: {
			background: 'var(--desktop-chrome-neon-taskbar-bg)',
			borderTopColor: 'rgb(var(--desktop-accent-rgb)/0.35)',
			boxShadow: 'var(--desktop-chrome-neon-taskbar-shadow)',
			backgroundImage: 'none',
		},
	},
	paper: {
		dividerClass:
			'bg-[color-mix(in_srgb,var(--desktop-paper-edge)_35%,transparent)]',
		buttonSurface:
			'bg-[color-mix(in_srgb,var(--desktop-paper-edge)_14%,transparent)] hover:bg-[color-mix(in_srgb,var(--desktop-paper-edge)_22%,transparent)]',
		buttonActiveSurface:
			'bg-[color-mix(in_srgb,var(--desktop-paper-edge)_30%,transparent)]',
		surfaceClassName:
			'rounded-t-(--desktop-radius-shell) border-t-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_40%,transparent)]',
		surfaceStyle: {
			background:
				'linear-gradient(180deg,color-mix(in srgb,var(--desktop-paper-highlight) 22%,var(--desktop-surface-soft) 78%) 0%,color-mix(in srgb,var(--desktop-paper-warm) 18%,var(--desktop-surface-soft) 82%) 100%)',
			borderTopColor:
				'color-mix(in srgb, var(--desktop-paper-edge) 45%, transparent)',
			boxShadow:
				'4px -4px 0 0 rgba(80,48,20,0.1), 0 -6px 24px rgba(60,40,20,0.18)',
			backgroundImage: 'none',
		},
	},
	aurora: {
		dividerClass: 'bg-[rgba(168,85,247,0.4)]',
		...TB_TASKBAR_BUTTONS,
		surfaceClassName:
			'rounded-t-(--desktop-radius-shell) border-t-2 border-[rgba(34,211,238,0.35)]',
		surfaceStyle: {
			background: 'var(--desktop-chrome-aurora-taskbar-bg)',
			borderTopColor: 'rgba(34,211,238,0.28)',
			boxShadow:
				'0 -4px 28px rgba(168,85,247,0.16), 0 -1px 0 rgba(34,211,238,0.12)',
			backgroundImage: 'none',
		},
	},
	chameleon: {
		dividerClass: 'bg-(--desktop-border-subtle)',
		...TB_TASKBAR_BUTTONS,
		surfaceClassName:
			'rounded-t-(--desktop-radius-shell) border-t border-(--glass-border)/70',
		surfaceStyle: {
			background: 'var(--desktop-chrome-chameleon-taskbar-bg)',
			borderTopColor: 'var(--desktop-taskbar-border-top)',
			boxShadow: '0 -10px 36px rgba(0,0,0,0.42)',
			backgroundImage: 'none',
		},
	},
	premium: {
		dividerClass:
			'bg-[linear-gradient(180deg,rgba(212,175,106,0.5)_0%,rgba(212,175,106,0.14)_100%)]',
		...TB_TASKBAR_PREMIUM_BUTTONS,
		surfaceClassName:
			'rounded-t-(--desktop-radius-shell) border-t-2 border-[rgba(212,175,106,0.28)]',
		surfaceStyle: {
			background: 'var(--desktop-chrome-premium-taskbar-bg)',
			borderTopColor: 'rgba(212,175,106,0.32)',
			boxShadow: 'var(--desktop-chrome-premium-taskbar-shadow)',
			backgroundImage: 'none',
		},
	},
};

/**
 * Насколько ползунок «Непрозрачность панелей» (`desktop_panel_opacity`) добавляет
 * слой `var(--desktop-taskbar-bg-opaque)` поверх фона таскбара.
 * — **glass**: 0 — ползунок на плотность не влияет (opaque glass preset).
 * — **framed**: рамка уже плотная — 0.
 * — остальное: 1 — на максимуме ползунка панель непрозрачная.
 */
export const TASKBAR_PANEL_OPACITY_OVERLAY_WEIGHT: Record<
	DesktopTaskbarStyle,
	number
> = {
	glass: 0,
	framed: 0,
	minimal: 1,
	noir: 1,
	neon: 1,
	paper: 1,
	aurora: 1,
	chameleon: 1,
	premium: 1,
};

interface DesktopWindowFramePreset {
	frame: string;
	active: string;
	inactive: string;
	shell: string;
	content: string;
	accentLine: string;
	/** Левая колонка навигации (центр управления рабочим столом и т.п.) */
	shellNavRail: string;
	/** Нижняя полоса Пуска, «горячие клавиши» и т.п. */
	shellFooterStrip: string;
}

/**
 * Семейство пресета для вложенных карточек/форм (не путать с уникальной рамкой окна).
 * `neon` / `aurora` / `chameleon` → glass; `noir` → framed; `paper` → minimal.
 */
export type DesktopWindowShellTier = 'glass' | 'framed' | 'minimal';

export function getDesktopWindowShellTier(
	windowStyle: DesktopWindowStyle
): DesktopWindowShellTier {
	switch (windowStyle) {
		case 'glass':
		case 'neon':
		case 'aurora':
		case 'chameleon':
		case 'premium':
			return 'glass';
		case 'framed':
		case 'noir':
			return 'framed';
		default:
			return 'minimal';
	}
}

/**
 * Opaque framed shell helper — matches {@link DESKTOP_WINDOW_FRAME_STYLES}.framed.
 * No backdrop-filter, no alpha glass, no infinite motion classes.
 */
export const DESKTOP_FLAT_SHELL: DesktopWindowFramePreset = {
	frame:
		'border border-(--desktop-border-strong) bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb))_0%,rgb(var(--desktop-bg-primary-rgb))_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_72px_rgba(0,0,0,0.55)]',
	active:
		'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.35)] shadow-[0_36px_88px_rgba(0,0,0,0.58)]',
	inactive: 'saturate-[0.96]',
	shell: '',
	content:
		'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb))_0%,rgb(var(--desktop-bg-primary-rgb))_100%)]',
	accentLine:
		'bg-[linear-gradient(90deg,transparent_0%,rgb(var(--desktop-accent-rgb)/0.55)_22%,rgba(255,255,255,0.16)_50%,rgb(var(--desktop-accent-rgb)/0.45)_78%,transparent_100%)]',
	shellNavRail:
		'border-r border-(--desktop-border-strong) bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb))_0%,rgb(var(--desktop-bg-primary-rgb))_100%)] shadow-[inset_-1px_0_0_rgb(var(--desktop-fg-primary-rgb)/0.1)]',
	shellFooterStrip:
		'border-t border-(--desktop-border-strong) bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb))_0%,rgb(var(--desktop-bg-primary-rgb))_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
};

export const DESKTOP_WINDOW_FRAME_STYLES: Record<
	DesktopWindowStyle,
	DesktopWindowFramePreset
> = {
	glass: {
		frame:
			'border border-(--glass-border) bg-[radial-gradient(circle_at_12%_0%,rgb(var(--desktop-accent-rgb)/0.11),transparent_38%),radial-gradient(circle_at_88%_0%,rgba(255,255,255,0.09),transparent_28%),color-mix(in_srgb,var(--glass-bg-strong)_88%,rgb(var(--desktop-bg-primary-rgb))_12%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.11),0_26px_68px_rgba(0,0,0,0.5)]',
		active:
			'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.38)] shadow-[0_36px_88px_rgba(0,0,0,0.55)]',
		inactive: 'saturate-[0.96]',
		shell: '',
		content:
			'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.97)_0%,rgb(var(--desktop-bg-primary-rgb)/0.97)_100%)]',
		accentLine:
			'bg-[linear-gradient(90deg,transparent_0%,rgb(var(--desktop-accent-rgb)/0.42)_22%,rgba(255,255,255,0.12)_50%,rgb(var(--desktop-accent-rgb)/0.36)_78%,transparent_100%)] opacity-[0.78]',
		shellNavRail:
			'border-r border-(--glass-border) bg-[radial-gradient(circle_at_12%_0%,rgb(var(--desktop-accent-rgb)/0.1),transparent_38%),radial-gradient(circle_at_88%_0%,rgba(255,255,255,0.08),transparent_28%),color-mix(in_srgb,var(--glass-bg-strong)_88%,rgb(var(--desktop-bg-primary-rgb))_12%)] shadow-[inset_-1px_0_0_rgb(var(--desktop-fg-primary-rgb)/0.09)]',
		shellFooterStrip:
			'border-t border-(--glass-border)/70 bg-[radial-gradient(circle_at_50%_0%,rgb(var(--desktop-accent-rgb)/0.08),transparent_42%),color-mix(in_srgb,var(--glass-bg-strong)_36%,var(--desktop-surface-panel)_64%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
	},
	framed: DESKTOP_FLAT_SHELL,
	minimal: {
		frame:
			'border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--glass-bg-strong)_82%,rgb(var(--desktop-bg-primary-rgb))_18%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_28px_66px_rgba(0,0,0,0.5)]',
		active:
			'ring-1 ring-[var(--desktop-border-strong)] shadow-[0_30px_76px_rgba(0,0,0,0.54)]',
		inactive: 'saturate-[0.9]',
		shell: '',
		content:
			'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-primary-rgb)/0.97)_0%,rgb(var(--desktop-bg-primary-rgb)/0.97)_100%)]',
		accentLine:
			'bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.14)_50%,transparent_100%)] opacity-[0.65]',
		shellNavRail:
			'border-r border-(--desktop-border-subtle) bg-[color-mix(in_srgb,rgb(var(--desktop-bg-primary-rgb))_0.97,transparent)] shadow-[inset_-1px_0_0_rgb(var(--desktop-fg-primary-rgb)/0.06)]',
		shellFooterStrip:
			'border-t border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_97%,transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
	},
	noir: {
		frame:
			'border border-(--desktop-border-strong) [background-image:var(--desktop-chrome-noir-frame-bg)] shadow-[0_28px_64px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.35)]',
		active:
			'ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.22)] shadow-[0_32px_72px_rgba(15,23,42,0.22)]',
		inactive: 'saturate-[0.92] contrast-[1.02]',
		shell: '',
		content: '[background-image:var(--desktop-chrome-noir-content-bg)]',
		accentLine:
			'bg-[linear-gradient(90deg,transparent_0%,rgb(var(--desktop-fg-primary-rgb)/0.18)_50%,transparent_100%)] opacity-[0.55]',
		shellNavRail:
			'border-r border-(--desktop-border-subtle) [background-image:var(--desktop-chrome-noir-frame-bg)] shadow-[inset_-1px_0_0_rgb(var(--desktop-fg-primary-rgb)/0.06)]',
		shellFooterStrip:
			'border-t border-(--desktop-border-subtle) [background-image:var(--desktop-chrome-noir-content-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]',
	},
	neon: {
		frame:
			'border-2 border-[rgb(var(--desktop-accent-rgb)/0.72)] [background-image:var(--desktop-chrome-neon-frame-bg)] shadow-[0_0_0_1px_rgb(var(--desktop-fg-primary-rgb)/0.06),0_0_40px_-10px_rgb(var(--desktop-accent-rgb)/0.45),inset_0_1px_0_rgb(var(--desktop-accent-rgb)/0.12)]',
		active:
			'ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.5)] shadow-[0_0_0_1px_rgb(var(--desktop-accent-rgb)/0.35),0_0_48px_-4px_rgb(var(--desktop-accent-rgb)/0.55)]',
		inactive: 'saturate-[1.05]',
		shell: '',
		content:
			'[background-image:var(--desktop-chrome-neon-content-bg)] shadow-[inset_0_0_0_1px_rgb(var(--desktop-accent-rgb)/0.16)]',
		accentLine:
			'bg-[linear-gradient(90deg,transparent_0%,rgb(var(--desktop-accent-rgb)/0.9)_15%,rgb(var(--desktop-accent-rgb)/0.35)_50%,rgb(var(--desktop-accent-rgb)/0.9)_85%,transparent_100%)] opacity-[0.98]',
		shellNavRail:
			'border-r-2 border-[rgb(var(--desktop-accent-rgb)/0.4)] [background-image:var(--desktop-chrome-neon-frame-bg)] shadow-[inset_-1px_0_12px_rgb(var(--desktop-accent-rgb)/0.12)]',
		shellFooterStrip:
			'border-t-2 border-[rgb(var(--desktop-accent-rgb)/0.32)] [background-image:var(--desktop-chrome-neon-content-bg)] shadow-[0_-8px_22px_-4px_rgb(var(--desktop-accent-rgb)/0.18)]',
	},
	paper: {
		frame:
			'border-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_52%,transparent)] bg-[linear-gradient(178deg,color-mix(in_srgb,var(--desktop-paper-cream-soft)_30%,rgb(var(--desktop-bg-primary-rgb))_70%)_0%,color-mix(in_srgb,var(--desktop-paper-warm)_20%,rgb(var(--desktop-bg-primary-rgb))_80%)_100%)] shadow-[7px_7px_0_0_color-mix(in_srgb,var(--desktop-paper-ink)_16%,transparent),0_22px_52px_color-mix(in_srgb,var(--desktop-paper-ink)_24%,transparent)]',
		active:
			'ring-2 ring-[color-mix(in_srgb,var(--desktop-paper-ring)_58%,transparent)] shadow-[9px_9px_0_0_color-mix(in_srgb,var(--desktop-paper-ink)_20%,transparent)]',
		inactive: 'saturate-[0.85]',
		shell: '',
		content:
			'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--desktop-paper-highlight)_38%,rgb(var(--desktop-bg-primary-rgb))_62%)_0%,color-mix(in_srgb,var(--desktop-paper-cream)_24%,rgb(var(--desktop-bg-primary-rgb))_76%)_100%)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--desktop-paper-edge)_14%,transparent)]',
		accentLine:
			'bg-[linear-gradient(90deg,transparent_0%,color-mix(in_srgb,var(--desktop-paper-edge)_26%,transparent)_50%,transparent_100%)] opacity-[0.85]',
		shellNavRail:
			'border-r-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_42%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--desktop-paper-highlight)_22%,rgb(var(--desktop-bg-primary-rgb))_78%)_0%,color-mix(in_srgb,var(--desktop-paper-warm)_18%,rgb(var(--desktop-bg-primary-rgb))_82%)_100%)] shadow-[inset_-2px_0_0_color-mix(in_srgb,var(--desktop-paper-edge)_10%,transparent)]',
		shellFooterStrip:
			'border-t-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_38%,transparent)] bg-[color-mix(in_srgb,var(--desktop-paper-cream)_28%,var(--desktop-surface-soft)_72%)] shadow-[inset_0_2px_0_rgba(255,255,255,0.35)]',
	},
	aurora: {
		frame:
			'border-2 border-(--desktop-chrome-aurora-frame-border) [background-image:var(--desktop-chrome-aurora-frame-bg)] shadow-(--desktop-chrome-aurora-frame-shadow)',
		active:
			'ring-2 ring-[rgba(167,139,250,0.45)] shadow-[0_0_0_2px_rgba(34,211,238,0.22),0_0_40px_-8px_rgba(168,85,247,0.28)]',
		inactive: 'saturate-[1.06]',
		shell: '',
		content: '[background-image:var(--desktop-chrome-aurora-content-bg)]',
		accentLine:
			'bg-[linear-gradient(90deg,rgba(168,85,247,0.58)_0%,rgba(34,211,238,0.48)_35%,rgba(244,114,182,0.42)_70%,rgba(168,85,247,0.52)_100%)] opacity-[0.92]',
		shellNavRail:
			'border-r-2 border-(--desktop-chrome-aurora-frame-border) [background-image:var(--desktop-chrome-aurora-nav-bg)] shadow-[inset_-2px_0_12px_rgba(34,211,238,0.08)]',
		shellFooterStrip:
			'border-t-2 border-[rgba(34,211,238,0.28)] [background-image:var(--desktop-chrome-aurora-footer-bg)] shadow-[0_-4px_20px_rgba(168,85,247,0.1)]',
	},
	chameleon: {
		frame:
			'border border-(--glass-border) [background-image:var(--desktop-chrome-chameleon-frame-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_32px_84px_rgba(0,0,0,0.54)]',
		active:
			'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.34)] shadow-[0_38px_92px_rgba(0,0,0,0.58)]',
		inactive: 'saturate-[0.96]',
		shell: '',
		content:
			'[background-image:var(--desktop-chrome-chameleon-content-bg)] min-h-0',
		accentLine:
			'bg-[linear-gradient(90deg,rgb(255,200,220)_0%,rgb(180,220,255)_50%,rgb(200,255,210)_100%)] opacity-[0.85]',
		shellNavRail:
			'border-r border-(--glass-border) [background-image:var(--desktop-chrome-chameleon-nav-bg)] shadow-[inset_-1px_0_0_rgb(var(--desktop-fg-primary-rgb)/0.07)]',
		shellFooterStrip:
			'border-t border-(--glass-border)/70 [background-image:var(--desktop-chrome-chameleon-footer-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
	},
	premium: {
		frame:
			'border border-[rgba(212,175,106,0.32)] [background-image:var(--desktop-chrome-premium-frame-bg)] shadow-[0_0_0_1px_rgb(var(--desktop-fg-primary-rgb)/0.06),0_28px_64px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,250,240,0.45)]',
		active:
			'ring-1 ring-[rgba(212,175,106,0.45)] shadow-[0_0_0_1px_rgba(212,175,106,0.18),0_32px_72px_rgba(15,23,42,0.16)]',
		inactive: 'saturate-[0.96]',
		shell: '',
		content:
			'[background-image:var(--desktop-chrome-premium-content-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]',
		accentLine:
			'bg-[linear-gradient(90deg,transparent_0%,rgba(212,175,106,0.48)_18%,rgba(255,235,200,0.22)_50%,rgba(212,175,106,0.42)_82%,transparent_100%)] opacity-[0.7]',
		shellNavRail:
			'border-r border-[rgba(212,175,106,0.22)] [background-image:var(--desktop-chrome-premium-frame-bg)] shadow-[inset_-1px_0_0_rgba(212,175,106,0.12)]',
		shellFooterStrip:
			'border-t border-[rgba(212,175,106,0.2)] [background-image:var(--desktop-chrome-premium-content-bg)] shadow-[inset_0_1px_0_rgba(255,250,240,0.4)]',
	},
};

const DESKTOP_ICON_APP_TILE = 'rounded-[1.25rem] overflow-hidden shrink-0';
const DESKTOP_ICON_FILE_TILE = 'rounded-xl overflow-hidden shrink-0';

/** Opaque icon tile helper aligned with {@link DESKTOP_FLAT_SHELL}. */
const DESKTOP_FLAT_ICON_SURFACE: { appBox: string; fileBox: string } = {
	appBox: cn(
		DESKTOP_ICON_APP_TILE,
		'border border-(--desktop-border-strong)',
		'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb))_0%,rgb(var(--desktop-bg-primary-rgb))_100%)]',
		'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.4)] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.09)]'
	),
	fileBox: cn(
		DESKTOP_ICON_FILE_TILE,
		'border border-(--desktop-border-strong)',
		'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb))_0%,rgb(var(--desktop-bg-primary-rgb))_100%)] p-2',
		'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_22px_rgba(0,0,0,0.28)]'
	),
};

/**
 * Поверхности ярлыков (app / file / folder tile) — согласованы с {@link DESKTOP_WINDOW_FRAME_STYLES}.
 * `DesktopIcon` и превью в настройках импортируют отсюда, чтобы стиль иконок не расходился с окнами.
 */
export const DESKTOP_ICON_SURFACE_STYLES: Record<
	DesktopIconStyle,
	{ appBox: string; fileBox: string }
> = {
	glass: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border border-(--glass-border)',
			'bg-[radial-gradient(circle_at_12%_0%,rgb(var(--desktop-accent-rgb)/0.14),transparent_42%),radial-gradient(circle_at_88%_0%,rgba(255,255,255,0.1),transparent_30%),color-mix(in_srgb,var(--glass-bg-strong)_75%,rgb(var(--desktop-bg-primary-rgb))_25%)]',
			'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_30px_rgba(0,0,0,0.32)] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.07)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border border-(--glass-border)',
			'bg-[color-mix(in_srgb,var(--glass-bg-strong)_70%,rgb(var(--desktop-bg-primary-rgb))_30%)] p-2',
			'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_22px_rgba(0,0,0,0.24)] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.06)]'
		),
	},
	framed: DESKTOP_FLAT_ICON_SURFACE,
	minimal: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border border-(--desktop-border-subtle)',
			'bg-[color-mix(in_srgb,var(--glass-bg-strong)_78%,rgb(var(--desktop-bg-primary-rgb))_22%)]',
			'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_26px_rgba(0,0,0,0.28)] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border border-(--desktop-border-subtle)',
			'bg-[color-mix(in_srgb,rgb(var(--desktop-bg-primary-rgb))_0.97,transparent)] p-2',
			'shadow-[0_8px_20px_rgba(0,0,0,0.2)] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]'
		),
	},
	noir: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border border-(--desktop-chrome-noir-icon-border)',
			'[background-image:var(--desktop-chrome-noir-icon-app-bg)]',
			'shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_28px_rgba(15,23,42,0.14)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border border-(--desktop-chrome-noir-icon-border)',
			'[background-image:var(--desktop-chrome-noir-icon-file-bg)] p-2',
			'shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_22px_rgba(15,23,42,0.12)]'
		),
	},
	neon: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border-2 border-[rgb(var(--desktop-accent-rgb)/0.72)]',
			'[background-image:var(--desktop-chrome-neon-icon-app-bg)]',
			'shadow-[0_0_0_1px_rgb(var(--desktop-fg-primary-rgb)/0.06),0_0_28px_-6px_rgb(var(--desktop-accent-rgb)/0.45),inset_0_1px_0_rgb(var(--desktop-accent-rgb)/0.12)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border-2 border-[rgb(var(--desktop-accent-rgb)/0.42)]',
			'[background-image:var(--desktop-chrome-neon-icon-file-bg)] p-2',
			'shadow-[0_0_16px_rgb(var(--desktop-accent-rgb)/0.22)]'
		),
	},
	paper: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_50%,transparent)]',
			'bg-[linear-gradient(178deg,color-mix(in_srgb,var(--desktop-paper-cream-soft)_34%,rgb(var(--desktop-bg-primary-rgb))_66%)_0%,color-mix(in_srgb,var(--desktop-paper-warm)_22%,rgb(var(--desktop-bg-primary-rgb))_78%)_100%)]',
			'shadow-[5px_5px_0_0_color-mix(in_srgb,var(--desktop-paper-ink)_14%,transparent),0_16px_36px_color-mix(in_srgb,var(--desktop-paper-ink)_18%,transparent)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_44%,transparent)]',
			'bg-[color-mix(in_srgb,var(--desktop-paper-highlight)_48%,rgb(var(--desktop-bg-primary-rgb))_52%)] p-2',
			'shadow-[4px_4px_0_0_color-mix(in_srgb,var(--desktop-paper-ink)_10%,transparent)]'
		),
	},
	aurora: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border-2 border-[rgba(168,85,247,0.42)]',
			'[background-image:var(--desktop-chrome-aurora-icon-app-bg)]',
			'shadow-[0_0_0_1px_rgba(34,211,238,0.22),0_0_28px_-8px_rgba(168,85,247,0.32)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border-2 border-[rgba(168,85,247,0.34)]',
			'[background-image:var(--desktop-chrome-aurora-icon-file-bg)] p-2',
			'shadow-[0_0_18px_rgba(34,211,238,0.12)]'
		),
	},
	chameleon: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border border-(--glass-border)',
			'[background-image:var(--desktop-chrome-chameleon-icon-app-bg)]',
			'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_36px_rgba(0,0,0,0.34)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'min-h-0 border border-(--glass-border) p-2',
			'[background-image:var(--desktop-chrome-chameleon-icon-file-bg)]',
			'shadow-[0_10px_26px_rgba(0,0,0,0.22)]'
		),
	},
	premium: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border border-[rgba(212,175,106,0.34)]',
			'[background-image:var(--desktop-chrome-premium-icon-app-bg)]',
			'shadow-[0_0_0_1px_rgb(var(--desktop-fg-primary-rgb)/0.06),0_14px_32px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,250,240,0.4)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border border-[rgba(212,175,106,0.26)]',
			'[background-image:var(--desktop-chrome-premium-icon-file-bg)] p-2',
			'shadow-[inset_0_1px_0_rgba(255,250,240,0.35)]'
		),
	},
	prism: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border-2 border-[rgba(167,139,250,0.48)]',
			'bg-[linear-gradient(168deg,rgb(12,8,28)_0%,rgb(4,6,18)_100%)]',
			'shadow-[0_0_0_1px_rgba(244,114,182,0.2),0_12px_32px_rgba(0,0,0,0.5)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border-2 border-[rgba(167,139,250,0.4)]',
			'bg-[linear-gradient(145deg,rgba(56,189,248,0.16)_0%,rgb(12,8,28)_100%)] p-2',
			'shadow-[0_8px_20px_rgba(0,0,0,0.32)]'
		),
	},
	mercury: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border border-[rgba(255,255,255,0.42)]',
			'bg-[linear-gradient(138deg,#f8fafc_0%,#94a3b8_36%,#e2e8f0_54%,#64748b_82%,#f1f5f9_100%)]',
			'shadow-[inset_0_2px_10px_rgba(255,255,255,0.78),inset_0_-6px_14px_rgba(0,0,0,0.32),0_0_0_1px_rgba(0,0,0,0.28),0_14px_34px_rgba(0,0,0,0.52)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border border-[rgba(255,255,255,0.36)]',
			'bg-[linear-gradient(145deg,rgb(248,250,252)_0%,rgb(100,116,139)_100%)] p-2',
			'shadow-[inset_0_1px_0_rgba(255,255,255,0.58),0_0_0_1px_rgba(0,0,0,0.22)]'
		),
	},
	vhs: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border border-fuchsia-500/45',
			'bg-[linear-gradient(180deg,rgb(30,5,48)_0%,rgb(15,23,42)_55%,rgb(2,6,23)_100%)]',
			'shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_12px_30px_rgba(0,0,0,0.65)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border border-cyan-400/38',
			'bg-[linear-gradient(180deg,rgb(30,5,48)_0%,rgb(2,6,23)_100%)] p-2',
			'shadow-[0_8px_18px_rgba(0,0,0,0.36)]'
		),
	},
	/** Static icon packs — no CSS animation / shimmer. */
	slate: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border border-[rgba(148,163,184,0.42)]',
			'bg-[linear-gradient(180deg,rgb(51,65,85)_0%,rgb(30,41,59)_100%)]',
			'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_rgba(0,0,0,0.4)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border border-[rgba(148,163,184,0.36)]',
			'bg-[linear-gradient(180deg,rgb(51,65,85)_0%,rgb(30,41,59)_100%)] p-2',
			'shadow-[0_8px_18px_rgba(0,0,0,0.32)]'
		),
	},
	clay: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border border-[rgba(180,120,90,0.45)]',
			'bg-[linear-gradient(168deg,rgb(92,58,42)_0%,rgb(58,36,28)_100%)]',
			'shadow-[inset_0_1px_0_rgba(255,220,190,0.12),0_10px_24px_rgba(0,0,0,0.42)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border border-[rgba(180,120,90,0.4)]',
			'bg-[linear-gradient(168deg,rgb(92,58,42)_0%,rgb(58,36,28)_100%)] p-2',
			'shadow-[0_8px_18px_rgba(0,0,0,0.34)]'
		),
	},
	ember: {
		appBox: cn(
			DESKTOP_ICON_APP_TILE,
			'border border-[rgba(245,158,11,0.42)]',
			'bg-[linear-gradient(168deg,rgb(28,16,10)_0%,rgb(12,8,6)_100%)]',
			'shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_10px_26px_rgba(0,0,0,0.5)]'
		),
		fileBox: cn(
			DESKTOP_ICON_FILE_TILE,
			'border border-[rgba(245,158,11,0.36)]',
			'bg-[linear-gradient(168deg,rgb(28,16,10)_0%,rgb(12,8,6)_100%)] p-2',
			'shadow-[0_8px_18px_rgba(0,0,0,0.4)]'
		),
	},
};

/** Лёгкий хелпер для превью и ярлыков — одна точка для app/file tile классов. */
export function getDesktopIconSurfaceClasses(iconStyle: DesktopIconStyle): {
	appBox: string;
	fileBox: string;
} {
	return (
		DESKTOP_ICON_SURFACE_STYLES[iconStyle] ?? DESKTOP_ICON_SURFACE_STYLES.glass
	);
}

/** Левая колонка навигации модалок оболочки; glass — тот же фон/блюр, что у `frame`, чтобы рельс не терялся на фоне контента. */
export function getDesktopShellNavRailClassName(
	windowStyle: DesktopWindowStyle
): string {
	return (
		DESKTOP_WINDOW_FRAME_STYLES[windowStyle] ??
		DESKTOP_WINDOW_FRAME_STYLES.glass
	).shellNavRail;
}

/**
 * Правая колонка (предпросмотр, AI-панель) — зеркало {@link getDesktopShellNavRailClassName}: `border-l` и inset-тень слева.
 */
export function getDesktopShellEastColumnClassName(
	windowStyle: DesktopWindowStyle
): string {
	const rail = getDesktopShellNavRailClassName(windowStyle);
	return rail
		.replace(/\bborder-r\b/g, 'border-l')
		.replace(/inset_-1px_0_0/g, 'inset_1px_0_0');
}

/** Нижние полосы Пуска и аналогичные разделители. */
export function getDesktopShellFooterStripClassName(
	windowStyle: DesktopWindowStyle
): string {
	return (
		DESKTOP_WINDOW_FRAME_STYLES[windowStyle] ??
		DESKTOP_WINDOW_FRAME_STYLES.glass
	).shellFooterStrip;
}

/**
 * Верхняя полоса (баннер Settings / под titlebar) — зеркало
 * {@link getDesktopShellFooterStripClassName} с `border-b` вместо `border-t`.
 * Uses per-style chrome tokens (`--desktop-chrome-*`) so light/dark packs apply.
 */
export function getDesktopShellHeaderStripClassName(
	windowStyle: DesktopWindowStyle
): string {
	return getDesktopShellFooterStripClassName(windowStyle)
		.replace(/\bborder-t-2\b/g, 'border-b-2')
		.replace(/\bborder-t\b/g, 'border-b');
}

/**
 * Opaque floating surface (menus, compact popovers on `document.body`).
 * Prefer with {@link DesktopShellFloatingPortal} or `getDesktopPortalShellProps()`.
 */
export function getDesktopShellFloatingSurfaceClassName(
	windowStyle: DesktopWindowStyle
): string {
	return getDesktopShellFloatingMenuSurfaceTierClasses(
		getDesktopWindowShellTier(windowStyle)
	);
}

/**
 * {@link DESKTOP_WINDOW_FRAME_STYLES}.frame uses alpha gradients — fine inside window chrome,
 * unreadable over chat/desktop wallpaper without an opaque parent.
 */
function getDesktopShellFloatingMenuSurfaceTierClasses(
	tier: ReturnType<typeof getDesktopWindowShellTier>
): string {
	switch (tier) {
		case 'glass':
			return cn(
				'border border-(--glass-border)',
				'bg-[rgb(var(--desktop-bg-secondary-rgb))]',
				'shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.08),0_28px_72px_rgba(0,0,0,0.52)]'
			);
		case 'framed':
			return cn(
				'border border-(--desktop-border-strong)',
				'bg-[rgb(var(--desktop-bg-secondary-rgb))]',
				'shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_36px_90px_rgba(0,0,0,0.56)]'
			);
		default:
			return cn(
				'border border-(--desktop-border-subtle)',
				'bg-[rgb(var(--desktop-bg-secondary-rgb))]',
				'shadow-[0_28px_66px_rgba(0,0,0,0.5)]'
			);
	}
}

/**
 * ПКМ и выпадающие меню на `document.body` — **непрозрачный** фон (см. floating-menu canon
 * в `documentation/product/DESKTOP-WINDOW-SHELL-STYLE.md` §Floating portal surfaces).
 */
export function getDesktopShellContextMenuClassName(
	windowStyle: DesktopWindowStyle,
	options?: { clipOverflow?: boolean }
): string {
	const clipOverflow = options?.clipOverflow !== false;
	const tier = getDesktopWindowShellTier(windowStyle);
	return cn(
		'min-h-0 min-w-[220px] rounded-(--desktop-radius-lg) py-1 text-(--desktop-text-primary)',
		clipOverflow ? 'overflow-hidden' : 'overflow-visible',
		getDesktopShellFloatingMenuSurfaceTierClasses(tier)
	);
}

/** Карточка файла в сетке (контент-менеджер), не выбрана — под пресетом окон. */
export function getDesktopShellFileCardRootIdleClassName(
	windowStyle: DesktopWindowStyle
): string {
	switch (getDesktopWindowShellTier(windowStyle)) {
		case 'glass':
			return cn(
				'border border-(--glass-border)',
				'bg-[radial-gradient(circle_at_12%_0%,rgb(var(--desktop-accent-rgb)/0.07),transparent_40%),color-mix(in_srgb,var(--glass-bg-strong)_65%,transparent_35%)]',
				'shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)]',
				'hover:border-[rgb(var(--desktop-accent-rgb)/0.28)] hover:shadow-(--desktop-shadow-soft)'
			);
		case 'framed':
			return cn(
				'border border-(--desktop-border-strong)',
				'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.82)_0%,rgb(var(--desktop-bg-primary-rgb)/0.78)_100%)]',
				'hover:border-[rgb(var(--desktop-accent-rgb)/0.28)] hover:shadow-(--desktop-shadow-soft)'
			);
		default:
			return cn(
				'border border-(--desktop-border-subtle) bg-(--desktop-surface-panel)',
				'hover:border-(--desktop-border-strong) hover:bg-(--desktop-surface-panel-strong) hover:shadow-(--desktop-shadow-soft)'
			);
	}
}

/** Зона превью (aspect) на карточке файла. */
export function getDesktopShellFileCardThumbClassName(
	windowStyle: DesktopWindowStyle
): string {
	switch (getDesktopWindowShellTier(windowStyle)) {
		case 'glass':
			return cn(
				'border-b border-(--glass-border)',
				'bg-[color-mix(in_srgb,var(--glass-bg-strong)_48%,rgb(var(--desktop-bg-primary-rgb)/0.22))]'
			);
		case 'framed':
			return cn(
				'border-b border-(--desktop-border-strong)',
				'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.5)_0%,rgb(var(--desktop-bg-primary-rgb)/0.42)_100%)]'
			);
		default:
			return 'border-b border-(--desktop-border-subtle) bg-(--desktop-surface-panel-strong)';
	}
}

/** Нижний блок метаданных на карточке файла. */
export function getDesktopShellFileCardMetaClassName(
	windowStyle: DesktopWindowStyle
): string {
	switch (getDesktopWindowShellTier(windowStyle)) {
		case 'glass':
			return cn(
				'border-t border-[rgba(255,255,255,0.07)]',
				'bg-[color-mix(in_srgb,var(--glass-bg-strong)_38%,transparent)]'
			);
		case 'framed':
			return cn(
				'border-t border-(--desktop-border-subtle)',
				'bg-[color-mix(in_srgb,rgb(var(--desktop-bg-primary-rgb))_0.4,transparent)]'
			);
		default:
			return 'border-t border-(--desktop-border-subtle)';
	}
}

/** Кластер вкладок / действий в шапке контент-менеджера (embedded). */
export function getDesktopShellToolbarClusterClassName(
	windowStyle: DesktopWindowStyle
): string {
	switch (getDesktopWindowShellTier(windowStyle)) {
		case 'glass':
			return cn(
				'border border-(--glass-border)',
				'bg-[radial-gradient(circle_at_12%_0%,rgb(var(--desktop-accent-rgb)/0.06),transparent_42%),color-mix(in_srgb,var(--glass-bg-strong)_58%,transparent_42%)]',
				'shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.07)]'
			);
		case 'framed':
			return cn(
				'border border-(--desktop-border-strong)',
				'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.78)_0%,rgb(var(--desktop-bg-primary-rgb)/0.74)_100%)]'
			);
		default:
			return cn(
				'border border-(--desktop-border-subtle)',
				'bg-[color-mix(in_srgb,rgb(var(--desktop-bg-primary-rgb))_0.94,transparent)]'
			);
	}
}

/**
 * Поля внутри уже оформленного {@link getDesktopShellToolbarClusterClassName} — без второй «карточки»
 * (селекты компании/проекта/файла в шапке маркетингового кабинета).
 */
export function getDesktopShellToolbarClusterInsetControlClassName(
	windowStyle: DesktopWindowStyle
): string {
	switch (getDesktopWindowShellTier(windowStyle)) {
		case 'glass':
			return cn(
				'border border-(--glass-border)/40',
				'bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.06)_100%,transparent)]',
				'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
				'hover:bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.09)_100%,transparent)]'
			);
		case 'framed':
			return cn(
				'border border-(--desktop-border-subtle)/60',
				'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.38)_0%,rgb(var(--desktop-bg-primary-rgb)/0.28)_100%)]',
				'hover:border-(--desktop-border-strong)/75'
			);
		default:
			return cn(
				'border border-(--desktop-border-subtle)/65',
				'bg-[color-mix(in_srgb,rgb(var(--desktop-bg-primary-rgb)/0.2)_100%,transparent)]',
				'hover:bg-[color-mix(in_srgb,rgb(var(--desktop-bg-primary-rgb)/0.28)_100%,transparent)]'
			);
	}
}

/** `<select>` и поля в той же строке — согласованы с кластером. */
export function getDesktopShellFormSelectClassName(
	windowStyle: DesktopWindowStyle
): string {
	switch (getDesktopWindowShellTier(windowStyle)) {
		case 'glass':
			return cn(
				'border-(--glass-border)',
				'bg-[color-mix(in_srgb,var(--glass-bg-strong)_52%,rgb(var(--desktop-bg-primary-rgb)/0.28))]'
			);
		case 'framed':
			return cn(
				'border-(--desktop-border-strong)',
				'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.62)_0%,rgb(var(--desktop-bg-primary-rgb)/0.52)_100%)]'
			);
		default:
			return 'border-(--desktop-border-subtle) bg-(--desktop-surface-panel)';
	}
}

/**
 * Пункты выпадающего списка нативного `<select>` (где браузер позволяет) — фон и текст как у панелей десктопа.
 * Стили в `src/styles/index.css` (`.desktop-native-select-option`), не inline — webhint no-inline-styles.
 */
export const DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME =
	'desktop-native-select-option';

/**
 * Закрытый `<select>` в приложениях рабочего стола: бордер/фон по {@link getDesktopShellFormSelectClassName},
 * плотность, фокус, `appearance-none` (стрелку рисует компонент `DesktopNativeSelect` в DesktopAppChrome).
 */
export function getDesktopNativeSelectControlClassName(
	shellFrame: DesktopWindowStyle
): string {
	return cn(
		getDesktopShellFormSelectClassName(shellFrame),
		'min-h-[2.25rem] w-full min-w-[10rem] max-w-full rounded-(--desktop-radius)',
		'px-2.5 py-1.5 text-xs font-medium leading-normal text-[var(--desktop-text-primary)]',
		'shadow-[var(--desktop-shadow-soft)]',
		'transition-[border-color,box-shadow,background-color] duration-150',
		'focus:outline-none focus:ring-2 focus:ring-[rgb(var(--desktop-accent-rgb)/0.22)] focus:border-[rgb(var(--desktop-accent-rgb)/0.45)]',
		'disabled:cursor-not-allowed disabled:opacity-50',
		'appearance-none cursor-pointer pr-8 pl-2.5',
		'scheme-dark'
	);
}

/** `<input type="checkbox">` в формах внутри оболочки — тот же язык, что у {@link getDesktopShellToolbarClusterInsetControlClassName}. */
export function getDesktopShellCheckboxControlClassName(
	windowStyle: DesktopWindowStyle
): string {
	switch (getDesktopWindowShellTier(windowStyle)) {
		case 'glass':
			return cn(
				'border border-(--glass-border)/40',
				'bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.06)_100%,transparent)]',
				'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
				'accent-(--mc-accent)'
			);
		case 'framed':
			return cn(
				'border border-(--desktop-border-subtle)/60',
				'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.38)_0%,rgb(var(--desktop-bg-primary-rgb)/0.28)_100%)]',
				'accent-(--mc-accent)'
			);
		default:
			return cn(
				'border border-(--desktop-border-subtle)/65',
				'bg-[color-mix(in_srgb,rgb(var(--desktop-bg-primary-rgb)/0.2)_100%,transparent)]',
				'accent-(--mc-accent)'
			);
	}
}

/**
 * Фон дорожки индикатора прогресса внутри glass-карточек (обзор покрытия, целостность стратегии и т.п.).
 * Согласован с {@link getDesktopShellToolbarClusterInsetControlClassName} без hover.
 */
export function getDesktopShellProgressTrackClassName(
	windowStyle: DesktopWindowStyle
): string {
	switch (getDesktopWindowShellTier(windowStyle)) {
		case 'glass':
			return cn(
				'border border-(--glass-border)/40',
				'bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.06)_100%,transparent)]',
				'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
			);
		case 'framed':
			return cn(
				'border border-(--desktop-border-subtle)/60',
				'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.38)_0%,rgb(var(--desktop-bg-primary-rgb)/0.28)_100%)]'
			);
		default:
			return cn(
				'border border-(--desktop-border-subtle)/65',
				'bg-[color-mix(in_srgb,rgb(var(--desktop-bg-primary-rgb)/0.2)_100%,transparent)]'
			);
	}
}

/** Строки опций в выпадающем списке маркетингового кабинета — hover/highlight под {@link DesktopWindowStyle}. */
export function getDesktopShellSelectListOptionInteractiveClassName(
	windowStyle: DesktopWindowStyle
): { hoverFocus: string; highlight: string } {
	switch (getDesktopWindowShellTier(windowStyle)) {
		case 'glass':
			return {
				hoverFocus:
					'hover:bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.1)_100%,transparent)] focus-visible:bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.12)_100%,transparent)]',
				highlight:
					'bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.07)_100%,transparent)]',
			};
		case 'framed':
			return {
				hoverFocus:
					'hover:bg-[color-mix(in_srgb,rgb(var(--desktop-bg-secondary-rgb)/0.22)_100%,transparent)] focus-visible:bg-[color-mix(in_srgb,rgb(var(--desktop-bg-primary-rgb)/0.2)_100%,transparent)]',
				highlight:
					'bg-[color-mix(in_srgb,rgb(var(--desktop-bg-primary-rgb)/0.16)_100%,transparent)]',
			};
		default:
			return {
				hoverFocus:
					'hover:bg-(--desktop-surface-soft-hover) focus-visible:bg-(--desktop-surface-soft-active)',
				highlight: 'bg-(--desktop-surface-soft)',
			};
	}
}

/**
 * Strong window presets keep a distinct nested surface (not collapsed into glass/framed/minimal).
 * Shared by content panels, Settings form cards, and framed {@link DesktopAppContentWrapper}.
 */
function getDesktopShellDistinctNestedSurfaceClassName(
	windowStyle: DesktopWindowStyle
): string | null {
	switch (windowStyle) {
		case 'noir':
			return cn(
				'rounded-(--desktop-radius-lg)',
				'border border-(--desktop-chrome-noir-card-border)',
				'[background-image:var(--desktop-chrome-noir-card-bg)]',
				'shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]'
			);
		case 'neon':
			return cn(
				'rounded-(--desktop-radius-lg)',
				'border border-[rgb(var(--desktop-accent-rgb)/0.38)]',
				'[background-image:var(--desktop-chrome-neon-card-bg)]',
				'shadow-[inset_0_0_0_1px_rgb(var(--desktop-accent-rgb)/0.12)]'
			);
		case 'paper':
			return cn(
				'rounded-(--desktop-radius-lg)',
				'border-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_35%,transparent)]',
				'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--desktop-paper-highlight)_58%,rgb(var(--desktop-bg-primary-rgb))_42%)_0%,color-mix(in_srgb,var(--desktop-paper-warm)_48%,rgb(var(--desktop-bg-primary-rgb))_52%)_100%)]',
				'shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]'
			);
		case 'aurora':
			return cn(
				'rounded-(--desktop-radius-lg)',
				'border border-(--desktop-chrome-aurora-card-border)',
				'[background-image:var(--desktop-chrome-aurora-card-bg)]',
				'shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]'
			);
		case 'chameleon':
			return cn(
				'rounded-xl min-h-0',
				'border border-[var(--glass-border)]',
				'[background-image:var(--desktop-chrome-chameleon-card-bg)]',
				'shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.06),0_10px_26px_rgba(0,0,0,0.18)]'
			);
		case 'premium':
			return cn(
				'rounded-(--desktop-radius-lg)',
				'border border-[rgba(212,175,106,0.28)]',
				'[background-image:var(--desktop-chrome-premium-card-bg)]',
				'shadow-[inset_0_1px_0_rgba(255,250,240,0.5)]'
			);
		default:
			return null;
	}
}

/**
 * Root fill for apps inside EnhancedWindow — keep transparent so
 * {@link DESKTOP_WINDOW_FRAME_STYLES}.content (and framed content panels) show through.
 * Standalone full-page routes should keep `bg-(--desktop-surface-app)` themselves.
 */
export function getDesktopShellEmbeddedAppRootClassName(): string {
	return 'flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-(--desktop-text-primary) antialiased';
}

/**
 * Внутренние карточки / framed app surface — согласованы с пресетом окон.
 * Strong presets (noir/neon/paper/aurora/chameleon/premium) stay distinct;
 * glass/framed/minimal use {@link getDesktopWindowShellTier}.
 */
export function getDesktopShellContentPanelClassName(
	windowStyle: DesktopWindowStyle
): string {
	const distinct = getDesktopShellDistinctNestedSurfaceClassName(windowStyle);
	if (distinct) return distinct;

	switch (getDesktopWindowShellTier(windowStyle)) {
		case 'glass':
			return cn(
				'rounded-(--desktop-radius-lg)',
				'border border-(--glass-border)',
				'bg-[radial-gradient(circle_at_12%_0%,rgb(var(--desktop-accent-rgb)/0.06),transparent_40%),color-mix(in_srgb,var(--glass-bg-strong)_58%,transparent_42%)]',
				'shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.06)] shadow-(--desktop-shadow-soft)'
			);
		case 'framed':
			return cn(
				'rounded-(--desktop-radius-lg)',
				'border border-(--desktop-border-strong)',
				'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb))_0%,rgb(var(--desktop-bg-primary-rgb))_100%)]',
				'shadow-(--desktop-shadow-soft)'
			);
		default:
			return cn(
				'rounded-(--desktop-radius-lg)',
				'border border-(--desktop-border-subtle) bg-(--desktop-surface-panel)',
				'shadow-(--desktop-shadow-soft)'
			);
	}
}

/**
 * Правая колонка «Центра управления»: заметнее, чем {@link DESKTOP_WINDOW_FRAME_STYLES}.content.
 * Strong presets use `--desktop-chrome-*-content-bg` (light/dark packs from {@link getDesktopThemeVars}).
 */
export function getDesktopShellSettingsMainColumnClassName(
	windowStyle: DesktopWindowStyle
): string {
	const preset =
		DESKTOP_WINDOW_FRAME_STYLES[windowStyle] ??
		DESKTOP_WINDOW_FRAME_STYLES.glass;
	switch (windowStyle) {
		case 'paper':
			return cn(
				'border-l border-[color-mix(in_srgb,var(--desktop-paper-edge)_32%,transparent)]',
				'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--desktop-paper-highlight)_62%,rgb(var(--desktop-bg-primary-rgb))_38%)_0%,color-mix(in_srgb,var(--desktop-paper-warm)_52%,rgb(var(--desktop-bg-primary-rgb))_48%)_100%)]',
				'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--desktop-paper-edge)_14%,transparent)]'
			);
		case 'noir':
			return cn(
				'border-l border-(--desktop-chrome-noir-card-border)',
				'[background-image:var(--desktop-chrome-noir-content-bg)]'
			);
		case 'neon':
			return cn(
				'border-l border-[rgb(var(--desktop-accent-rgb)/0.4)]',
				'[background-image:var(--desktop-chrome-neon-content-bg)]',
				'shadow-[inset_0_0_0_1px_rgb(var(--desktop-accent-rgb)/0.22)]'
			);
		case 'premium':
			return cn(
				'border-l border-[rgba(212,175,106,0.22)]',
				'[background-image:var(--desktop-chrome-premium-content-bg)]'
			);
		case 'aurora':
			return cn(
				'border-l border-(--desktop-chrome-aurora-card-border)',
				'[background-image:var(--desktop-chrome-aurora-content-bg)]'
			);
		case 'chameleon':
			return cn(
				'border-l border-(--glass-border)/55',
				'[background-image:var(--desktop-chrome-chameleon-content-bg)] min-h-0'
			);
		default:
			return cn('border-l border-(--desktop-border-subtle)/70', preset.content);
	}
}

/**
 * Карточки секций «Центра управления» — те же distinct surfaces, что и
 * {@link getDesktopShellContentPanelClassName}; для glass/framed/minimal — лёгкий accent hairline.
 */
export function getDesktopShellSettingsFormCardClassName(
	windowStyle: DesktopWindowStyle
): string {
	const distinct = getDesktopShellDistinctNestedSurfaceClassName(windowStyle);
	if (distinct) return distinct;

	return cn(
		getDesktopShellContentPanelClassName(windowStyle),
		'relative overflow-hidden',
		'before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:rounded-full',
		'before:bg-[linear-gradient(90deg,transparent,rgb(var(--desktop-accent-rgb)/0.32),transparent)]',
		'after:pointer-events-none after:absolute after:inset-0 after:rounded-(--desktop-radius-lg) after:shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.04)]'
	);
}

/**
 * Выпадающее меню «Ещё» в GAF Chat — отдельно от {@link getDesktopShellContentPanelClassName}:
 * плоская панель без вертикального градиента «как у окна», чтобы читалось как компактный dropdown.
 */
export function getGafChatOverflowMenuSurfaceClassName(
	windowStyle: DesktopWindowStyle
): string {
	const tier = getDesktopWindowShellTier(windowStyle);
	const gafStripe = 'border-l-4 border-l-[rgb(var(--desktop-accent-rgb))]';
	const gafRound = 'overflow-hidden rounded-[var(--desktop-radius-lg)]';
	return cn(
		gafStripe,
		gafRound,
		getDesktopShellFloatingMenuSurfaceTierClasses(tier)
	);
}

export type DesktopShellPanelStrength = 'standard' | 'strong';

/**
 * Floating shell surfaces (Пуск, быстрый поиск, трей, центр уведомлений, подтверждения)
 * — те же пресеты рамки, что и у окон {@link DESKTOP_WINDOW_FRAME_STYLES}.
 */
export function getDesktopShellPanelClassName(
	windowStyle: DesktopWindowStyle,
	strength: DesktopShellPanelStrength = 'standard'
): string {
	const preset =
		DESKTOP_WINDOW_FRAME_STYLES[windowStyle] ??
		DESKTOP_WINDOW_FRAME_STYLES.glass;
	// framed/minimal уже задают тень в `frame`; glass — нет.
	const tier = getDesktopWindowShellTier(windowStyle);
	const extraShadow =
		tier === 'glass'
			? strength === 'strong'
				? 'shadow-[0_36px_88px_rgba(0,0,0,0.55)]'
				: 'shadow-[0_28px_72px_rgba(0,0,0,0.52)]'
			: '';
	return [
		'rounded-[var(--desktop-radius-shell)]',
		'overflow-hidden',
		preset.frame,
		extraShadow,
	]
		.filter(Boolean)
		.join(' ');
}

/** Корневой контейнер плавающего desktop-виджета по {@link DesktopWidgetsStyle} (те же ключи, что у окон). */
/** How the floating widget is anchored before a free position is saved. */
export function getDesktopWidgetRootClassName(
	widgetsStyle: DesktopWidgetsStyle,
	placement: 'preset-corner' | 'free' = 'preset-corner'
): string {
	const preset =
		DESKTOP_WINDOW_FRAME_STYLES[widgetsStyle] ??
		DESKTOP_WINDOW_FRAME_STYLES.glass;
	const tier = getDesktopWindowShellTier(widgetsStyle);
	const base =
		placement === 'preset-corner'
			? 'group absolute top-16 right-5 z-1 overflow-hidden'
			: 'group absolute z-1 overflow-hidden';
	const width = tier === 'minimal' ? 'w-72 min-w-72' : 'w-75 min-w-75';
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
	return [base, width, radius, preset.frame, extraShadow]
		.filter(Boolean)
		.join(' ');
}

interface DesktopWindowTitleBarPreset {
	root: string;
	iconShell: string;
	title: string;
	pill: string;
	/** Wrapper around minimize / maximize / close */
	controlGroup: string;
	/** Minimize & maximize */
	control: string;
	/** Close: neutral idle, strong hover */
	close: string;
}

const DESKTOP_FLAT_TITLEBAR: DesktopWindowTitleBarPreset = {
	root: 'bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb))_0%,rgb(var(--desktop-bg-primary-rgb))_48%,rgb(var(--desktop-bg-primary-rgb))_100%)] border-b border-(--desktop-border-strong)/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-1px_0_rgba(0,0,0,0.08)]',
	iconShell:
		'rounded-(--desktop-radius-section) border border-[rgb(var(--desktop-accent-rgb)/0.22)] bg-[linear-gradient(165deg,rgb(var(--desktop-accent-rgb)/0.14)_0%,rgb(var(--desktop-accent-rgb)/0.06)_100%)] shadow-[0_6px_16px_rgba(0,0,0,0.28)]',
	title:
		'text-(--desktop-text-primary) drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]',
	pill: 'border border-[rgb(var(--desktop-accent-rgb)/0.22)] bg-[rgb(var(--desktop-accent-rgb)/0.1)] text-(--desktop-text-secondary) shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
	controlGroup:
		'flex items-center gap-0.5 rounded-[11px] border border-(--desktop-border-subtle)/60 bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb))_0%,rgb(var(--desktop-bg-primary-rgb))_100%)] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
	control:
		'text-(--desktop-text-muted) hover:bg-(--desktop-surface-soft-hover) active:bg-(--desktop-surface-soft-active) hover:text-(--desktop-text-primary)',
	close:
		'text-(--desktop-text-muted) hover:bg-[#e81123] hover:text-white active:bg-[#c50e1e] active:text-white',
};

export const DESKTOP_WINDOW_TITLEBAR_STYLES: Record<
	DesktopWindowStyle,
	DesktopWindowTitleBarPreset
> = {
	glass: {
		root: 'bg-[radial-gradient(circle_at_12%_0%,rgb(var(--desktop-accent-rgb)/0.08),transparent_40%),linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb)/0.97)_0%,rgb(var(--desktop-bg-primary-rgb)/0.97)_100%)] border-b border-(--glass-border)/55 shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.08),inset_0_-1px_0_rgba(0,0,0,0.12)]',
		iconShell:
			'rounded-(--desktop-radius-section) border border-(--glass-border)/45 bg-[linear-gradient(165deg,rgb(var(--desktop-accent-rgb)/0.14)_0%,rgb(var(--desktop-bg-secondary-rgb)/0.97)_100%)] shadow-[0_4px_14px_rgba(0,0,0,0.14)]',
		title: 'text-(--desktop-text-primary)',
		pill: 'border border-(--glass-border)/40 bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.08)_100%,transparent)] text-(--desktop-text-secondary) shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)]',
		controlGroup:
			'flex items-center gap-0.5 rounded-[11px] border border-(--glass-border)/40 bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.06)_100%,transparent)] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
		control:
			'text-(--desktop-text-muted) hover:bg-(--desktop-surface-soft-hover) active:bg-(--desktop-surface-soft-active) hover:text-(--desktop-text-primary)',
		close:
			'text-(--desktop-text-muted) hover:bg-[#dc2626] hover:text-white active:bg-[#b91c1c] active:text-white',
	},
	framed: DESKTOP_FLAT_TITLEBAR,
	minimal: {
		root: 'bg-[color-mix(in_srgb,var(--glass-bg-strong)_78%,rgb(var(--desktop-bg-primary-rgb))_22%)] border-b border-(--desktop-border-subtle) shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)]',
		iconShell:
			'rounded-(--desktop-radius-section) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) shadow-[0_2px_10px_rgba(0,0,0,0.12)]',
		title: 'text-(--desktop-text-primary)',
		pill: 'border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-muted)',
		controlGroup:
			'flex items-center gap-0.5 rounded-[10px] border border-(--desktop-border-subtle)/65 bg-[color-mix(in_srgb,rgb(var(--desktop-bg-primary-rgb)/0.22)_100%,transparent)] p-0.5 shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.04)]',
		control:
			'text-(--desktop-text-muted) hover:bg-(--desktop-surface-soft-hover) active:bg-(--desktop-surface-soft-active) hover:text-(--desktop-text-primary)',
		close:
			'text-(--desktop-text-muted) hover:bg-red-600 hover:text-white active:bg-red-700 active:text-white',
	},
	noir: {
		root: '[background-image:var(--desktop-chrome-noir-titlebar-bg)] border-b-2 border-(--desktop-border-strong) shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]',
		iconShell:
			'rounded-(--desktop-radius-section) border border-(--desktop-border-strong) [background-image:var(--desktop-chrome-noir-content-bg)] shadow-[0_2px_12px_rgba(15,23,42,0.12)]',
		title: 'text-(--desktop-text-primary) tracking-tight font-medium',
		pill: 'border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary)',
		controlGroup:
			'flex items-center gap-0.5 rounded-[11px] border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]',
		control:
			'text-(--desktop-text-muted) hover:bg-(--desktop-surface-soft-hover) active:bg-(--desktop-surface-soft-active) hover:text-(--desktop-text-primary)',
		close:
			'text-(--desktop-text-muted) hover:bg-[#dc2626] hover:text-white active:bg-[#b91c1c] active:text-white',
	},
	neon: {
		root: '[background-image:var(--desktop-chrome-neon-titlebar-bg)] border-b-2 border-[rgb(var(--desktop-accent-rgb)/0.55)] shadow-[inset_0_-12px_24px_-12px_rgb(var(--desktop-accent-rgb)/0.18),0_0_20px_-6px_rgb(var(--desktop-accent-rgb)/0.28)]',
		iconShell:
			'rounded-(--desktop-radius-section) border-2 border-[rgb(var(--desktop-accent-rgb)/0.5)] [background-image:var(--desktop-chrome-neon-frame-bg)] shadow-[0_0_16px_rgb(var(--desktop-accent-rgb)/0.28)]',
		title:
			'text-[rgb(var(--desktop-accent-rgb))] drop-shadow-[0_0_8px_rgb(var(--desktop-accent-rgb)/0.35)] font-medium',
		pill: 'border border-[rgb(var(--desktop-accent-rgb)/0.35)] bg-(--desktop-surface-soft) text-[rgb(var(--desktop-accent-rgb)/0.95)]',
		controlGroup:
			'flex items-center gap-0.5 rounded-[11px] border border-[rgb(var(--desktop-accent-rgb)/0.3)] bg-(--desktop-surface-soft) p-0.5 shadow-[inset_0_0_10px_rgb(var(--desktop-accent-rgb)/0.1)]',
		control:
			'text-[rgb(var(--desktop-accent-rgb)/0.8)] hover:bg-[rgb(var(--desktop-accent-rgb)/0.12)] hover:text-[rgb(var(--desktop-accent-rgb))]',
		close:
			'text-[rgb(var(--desktop-accent-rgb)/0.7)] hover:bg-[#dc2626] hover:text-white hover:drop-shadow-none',
	},
	paper: {
		root: 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--desktop-paper-highlight)_40%,rgb(var(--desktop-bg-primary-rgb))_60%)_0%,color-mix(in_srgb,var(--desktop-paper-warm)_25%,rgb(var(--desktop-bg-primary-rgb))_75%)_100%)] border-b-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_55%,transparent)] shadow-[inset_0_2px_0_rgba(255,255,255,0.5)]',
		iconShell:
			'rounded-(--desktop-radius-section) border-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_45%,transparent)] bg-[color-mix(in_srgb,var(--desktop-paper-highlight)_55%,var(--desktop-surface-soft)_45%)] shadow-[2px_2px_0_0_color-mix(in_srgb,var(--desktop-paper-ink)_12%,transparent)]',
		title:
			'text-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb))_92%,var(--desktop-paper-ink)_8%)] font-medium',
		pill: 'border border-[color-mix(in_srgb,var(--desktop-paper-edge)_40%,transparent)] bg-[color-mix(in_srgb,var(--desktop-paper-cream-soft)_50%,transparent)] text-(--desktop-paper-ink)',
		controlGroup:
			'flex items-center gap-0.5 rounded-[10px] border-2 border-[color-mix(in_srgb,var(--desktop-paper-ring)_50%,transparent)] bg-[color-mix(in_srgb,var(--desktop-paper-highlight)_35%,transparent)] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
		control:
			'text-(--desktop-paper-ink) hover:bg-[color-mix(in_srgb,var(--desktop-paper-edge)_12%,transparent)] active:bg-[color-mix(in_srgb,var(--desktop-paper-edge)_18%,transparent)]',
		close:
			'text-(--desktop-paper-ink) hover:bg-red-600 hover:text-white active:bg-red-700 active:text-white',
	},
	aurora: {
		root: '[background-image:var(--desktop-chrome-aurora-titlebar-bg)] border-b-2 border-[transparent] shadow-[inset_0_-2px_0_0_rgba(168,85,247,0.4),inset_0_1px_0_0_rgba(34,211,238,0.22)]',
		iconShell:
			'rounded-(--desktop-radius-section) border-2 border-[rgba(168,85,247,0.45)] [background-image:var(--desktop-chrome-aurora-titlebar-icon-bg)] shadow-[0_0_14px_rgba(168,85,247,0.22)]',
		title:
			'text-[color:var(--desktop-chrome-aurora-titlebar-title)] drop-shadow-[0_0_10px_rgba(168,85,247,0.28)] font-medium',
		pill: 'border border-[rgba(34,211,238,0.3)] bg-(--desktop-chrome-aurora-titlebar-pill-bg) text-[color:var(--desktop-chrome-aurora-titlebar-pill-fg)]',
		controlGroup:
			'flex items-center gap-0.5 rounded-[11px] border border-[rgba(168,85,247,0.3)] bg-(--desktop-chrome-aurora-titlebar-control-bg) p-0.5 shadow-[0_0_10px_rgba(34,211,238,0.1)]',
		control:
			'text-[color:var(--desktop-chrome-aurora-titlebar-control-fg)] hover:bg-[rgba(168,85,247,0.14)] hover:opacity-100',
		close:
			'text-[color:var(--desktop-chrome-aurora-titlebar-control-fg)] hover:bg-[#dc2626] hover:text-white',
	},
	chameleon: {
		root: '[background-image:var(--desktop-chrome-chameleon-titlebar-bg)] border-b border-(--glass-border)/55 shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.06)]',
		iconShell:
			'rounded-(--desktop-radius-section) border border-(--glass-border)/45 bg-[color-mix(in_srgb,var(--glass-bg-strong)_70%,rgb(var(--desktop-bg-primary-rgb))_30%)] shadow-[0_4px_14px_rgba(0,0,0,0.14)]',
		title: 'text-(--desktop-text-primary)',
		pill: 'border border-(--glass-border)/40 bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.08)_100%,transparent)] text-(--desktop-text-secondary)',
		controlGroup:
			'flex items-center gap-0.5 rounded-[11px] border border-(--glass-border)/40 bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.06)_100%,transparent)] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
		control:
			'text-(--desktop-text-muted) hover:bg-(--desktop-surface-soft-hover) active:bg-(--desktop-surface-soft-active) hover:text-(--desktop-text-primary)',
		close:
			'text-(--desktop-text-muted) hover:bg-[#dc2626] hover:text-white active:bg-[#b91c1c] active:text-white',
	},
	premium: {
		root: '[background-image:var(--desktop-chrome-premium-titlebar-bg)] border-b border-[rgba(212,175,106,0.28)] shadow-[inset_0_1px_0_rgba(255,250,245,0.45)]',
		iconShell:
			'rounded-(--desktop-radius-section) border border-[rgba(212,175,106,0.32)] [background-image:var(--desktop-chrome-premium-titlebar-icon-bg)] shadow-[0_4px_16px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,245,230,0.4)]',
		title:
			'text-[color:var(--desktop-chrome-premium-titlebar-title)] tracking-wide font-medium',
		pill: 'border border-[rgba(212,175,106,0.28)] bg-(--desktop-surface-soft) text-[color:var(--desktop-chrome-premium-titlebar-muted)] shadow-[inset_0_1px_0_rgba(255,250,240,0.35)]',
		controlGroup:
			'flex items-center gap-0.5 rounded-[11px] border border-[rgba(212,175,106,0.22)] bg-(--desktop-surface-soft) p-0.5 shadow-[inset_0_1px_0_rgba(255,250,240,0.35)]',
		control:
			'text-[color:var(--desktop-chrome-premium-titlebar-muted)] hover:bg-[rgba(212,175,106,0.12)] hover:text-[color:var(--desktop-chrome-premium-titlebar-title)]',
		close:
			'text-[color:var(--desktop-chrome-premium-titlebar-muted)] hover:bg-[#b91c1c] hover:text-white active:bg-[#991b1b]',
	},
};

type DesktopAppMotif =
	| 'spark'
	| 'beam'
	| 'wave'
	| 'grid'
	| 'orbit'
	| 'chat'
	| 'bars'
	| 'pulse';

/** Outline Heroicon (or compatible SVG icon component). */
export type DesktopAppGlyphIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface DesktopAppVisualPreset {
	glyph: DesktopAppGlyphIcon;
	primary: string;
	secondary: string;
	tertiary: string;
	glow: string;
	motif: DesktopAppMotif;
}

const DEFAULT_APP_VISUAL: DesktopAppVisualPreset = {
	glyph: SparklesIcon,
	primary: '#1d4ed8',
	secondary: '#7c3aed',
	tertiary: '#0f172a',
	glow: 'rgba(59, 130, 246, 0.28)',
	motif: 'spark',
};

/** Warm folder tile for glass/accent presets (desktop grid folders). */
const FOLDER_TILE_VISUAL: DesktopAppVisualPreset = {
	glyph: FolderIcon,
	primary: '#f59e0b',
	secondary: '#fbbf24',
	tertiary: '#78350f',
	glow: 'rgba(245, 158, 11, 0.32)',
	motif: 'spark',
};

const DESKTOP_APP_VISUALS: Record<string, DesktopAppVisualPreset> = {
	AppStore: {
		glyph: BuildingStorefrontIcon,
		primary: '#4f46e5',
		secondary: '#8b5cf6',
		tertiary: '#1e1b4b',
		glow: 'rgba(99, 102, 241, 0.3)',
		motif: 'grid',
	},
	DesktopShellSettings: {
		glyph: Cog6ToothIcon,
		primary: '#7c3aed',
		secondary: '#a78bfa',
		tertiary: '#1e1b4b',
		glow: 'rgba(124, 58, 237, 0.26)',
		motif: 'grid',
	},
	UnifiedAdminApp: {
		glyph: ShieldCheckIcon,
		primary: '#7c3aed',
		secondary: '#a78bfa',
		tertiary: '#1e1b4b',
		glow: 'rgba(124, 58, 237, 0.28)',
		motif: 'grid',
	},
	SiteManagerOps: {
		glyph: ShieldCheckIcon,
		primary: '#0ea5e9',
		secondary: '#7c3aed',
		tertiary: '#082f49',
		glow: 'rgba(14, 165, 233, 0.28)',
		motif: 'grid',
	},
	ContentManagerPro: {
		glyph: CircleStackIcon,
		primary: '#06b6d4',
		secondary: '#2563eb',
		tertiary: '#0f172a',
		glow: 'rgba(6, 182, 212, 0.28)',
		motif: 'bars',
	},
	UGS: {
		glyph: SparklesIcon,
		primary: '#a1a1aa',
		secondary: '#71717a',
		tertiary: '#18181b',
		glow: 'rgba(161, 161, 170, 0.22)',
		motif: 'spark',
	},
	UGSHubApp: {
		glyph: Squares2X2Icon,
		primary: '#22d3ee',
		secondary: '#64748b',
		tertiary: '#0f172a',
		glow: 'rgba(34, 211, 238, 0.24)',
		motif: 'grid',
	},
	EWRP: {
		glyph: PresentationChartBarIcon,
		primary: '#06b6d4',
		secondary: '#14b8a6',
		tertiary: '#083344',
		glow: 'rgba(6, 182, 212, 0.28)',
		motif: 'beam',
	},
	StudioGU: {
		glyph: MicrophoneIcon,
		primary: '#10b981',
		secondary: '#14b8a6',
		tertiary: '#052e2b',
		glow: 'rgba(16, 185, 129, 0.28)',
		motif: 'wave',
	},
	DocEditor: {
		glyph: DocumentTextIcon,
		primary: '#f59e0b',
		secondary: '#facc15',
		tertiary: '#422006',
		glow: 'rgba(245, 158, 11, 0.28)',
		motif: 'beam',
	},
	DocEditorV2: {
		glyph: DocumentTextIcon,
		primary: '#f59e0b',
		secondary: '#38bdf8',
		tertiary: '#0f172a',
		glow: 'rgba(56, 189, 248, 0.24)',
		motif: 'beam',
	},
	ImageStudio: {
		glyph: PhotoIcon,
		primary: '#7c3aed',
		secondary: '#d946ef',
		tertiary: '#312e81',
		glow: 'rgba(124, 58, 237, 0.3)',
		motif: 'orbit',
	},
	VideoStudio: {
		glyph: VideoCameraIcon,
		primary: '#6366f1',
		secondary: '#ec4899',
		tertiary: '#312e81',
		glow: 'rgba(99, 102, 241, 0.28)',
		motif: 'beam',
	},
	// GAF Chat: follows desktop chrome — ACCENT_COLORS default purple, slate panels,
	// framed surface + communication family (DesktopAppChrome). Badges/bubbles use rgb(var(--desktop-accent-rgb)).
	GAFChatApp: {
		glyph: ChatBubbleLeftRightIcon,
		primary: '#a855f7',
		secondary: '#6366f1',
		tertiary: '#1e1b4b',
		glow: 'rgba(168, 85, 247, 0.3)',
		motif: 'chat',
	},
	VideoCallApp: {
		glyph: VideoCameraIcon,
		primary: '#38bdf8',
		secondary: '#6366f1',
		tertiary: '#0f172a',
		glow: 'rgba(56, 189, 248, 0.28)',
		motif: 'beam',
	},
	DesktopAiChatApp: {
		glyph: SparklesIcon,
		primary: '#8b5cf6',
		secondary: '#38bdf8',
		tertiary: '#1e1b4b',
		glow: 'rgba(139, 92, 246, 0.32)',
		motif: 'orbit',
	},
	AssistantApp: {
		glyph: CpuChipIcon,
		primary: '#6366f1',
		secondary: '#818cf8',
		tertiary: '#1e1b4b',
		glow: 'rgba(99, 102, 241, 0.28)',
		motif: 'orbit',
	},
	FriendsApp: {
		glyph: UserGroupIcon,
		primary: '#22c55e',
		secondary: '#06b6d4',
		tertiary: '#052e16',
		glow: 'rgba(34, 197, 94, 0.28)',
		motif: 'chat',
	},
	SocialHubApp: {
		glyph: UserGroupIcon,
		primary: '#22c55e',
		secondary: '#06b6d4',
		tertiary: '#052e16',
		glow: 'rgba(34, 197, 94, 0.28)',
		motif: 'chat',
	},
	MusicGenerator: {
		glyph: MusicalNoteIcon,
		primary: '#8b5cf6',
		secondary: '#d946ef',
		tertiary: '#3b0764',
		glow: 'rgba(168, 85, 247, 0.3)',
		motif: 'wave',
	},
	MusicEvolutionApp: {
		glyph: SparklesIcon,
		primary: '#d946ef',
		secondary: '#f59e0b',
		tertiary: '#064e3b',
		glow: 'rgba(217, 70, 239, 0.32)',
		motif: 'wave',
	},
	MusicForgeApp: {
		glyph: MusicalNoteIcon,
		primary: '#f59e0b',
		secondary: '#d946ef',
		tertiary: '#020617',
		glow: 'rgba(245, 158, 11, 0.3)',
		motif: 'wave',
	},
	PoemmaApp: {
		glyph: BuildingStorefrontIcon,
		primary: '#059669',
		secondary: '#d97706',
		tertiary: '#292524',
		glow: 'rgba(5, 150, 105, 0.28)',
		motif: 'grid',
	},
	ProjectAboutApp: {
		glyph: PresentationChartBarIcon,
		primary: '#8b5cf6',
		secondary: '#22d3ee',
		tertiary: '#1e1b4b',
		glow: 'rgba(139, 92, 246, 0.3)',
		motif: 'orbit',
	},
	EmperyNexusChronicleApp: {
		glyph: SparklesIcon,
		primary: '#c9a227',
		secondary: '#7eb8c9',
		tertiary: '#0a1018',
		glow: 'rgba(201, 162, 39, 0.32)',
		motif: 'orbit',
	},
	MusicPlayer: {
		glyph: MusicalNoteIcon,
		primary: '#6366f1',
		secondary: '#8b5cf6',
		tertiary: '#312e81',
		glow: 'rgba(99, 102, 241, 0.28)',
		motif: 'wave',
	},
	NotificationsApp: {
		glyph: BellIcon,
		primary: '#6366f1',
		secondary: '#38bdf8',
		tertiary: '#1e1b4b',
		glow: 'rgba(99, 102, 241, 0.28)',
		motif: 'orbit',
	},
	DesktopWidgetShelfApp: {
		glyph: ClipboardDocumentListIcon,
		primary: '#f59e0b',
		secondary: '#f97316',
		tertiary: '#78350f',
		glow: 'rgba(245, 158, 11, 0.26)',
		motif: 'grid',
	},
	DesktopDashboardFavoritesApp: {
		glyph: StarIcon,
		primary: '#ec4899',
		secondary: '#f43f5e',
		tertiary: '#831843',
		glow: 'rgba(236, 72, 153, 0.26)',
		motif: 'orbit',
	},
	EWDeskApp: {
		glyph: NewspaperIcon,
		primary: '#38bdf8',
		secondary: '#6366f1',
		tertiary: '#0f172a',
		glow: 'rgba(56, 189, 248, 0.26)',
		motif: 'grid',
	},
	SurveyHubApp: {
		glyph: PresentationChartBarIcon,
		primary: '#6366f1',
		secondary: '#8b5cf6',
		tertiary: '#1e1b4b',
		glow: 'rgba(99, 102, 241, 0.28)',
		motif: 'beam',
	},
	ClipboardManager: {
		glyph: ClipboardIcon,
		primary: '#f59e0b',
		secondary: '#f97316',
		tertiary: '#431407',
		glow: 'rgba(249, 115, 22, 0.28)',
		motif: 'grid',
	},
	UserProfile: {
		glyph: UserIcon,
		primary: '#64748b',
		secondary: '#cbd5e1',
		tertiary: '#0f172a',
		glow: 'rgba(148, 163, 184, 0.22)',
		motif: 'orbit',
	},
	MarketingCabinet: {
		glyph: MegaphoneIcon,
		primary: '#f59e0b',
		secondary: '#f97316',
		tertiary: '#431407',
		glow: 'rgba(249, 115, 22, 0.28)',
		motif: 'beam',
	},
	EwaApp: {
		glyph: ClipboardDocumentListIcon,
		primary: '#6366f1',
		secondary: '#8b5cf6',
		tertiary: '#1e1b4b',
		glow: 'rgba(99, 102, 241, 0.3)',
		motif: 'orbit',
	},
	CustomerCabinet: {
		glyph: BriefcaseIcon,
		primary: '#0d9488',
		secondary: '#14b8a6',
		tertiary: '#042f2e',
		glow: 'rgba(20, 184, 166, 0.26)',
		motif: 'beam',
	},
	UserSiteStudio: {
		glyph: GlobeAltIcon,
		primary: '#0ea5e9',
		secondary: '#6366f1',
		tertiary: '#082f49',
		glow: 'rgba(14, 165, 233, 0.28)',
		motif: 'beam',
	},
	KirsCuration: {
		glyph: RectangleStackIcon,
		primary: '#7c3aed',
		secondary: '#4f46e5',
		tertiary: '#1e1b4b',
		glow: 'rgba(124, 58, 237, 0.28)',
		motif: 'beam',
	},
	KirsClientSite: {
		glyph: GlobeAltIcon,
		primary: '#64748b',
		secondary: '#52525b',
		tertiary: '#18181b',
		glow: 'rgba(100, 116, 139, 0.24)',
		motif: 'beam',
	},
	Presentations: {
		glyph: PresentationChartBarIcon,
		primary: '#06b6d4',
		secondary: '#14b8a6',
		tertiary: '#083344',
		glow: 'rgba(6, 182, 212, 0.28)',
		motif: 'beam',
	},
	PresentationsArchive: {
		glyph: PresentationChartBarIcon,
		primary: '#0891b2',
		secondary: '#2563eb',
		tertiary: '#082f49',
		glow: 'rgba(37, 99, 235, 0.28)',
		motif: 'bars',
	},
};

function getDesktopAppVisual(
	appComponent?: string | null
): DesktopAppVisualPreset {
	if (!appComponent) {
		return DEFAULT_APP_VISUAL;
	}
	return DESKTOP_APP_VISUALS[appComponent] ?? DEFAULT_APP_VISUAL;
}

function renderDesktopAppMotif(
	motif: DesktopAppMotif,
	visual: DesktopAppVisualPreset
) {
	const vk = `${visual.primary}|${visual.secondary}|${visual.tertiary}|${visual.glow}`;
	switch (motif) {
		case 'beam':
			return (
				<>
					<DesktopPaintedSpan
						className="absolute left-[18%] top-[14%] h-[18%] w-[54%] rounded-full opacity-90 blur-[2px]"
						depsKey={`beam-a-${vk}`}
						paint={(el) => {
							el.style.background = `linear-gradient(90deg, ${visual.secondary}, transparent)`;
						}}
					/>
					<DesktopPaintedSpan
						className="absolute right-[12%] bottom-[16%] h-[26%] w-[22%] rounded-full opacity-80 blur-sm"
						depsKey={`beam-b-${vk}`}
						paint={(el) => {
							el.style.background = visual.primary;
						}}
					/>
				</>
			);
		case 'wave':
			return (
				<>
					<DesktopPaintedSpan
						className="absolute left-[16%] right-[16%] top-[28%] h-[9%] rounded-full opacity-90"
						depsKey={`wave-1-${vk}`}
						paint={(el) => {
							el.style.background = `linear-gradient(90deg, transparent, ${visual.secondary}, transparent)`;
						}}
					/>
					<DesktopPaintedSpan
						className="absolute left-[22%] right-[22%] top-[42%] h-[9%] rounded-full opacity-80"
						depsKey={`wave-2-${vk}`}
						paint={(el) => {
							el.style.background = `linear-gradient(90deg, transparent, ${visual.primary}, transparent)`;
						}}
					/>
					<DesktopPaintedSpan
						className="absolute left-[28%] right-[28%] top-[56%] h-[9%] rounded-full opacity-70"
						depsKey={`wave-3-${vk}`}
						paint={(el) => {
							el.style.background = `linear-gradient(90deg, transparent, ${visual.secondary}, transparent)`;
						}}
					/>
				</>
			);
		case 'grid':
			return (
				<>
					{[
						{ left: '18%', top: '18%' },
						{ left: '58%', top: '18%' },
						{ left: '18%', top: '58%' },
						{ left: '58%', top: '58%' },
					].map((cell) => (
						<DesktopPaintedSpan
							key={`${cell.left}-${cell.top}`}
							className="absolute h-[14%] w-[14%] rounded-[35%] opacity-85"
							depsKey={`grid-${cell.left}-${cell.top}-${vk}`}
							paint={(el) => {
								el.style.left = cell.left;
								el.style.top = cell.top;
								el.style.background = `linear-gradient(145deg, ${visual.secondary}, ${visual.primary})`;
							}}
						/>
					))}
				</>
			);
		case 'orbit':
			return (
				<>
					<DesktopPaintedSpan
						className="absolute inset-[10%] rounded-full border opacity-50"
						depsKey={`orbit-a-${vk}`}
						paint={(el) => {
							el.style.borderColor = `${visual.secondary}80`;
						}}
					/>
					<DesktopPaintedSpan
						className="absolute right-[16%] top-[16%] h-[14%] w-[14%] rounded-full opacity-90"
						depsKey={`orbit-b-${vk}`}
						paint={(el) => {
							el.style.background = visual.secondary;
						}}
					/>
				</>
			);
		case 'chat':
			return (
				<>
					<DesktopPaintedSpan
						className="absolute left-[16%] top-[18%] h-[42%] w-[48%] rounded-[42%] opacity-70"
						depsKey={`chat-a-${vk}`}
						paint={(el) => {
							el.style.background = `${visual.secondary}2a`;
						}}
					/>
					<DesktopPaintedSpan
						className="absolute right-[18%] bottom-[18%] h-[26%] w-[28%] rounded-[42%] opacity-80"
						depsKey={`chat-b-${vk}`}
						paint={(el) => {
							el.style.background = `${visual.primary}38`;
						}}
					/>
				</>
			);
		case 'bars':
			return (
				<>
					{[22, 36, 50].map((left, index) => (
						<DesktopPaintedSpan
							key={left}
							className="absolute bottom-[18%] w-[10%] rounded-full opacity-90"
							depsKey={`bars-${left}-${index}-${vk}`}
							paint={(el) => {
								el.style.left = `${left}%`;
								el.style.height = `${24 + index * 12}%`;
								el.style.background = `linear-gradient(180deg, ${visual.secondary}, ${visual.primary})`;
							}}
						/>
					))}
				</>
			);
		case 'pulse':
			return (
				<>
					<DesktopPaintedSpan
						className="absolute inset-[16%] rounded-full border opacity-45"
						depsKey={`pulse-a-${vk}`}
						paint={(el) => {
							el.style.borderColor = `${visual.secondary}88`;
						}}
					/>
					<DesktopPaintedSpan
						className="absolute left-[22%] right-[22%] top-1/2 h-[10%] -translate-y-1/2 opacity-90"
						depsKey={`pulse-b-${vk}`}
						paint={(el) => {
							el.style.background = `linear-gradient(90deg, transparent 0%, ${visual.secondary} 18%, ${visual.primary} 48%, ${visual.secondary} 78%, transparent 100%)`;
							el.style.clipPath =
								'polygon(0 52%, 18% 52%, 32% 20%, 45% 86%, 58% 40%, 72% 40%, 100% 40%, 100% 60%, 70% 60%, 56% 60%, 44% 94%, 30% 30%, 20% 68%, 0 68%)';
						}}
					/>
				</>
			);
		default:
			return (
				<>
					<DesktopPaintedSpan
						className="absolute left-[20%] top-[16%] h-[16%] w-[16%] rotate-45 rounded-[35%] opacity-90"
						depsKey={`def-a-${vk}`}
						paint={(el) => {
							el.style.background = visual.secondary;
						}}
					/>
					<DesktopPaintedSpan
						className="absolute right-[14%] bottom-[18%] h-[20%] w-[20%] rounded-full opacity-75 blur-[1px]"
						depsKey={`def-b-${vk}`}
						paint={(el) => {
							el.style.background = visual.primary;
						}}
					/>
				</>
			);
	}
}

interface DesktopAppSymbolProps {
	appComponent?: string | null;
	fallback?: ReactNode;
	className?: string;
	iconClassName?: string;
	iconStyle?: DesktopIconStyle;
}

export function DesktopAppSymbol({
	appComponent,
	fallback,
	className = '',
	iconClassName = '',
	iconStyle = 'glass',
}: DesktopAppSymbolProps) {
	const visual = getDesktopAppVisual(appComponent);
	const Glyph = visual.glyph;
	const classicGlyph = fallback ?? (
		<Glyph
			className={`h-[74%] w-[74%] text-(--desktop-text-primary) drop-shadow-[0_6px_14px_rgba(15,23,42,0.42)] ${iconClassName}`}
			strokeWidth={DESKTOP_LUCIDE.stroke}
		/>
	);

	if (iconStyle === 'minimal') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center text-[rgb(var(--desktop-fg-primary-rgb)/0.95)] [&>svg]:h-[74%] [&>svg]:w-[74%]',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				{classicGlyph}
			</span>
		);
	}

	if (iconStyle === 'paper') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[10%] rounded-[30%] border-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_48%,transparent)] bg-[color-mix(in_srgb,var(--desktop-paper-cream-soft)_38%,rgb(var(--desktop-bg-primary-rgb))_62%)] shadow-[4px_4px_0_0_color-mix(in_srgb,var(--desktop-paper-ink)_12%,transparent)]"
				/>
				<Glyph
					className={cn(
						'relative z-1 h-[42%] w-[42%] text-(--desktop-paper-ink) drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]',
						iconClassName
					)}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'noir') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[12%] rounded-[32%] border border-(--desktop-chrome-noir-icon-border) [background-image:var(--desktop-chrome-noir-icon-app-bg)] shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-[22%] rounded-[28%] border border-[rgb(var(--desktop-fg-primary-rgb)/0.08)] bg-[linear-gradient(180deg,rgb(var(--desktop-fg-primary-rgb)/0.08)_0%,transparent_100%)] opacity-75"
				/>
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-[color:var(--desktop-chrome-noir-glyph-fg)] ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'framed') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[12%] rounded-[32%] border border-(--desktop-border-strong) bg-[linear-gradient(155deg,rgb(var(--desktop-bg-secondary-rgb)/0.94)_0%,rgb(var(--desktop-bg-primary-rgb)/0.9)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_26px_rgba(0,0,0,0.4)]"
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-[22%] rounded-[28%] border border-[rgb(var(--desktop-fg-primary-rgb)/0.1)] bg-[linear-gradient(180deg,rgb(var(--desktop-fg-primary-rgb)/0.1)_0%,transparent_100%)] opacity-85"
				/>
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-[rgb(var(--desktop-fg-primary-rgb)/0.94)] ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'neon') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[10%] rounded-[30%] border-2 border-[rgb(var(--desktop-accent-rgb)/0.72)] [background-image:var(--desktop-chrome-neon-icon-app-bg)] shadow-[0_0_0_1px_rgb(var(--desktop-fg-primary-rgb)/0.06),0_0_28px_-6px_rgb(var(--desktop-accent-rgb)/0.45)]"
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-[22%] rounded-[26%] border border-[rgb(var(--desktop-accent-rgb)/0.22)] opacity-80"
				/>
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-[color:var(--desktop-chrome-neon-glyph-fg)] drop-shadow-[0_0_12px_rgb(var(--desktop-accent-rgb)/0.4)] ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'aurora') {
		if (!appComponent && fallback) {
			return (
				<span
					className={cn(
						'relative flex h-full w-full items-center justify-center',
						DESKTOP_ICON_SVG_QUALITY,
						className
					)}
				>
					{fallback}
				</span>
			);
		}
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<DesktopPaintedSpan
					className="absolute inset-[12%] rounded-[32%] border-2 border-[rgba(168,85,247,0.45)] saturate-[0.88]"
					depsKey={`app-aurora-${visual.primary}-${visual.secondary}-${visual.tertiary}-${visual.glow}`}
					paint={(el) => {
						el.style.background = `radial-gradient(circle at 18% 10%, rgb(var(--desktop-accent-rgb) / 0.42), transparent 38%), radial-gradient(circle at 24% 14%, rgb(var(--desktop-fg-primary-rgb) / 0.26), transparent 32%), radial-gradient(circle at 82% 100%, ${visual.secondary}55, transparent 44%), linear-gradient(150deg, ${visual.primary} 0%, ${visual.secondary} 52%, ${visual.tertiary} 100%)`;
						el.style.boxShadow = `0 0 0 1px rgba(34, 211, 238, 0.22), 0 10px 28px rgba(168, 85, 247, 0.35), 0 12px 34px rgb(var(--desktop-accent-rgb) / 0.2), 0 10px 26px ${visual.glow}, 0 0 0 1px rgb(var(--desktop-fg-primary-rgb) / 0.06) inset`;
					}}
				/>
				<span
					aria-hidden="true"
					className="absolute inset-[22%] rounded-[28%] border border-[rgb(var(--desktop-accent-rgb)/0.28)] bg-[linear-gradient(180deg,rgb(var(--desktop-fg-primary-rgb)/0.16)_0%,rgb(var(--desktop-fg-primary-rgb)/0.02)_100%)] opacity-90"
				/>
				{renderDesktopAppMotif(visual.motif, visual)}
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-white drop-shadow-[0_8px_18px_rgba(15,23,42,0.45)] ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'chameleon') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className={cn(
						'absolute inset-[10%] rounded-[30%] overflow-hidden border border-(--desktop-border-strong) bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb))_0%,rgb(var(--desktop-bg-primary-rgb))_100%)] shadow-[0_12px_32px_rgba(0,0,0,0.28)]'
					)}
				/>
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-(--desktop-text-primary) drop-shadow-[0_8px_18px_rgba(15,23,42,0.25)] ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'prism') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[10%] flex items-center justify-center rounded-[28%] p-[2px] shadow-[0_0_28px_rgba(167,139,250,0.38)] [background:conic-gradient(from_210deg_at_50%_50%,#f472b6,#38bdf8,#a78bfa,#34d399,#f472b6)]"
				>
					<span className="block h-full w-full rounded-[26%] bg-[linear-gradient(165deg,rgb(12,10,24)_0%,rgb(4,6,18)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" />
				</span>
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-white drop-shadow-[0_2px_8px_rgba(56,189,248,0.45)] ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'mercury') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[11%] rounded-[34%] bg-[linear-gradient(138deg,#f4f4f5_0%,#9ca3af_42%,#e5e7eb_55%,#6b7280_88%,#f9fafb_100%)] shadow-[inset_0_3px_10px_rgba(255,255,255,0.85),inset_0_-6px_14px_rgba(0,0,0,0.35),0_14px_32px_rgba(0,0,0,0.55)]"
				/>
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-zinc-800 drop-shadow-[0_1px_0_rgba(255,255,255,0.7)] ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'vhs') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[10%] rounded-[28%] border border-fuchsia-500/35 bg-[linear-gradient(180deg,#1e0530_0%,#0f172a_55%,#020617_100%)] shadow-[3px_0_10px_rgba(34,211,238,0.35),-3px_0_10px_rgba(236,72,153,0.35),0_12px_28px_rgba(0,0,0,0.65)]"
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-[18%] rounded-[24%] bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.07)_2px,rgba(255,255,255,0.07)_3px)] opacity-[0.14]"
				/>
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-cyan-100 drop-shadow-[2px_0_0_rgba(236,72,153,0.45)] ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'slate') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[11%] rounded-[26%] border border-[rgba(148,163,184,0.4)] bg-[linear-gradient(180deg,rgb(71,85,105)_0%,rgb(30,41,59)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_22px_rgba(0,0,0,0.4)]"
				/>
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-slate-100 ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'clay') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[11%] rounded-[30%] border border-[rgba(196,140,100,0.42)] bg-[linear-gradient(168deg,rgb(120,78,54)_0%,rgb(64,40,30)_100%)] shadow-[inset_0_1px_0_rgba(255,220,190,0.14),0_10px_22px_rgba(0,0,0,0.42)]"
				/>
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-[rgb(255,236,214)] ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'ember') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[11%] rounded-[28%] border border-[rgba(245,158,11,0.4)] bg-[linear-gradient(168deg,rgb(36,20,12)_0%,rgb(12,8,6)_100%)] shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_10px_24px_rgba(0,0,0,0.5)]"
				/>
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-amber-100 ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'premium') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[10%] rounded-[30%] border border-[rgba(212,175,106,0.32)] [background-image:var(--desktop-chrome-premium-icon-app-bg)] shadow-[0_0_0_1px_rgb(var(--desktop-fg-primary-rgb)/0.06),0_12px_28px_rgba(15,23,42,0.12)]"
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-[22%] rounded-[26%] border border-[rgba(212,175,106,0.2)] opacity-80"
				/>
				<Glyph
					className={`relative z-1 h-[42%] w-[42%] text-[color:var(--desktop-chrome-premium-glyph-fg)] drop-shadow-[0_1px_0_rgba(255,255,255,0.35)] ${iconClassName}`}
					strokeWidth={DESKTOP_LUCIDE.stroke}
				/>
			</span>
		);
	}

	if (!appComponent && fallback) {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				{fallback}
			</span>
		);
	}

	return (
		<span
			className={cn(
				'relative flex h-full w-full items-center justify-center',
				DESKTOP_ICON_SVG_QUALITY,
				className
			)}
		>
			<DesktopPaintedSpan
				className="absolute inset-[12%] rounded-[32%] border border-(--glass-border) saturate-[0.72]"
				depsKey={`app-glass-${visual.primary}-${visual.secondary}-${visual.tertiary}-${visual.glow}`}
				paint={(el) => {
					el.style.background = `radial-gradient(circle at 28% 18%, rgb(var(--desktop-fg-primary-rgb) / 0.26), transparent 34%), linear-gradient(150deg, ${visual.primary} 0%, ${visual.secondary} 56%, ${visual.tertiary} 100%)`;
					el.style.boxShadow = `0 10px 24px rgba(0,0,0,0.28), 0 10px 26px ${visual.glow}`;
				}}
			/>
			<span
				aria-hidden="true"
				className="absolute inset-[22%] rounded-[28%] border border-(--desktop-border-subtle) bg-[linear-gradient(180deg,rgb(var(--desktop-fg-primary-rgb)/0.18)_0%,rgb(var(--desktop-fg-primary-rgb)/0.02)_100%)] opacity-90"
			/>
			{renderDesktopAppMotif(visual.motif, visual)}
			<Glyph
				className={`relative z-1 h-[42%] w-[42%] text-white drop-shadow-[0_8px_18px_rgba(15,23,42,0.45)] ${iconClassName}`}
				strokeWidth={DESKTOP_LUCIDE.stroke}
			/>
		</span>
	);
}

export interface DesktopFolderSymbolProps {
	iconStyle?: DesktopIconStyle;
	isProjectFolder?: boolean;
	/** System folder key from desktop API (``ewa_file`` → companion workspace glyph). */
	systemKey?: string;
	className?: string;
}

/**
 * Desktop folder glyph aligned with {@link DesktopAppSymbol} presets (window-style vocabulary).
 */
export function DesktopFolderSymbol({
	iconStyle = 'glass',
	isProjectFolder = false,
	systemKey,
	className = '',
}: DesktopFolderSymbolProps) {
	if (systemKey === 'ewa_file') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<DesktopPaintedSpan
					className="absolute inset-[10%] rounded-[32%] border border-fuchsia-300/40 saturate-[1.05]"
					depsKey="folder-ewa-file"
					paint={(el) => {
						el.style.background =
							'radial-gradient(circle at 22% 18%, rgb(var(--desktop-accent-rgb) / 0.45), transparent 42%), linear-gradient(145deg, #7c3aed 0%, #a855f7 45%, #22d3ee 100%)';
						el.style.boxShadow =
							'0 10px 28px rgba(168, 85, 247, 0.42), 0 0 0 1px rgba(34, 211, 238, 0.18) inset';
					}}
				/>
				<SparklesIcon
					className="absolute top-[18%] right-[20%] z-2 h-[22%] w-[22%] text-cyan-200/90 drop-shadow-[0_0_6px_rgba(34,211,238,0.55)]"
					strokeWidth={2}
					aria-hidden
				/>
				<FolderIcon
					className="relative z-1 h-[58%] w-[58%] text-white drop-shadow-[0_8px_18px_rgba(88,28,135,0.55)]"
					strokeWidth={DESKTOP_LUCIDE.strokeStrong}
				/>
			</span>
		);
	}

	const visual = FOLDER_TILE_VISUAL;
	const stroke = isProjectFolder
		? DESKTOP_LUCIDE.strokeStrong
		: DESKTOP_LUCIDE.stroke;
	const projectTint =
		isProjectFolder && 'text-[rgb(var(--desktop-accent-rgb))]';

	if (iconStyle === 'minimal') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<FolderIcon
					className={cn(
						'h-[74%] w-[74%] text-(--desktop-text-primary)',
						'drop-shadow-[0_8px_18px_rgb(var(--desktop-fg-primary-rgb)/0.22)]',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'paper') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[10%] rounded-[30%] border-2 border-[color-mix(in_srgb,var(--desktop-paper-edge)_48%,transparent)] bg-[color-mix(in_srgb,var(--desktop-paper-cream-soft)_38%,rgb(var(--desktop-bg-primary-rgb))_62%)] shadow-[4px_4px_0_0_color-mix(in_srgb,var(--desktop-paper-ink)_12%,transparent)]"
				/>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-(--desktop-paper-ink) drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'noir') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[12%] rounded-[32%] border border-(--desktop-chrome-noir-icon-border) [background-image:var(--desktop-chrome-noir-icon-app-bg)] shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-[22%] rounded-[28%] border border-[rgb(var(--desktop-fg-primary-rgb)/0.08)] bg-[linear-gradient(180deg,rgb(var(--desktop-fg-primary-rgb)/0.08)_0%,transparent_100%)] opacity-75"
				/>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-[color:var(--desktop-chrome-noir-glyph-fg)]',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'framed') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[12%] rounded-[32%] border border-(--desktop-border-strong) bg-[linear-gradient(155deg,rgb(var(--desktop-bg-secondary-rgb)/0.94)_0%,rgb(var(--desktop-bg-primary-rgb)/0.9)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_26px_rgba(0,0,0,0.4)]"
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-[22%] rounded-[28%] border border-[rgb(var(--desktop-fg-primary-rgb)/0.1)] bg-[linear-gradient(180deg,rgb(var(--desktop-fg-primary-rgb)/0.1)_0%,transparent_100%)] opacity-85"
				/>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-[rgb(var(--desktop-fg-primary-rgb)/0.94)]',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'neon') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[10%] rounded-[30%] border-2 border-[rgb(var(--desktop-accent-rgb)/0.72)] [background-image:var(--desktop-chrome-neon-icon-app-bg)] shadow-[0_0_0_1px_rgb(var(--desktop-fg-primary-rgb)/0.06),0_0_28px_-6px_rgb(var(--desktop-accent-rgb)/0.45)]"
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-[22%] rounded-[26%] border border-[rgb(var(--desktop-accent-rgb)/0.22)] opacity-80"
				/>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-[color:var(--desktop-chrome-neon-glyph-fg)] drop-shadow-[0_0_12px_rgb(var(--desktop-accent-rgb)/0.4)]',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'aurora') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<DesktopPaintedSpan
					className="absolute inset-[12%] rounded-[32%] border-2 border-[rgba(168,85,247,0.45)] saturate-[0.88]"
					depsKey={`folder-aurora-${visual.primary}-${visual.secondary}-${visual.tertiary}-${visual.glow}`}
					paint={(el) => {
						el.style.background = `radial-gradient(circle at 18% 10%, rgb(var(--desktop-accent-rgb) / 0.42), transparent 38%), radial-gradient(circle at 24% 14%, rgb(var(--desktop-fg-primary-rgb) / 0.26), transparent 32%), radial-gradient(circle at 82% 100%, ${visual.secondary}55, transparent 44%), linear-gradient(150deg, ${visual.primary} 0%, ${visual.secondary} 52%, ${visual.tertiary} 100%)`;
						el.style.boxShadow = `0 0 0 1px rgba(34, 211, 238, 0.22), 0 10px 28px rgba(168, 85, 247, 0.35), 0 12px 34px rgb(var(--desktop-accent-rgb) / 0.2), 0 10px 26px ${visual.glow}, 0 0 0 1px rgb(var(--desktop-fg-primary-rgb) / 0.06) inset`;
					}}
				/>
				<span
					aria-hidden="true"
					className="absolute inset-[22%] rounded-[28%] border border-[rgb(var(--desktop-accent-rgb)/0.28)] bg-[linear-gradient(180deg,rgb(var(--desktop-fg-primary-rgb)/0.16)_0%,rgb(var(--desktop-fg-primary-rgb)/0.02)_100%)] opacity-90"
				/>
				{renderDesktopAppMotif(visual.motif, visual)}
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] drop-shadow-[0_8px_18px_rgba(15,23,42,0.45)]',
						isProjectFolder
							? 'text-[rgb(var(--desktop-accent-rgb))]'
							: 'text-white'
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'chameleon') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[10%] rounded-[30%] overflow-hidden border border-(--desktop-border-strong) bg-[linear-gradient(180deg,rgb(var(--desktop-bg-secondary-rgb))_0%,rgb(var(--desktop-bg-primary-rgb))_100%)] shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
				/>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-(--desktop-text-primary) drop-shadow-[0_8px_18px_rgba(15,23,42,0.25)]',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'prism') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[10%] flex items-center justify-center rounded-[28%] p-[2px] shadow-[0_0_28px_rgba(167,139,250,0.38)] [background:conic-gradient(from_210deg_at_50%_50%,#f472b6,#38bdf8,#a78bfa,#34d399,#f472b6)]"
				>
					<span className="block h-full w-full rounded-[26%] bg-[linear-gradient(165deg,rgb(12,10,24)_0%,rgb(4,6,18)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" />
				</span>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-white drop-shadow-[0_2px_8px_rgba(56,189,248,0.45)]',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'mercury') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[11%] rounded-[34%] bg-[linear-gradient(138deg,#f4f4f5_0%,#9ca3af_42%,#e5e7eb_55%,#6b7280_88%,#f9fafb_100%)] shadow-[inset_0_3px_10px_rgba(255,255,255,0.85),inset_0_-6px_14px_rgba(0,0,0,0.35),0_14px_32px_rgba(0,0,0,0.55)]"
				/>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-zinc-800 drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'vhs') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[10%] rounded-[28%] border border-fuchsia-500/35 bg-[linear-gradient(180deg,#1e0530_0%,#0f172a_55%,#020617_100%)] shadow-[3px_0_10px_rgba(34,211,238,0.35),-3px_0_10px_rgba(236,72,153,0.35),0_12px_28px_rgba(0,0,0,0.65)]"
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-[18%] rounded-[24%] bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.07)_2px,rgba(255,255,255,0.07)_3px)] opacity-[0.14]"
				/>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-cyan-100 drop-shadow-[2px_0_0_rgba(236,72,153,0.45)]',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'slate') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[11%] rounded-[26%] border border-[rgba(148,163,184,0.4)] bg-[linear-gradient(180deg,rgb(71,85,105)_0%,rgb(30,41,59)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_22px_rgba(0,0,0,0.4)]"
				/>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-slate-100',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'clay') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[11%] rounded-[30%] border border-[rgba(196,140,100,0.42)] bg-[linear-gradient(168deg,rgb(120,78,54)_0%,rgb(64,40,30)_100%)] shadow-[inset_0_1px_0_rgba(255,220,190,0.14),0_10px_22px_rgba(0,0,0,0.42)]"
				/>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-[rgb(255,236,214)]',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'ember') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[11%] rounded-[28%] border border-[rgba(245,158,11,0.4)] bg-[linear-gradient(168deg,rgb(36,20,12)_0%,rgb(12,8,6)_100%)] shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_10px_24px_rgba(0,0,0,0.5)]"
				/>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-amber-100',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	if (iconStyle === 'premium') {
		return (
			<span
				className={cn(
					'relative flex h-full w-full items-center justify-center',
					DESKTOP_ICON_SVG_QUALITY,
					className
				)}
			>
				<span
					aria-hidden="true"
					className="absolute inset-[10%] rounded-[30%] border border-[rgba(212,175,106,0.32)] [background-image:var(--desktop-chrome-premium-icon-app-bg)] shadow-[0_0_0_1px_rgb(var(--desktop-fg-primary-rgb)/0.06),0_12px_28px_rgba(15,23,42,0.12)]"
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-[22%] rounded-[26%] border border-[rgba(212,175,106,0.2)] opacity-80"
				/>
				<FolderIcon
					className={cn(
						'relative z-1 h-[58%] w-[58%] text-[color:var(--desktop-chrome-premium-glyph-fg)] drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]',
						projectTint
					)}
					strokeWidth={stroke}
				/>
			</span>
		);
	}

	return (
		<span
			className={cn(
				'relative flex h-full w-full items-center justify-center',
				DESKTOP_ICON_SVG_QUALITY,
				className
			)}
		>
			<DesktopPaintedSpan
				className="absolute inset-[12%] rounded-[32%] border border-(--glass-border) saturate-[0.72]"
				depsKey={`folder-glass-${visual.primary}-${visual.secondary}-${visual.tertiary}-${visual.glow}`}
				paint={(el) => {
					el.style.background = `radial-gradient(circle at 28% 18%, rgb(var(--desktop-fg-primary-rgb) / 0.26), transparent 34%), linear-gradient(150deg, ${visual.primary} 0%, ${visual.secondary} 56%, ${visual.tertiary} 100%)`;
					el.style.boxShadow = `0 10px 24px rgba(0,0,0,0.28), 0 10px 26px ${visual.glow}`;
				}}
			/>
			<span
				aria-hidden="true"
				className="absolute inset-[22%] rounded-[28%] border border-(--desktop-border-subtle) bg-[linear-gradient(180deg,rgb(var(--desktop-fg-primary-rgb)/0.18)_0%,rgb(var(--desktop-fg-primary-rgb)/0.02)_100%)] opacity-90"
			/>
			{renderDesktopAppMotif(visual.motif, visual)}
			<FolderIcon
				className={cn(
					'relative z-1 h-[58%] w-[58%] drop-shadow-[0_8px_18px_rgba(15,23,42,0.45)]',
					isProjectFolder
						? 'text-[rgb(var(--desktop-accent-rgb))]'
						: 'text-white'
				)}
				strokeWidth={stroke}
			/>
		</span>
	);
}

export function getDesktopAppIconNode(
	appComponent?: string | null,
	fallback?: ReactNode
): ReactNode {
	const visual = getDesktopAppVisual(appComponent);
	const Glyph = visual.glyph;
	return (
		fallback ?? (
			<Glyph
				className="w-full h-full text-(--desktop-text-secondary)"
				strokeWidth={DESKTOP_LUCIDE.stroke}
			/>
		)
	);
}

type DesktopAppBadgeVariant =
	| 'start'
	| 'panel'
	| 'taskbar'
	| 'preview'
	| 'list';

const DESKTOP_APP_BADGE_VARIANTS: Record<
	DesktopAppBadgeVariant,
	{ shell: string; inner: string; style: CSSProperties }
> = {
	start: {
		shell:
			'relative isolate inline-flex items-center justify-center overflow-hidden rounded-[1.05rem] border border-(--desktop-border-subtle) shadow-[0_20px_44px_rgba(0,0,0,0.36)]',
		inner: 'relative z-1 h-[78%] w-[78%]',
		style: {
			background:
				'linear-gradient(180deg, rgb(var(--desktop-bg-secondary-rgb)) 0%, rgb(var(--desktop-bg-primary-rgb)) 100%)',
		},
	},
	panel: {
		shell:
			'relative isolate inline-flex items-center justify-center overflow-hidden rounded-[1rem] border border-(--desktop-border-subtle) shadow-[0_16px_34px_rgba(0,0,0,0.3)]',
		inner: 'relative z-1 h-[76%] w-[76%]',
		style: {
			background:
				'linear-gradient(180deg, rgb(var(--desktop-bg-secondary-rgb)) 0%, rgb(var(--desktop-bg-primary-rgb)) 100%)',
		},
	},
	taskbar: {
		shell:
			'relative isolate inline-flex items-center justify-center overflow-hidden rounded-[0.85rem] border border-(--desktop-border-subtle) shadow-[0_4px_14px_rgba(15,23,42,0.14)]',
		inner: 'relative z-1 h-[78%] w-[78%]',
		style: {
			background: 'rgb(var(--desktop-bg-secondary-rgb))',
		},
	},
	preview: {
		shell:
			'relative isolate inline-flex items-center justify-center overflow-hidden rounded-xl border border-(--desktop-border-subtle) shadow-[0_8px_18px_rgba(15,23,42,0.18)]',
		inner: 'relative z-1 h-[78%] w-[78%]',
		style: {
			background: 'rgb(var(--desktop-bg-secondary-rgb))',
		},
	},
	list: {
		shell:
			'relative isolate inline-flex items-center justify-center overflow-hidden rounded-lg border border-(--desktop-border-subtle) shadow-[0_6px_14px_rgba(15,23,42,0.14)]',
		inner: 'relative z-1 h-[78%] w-[78%]',
		style: {
			background: 'rgb(var(--desktop-bg-secondary-rgb))',
		},
	},
};

interface DesktopAppBadgeProps {
	appComponent?: string | null;
	icon?: ReactNode;
	variant?: DesktopAppBadgeVariant;
	className?: string;
	iconStyle?: DesktopIconStyle;
}

/** Motion timings shared by workspace shell; keep context menus and grid enter transitions aligned. */
export const DESKTOP_WORKSPACE_MOTION = {
	/** Taskbar-adjacent / cursor-anchored menus */
	popover: {
		duration: 0.12,
		ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
	},
	/** Icon grid item appearance (see DesktopIconLayer transition) */
	iconGrid: { duration: 0.18 },
	/** Press/drag feedback on icons (DesktopIcon motion) */
	iconDrag: { duration: 0.18 },
	/** Wallpaper / solid background crossfade on workspace root */
	/** Slightly longer crossfade for wallpaper/theme changes on `#desktop-main` (still cheap: background only). */
	backgroundCrossfadeSec: 0.5,
} as const;

export function DesktopAppBadge({
	appComponent,
	icon,
	variant = 'panel',
	className = '',
	iconStyle = 'glass',
}: DesktopAppBadgeProps) {
	const badge = DESKTOP_APP_BADGE_VARIANTS[variant];
	const isMinimal = iconStyle === 'minimal';
	const shellClassName = isMinimal
		? `${badge.shell} bg-[color-mix(in_srgb,var(--glass-bg)_70%,transparent_30%)] shadow-[0_8px_18px_rgba(15,23,42,0.18)]`
		: 'relative inline-flex items-center justify-center';
	const symbolClassName = isMinimal
		? 'relative z-1 h-[74%] w-[74%]'
		: badge.inner;

	return (
		<span className={`${shellClassName} ${className}`}>
			<span className={cn(symbolClassName, DESKTOP_ICON_SVG_QUALITY)}>
				<DesktopAppSymbol
					appComponent={appComponent}
					fallback={icon}
					iconStyle={iconStyle}
				/>
			</span>
		</span>
	);
}
