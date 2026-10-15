/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Curated desktop look presets (theme, accent, shell chrome, icon pack, bundled wallpaper).
 * Display names/blurbs live in `desktopUi.curatedStylePreset.sets.*` (RU/EN).
 *
 * Invariants:
 * - `id` values stay stable (exports / apply paths may key on them).
 * - Combinations are intentional: window/taskbar/icon/widgets may differ; no CSS animation on icon packs.
 *
 * Related:
 * - `desktopSettingsPreviewComponents.tsx` (`CuratedStylePresetsRow`)
 * - `useDesktopWorkspaceShellSettingsIntegration.ts`
 * - `documentation/product/desktop/DESKTOP-SETTINGS-CENTER-AND-EXPANSION-DESIGN.md`
 */

import type { AccentColorId } from '../context/DesktopStateContext';
import type {
	DesktopFontBodyId,
	DesktopFontDisplayId,
	DesktopIconStyle,
	DesktopSceneDepth,
	DesktopWindowStyle,
} from '@/types/profile';

export type DesktopThemeModeForPreset = 'dark' | 'light' | 'auto';

export type DesktopCuratedStyleSet = {
	id: string;
	/** CSS overlay for mini-preview (blend over wallpaper thumb). */
	preview: string;
	/** Builtin wallpaper index 1…N (`/desktop-wallpapers/{n}.webp`). */
	wallpaperIndex: number;
	theme: DesktopThemeModeForPreset;
	accentFollows: boolean;
	accent: AccentColorId;
	windowStyle: DesktopWindowStyle;
	taskbarStyle?: DesktopWindowStyle;
	iconStyle?: DesktopIconStyle;
	widgetsStyle?: DesktopWindowStyle;
	fontBody?: DesktopFontBodyId;
	fontDisplay?: DesktopFontDisplayId;
	sceneDepth?: DesktopSceneDepth;
	wallpaperCrossfadeEnabled?: boolean;
	styledTooltips?: boolean;
};

/**
 * Empery World curated looks — ids stable; names/blurbs via i18n `curatedStylePreset.sets.<id>`.
 */
export const DESKTOP_CURATED_STYLE_SETS: DesktopCuratedStyleSet[] = [
	{
		id: 'velvet-midnight',
		preview: 'linear-gradient(142deg,#05040a 0%,#1a0f28 48%,#0a0614 100%)',
		wallpaperIndex: 4,
		theme: 'dark',
		accentFollows: false,
		accent: 'purple',
		windowStyle: 'noir',
		taskbarStyle: 'noir',
		iconStyle: 'ember',
		widgetsStyle: 'noir',
		fontBody: 'raleway',
		fontDisplay: 'cinzel',
		sceneDepth: 'immersive',
	},
	{
		id: 'neon-lab',
		preview:
			'linear-gradient(122deg,#020617 0%,#0b1c2e 50%,rgba(34,211,238,0.28) 100%)',
		wallpaperIndex: 11,
		theme: 'dark',
		accentFollows: false,
		accent: 'cyan',
		windowStyle: 'neon',
		taskbarStyle: 'neon',
		iconStyle: 'slate',
		widgetsStyle: 'neon',
		fontBody: 'poppins',
		sceneDepth: 'balanced',
	},
	{
		id: 'aurora-dream',
		preview:
			'linear-gradient(158deg,#0c0620 0%,#312e81 40%,rgba(56,189,248,0.2) 92%)',
		wallpaperIndex: 17,
		theme: 'dark',
		accentFollows: false,
		accent: 'purple',
		windowStyle: 'aurora',
		taskbarStyle: 'aurora',
		iconStyle: 'prism',
		widgetsStyle: 'aurora',
		fontBody: 'manrope',
		fontDisplay: 'playfair',
		sceneDepth: 'immersive',
	},
	{
		id: 'pastel-chameleon',
		preview: 'linear-gradient(185deg,#eef2ff 0%,#fce7f3 50%,#ecfccb 100%)',
		wallpaperIndex: 22,
		theme: 'light',
		accentFollows: false,
		accent: 'pink',
		windowStyle: 'chameleon',
		taskbarStyle: 'chameleon',
		iconStyle: 'glass',
		widgetsStyle: 'chameleon',
		fontBody: 'poppins',
		sceneDepth: 'soft',
	},
	{
		id: 'paper-studio',
		preview: 'linear-gradient(172deg,#fffaf0 0%,#fde68a40 42%,#ea580020 100%)',
		wallpaperIndex: 24,
		theme: 'light',
		accentFollows: false,
		accent: 'orange',
		windowStyle: 'paper',
		taskbarStyle: 'paper',
		iconStyle: 'clay',
		widgetsStyle: 'paper',
		fontBody: 'raleway',
		fontDisplay: 'cormorant',
		sceneDepth: 'soft',
	},
	{
		id: 'glass-daylight',
		preview:
			'linear-gradient(188deg,rgba(248,250,252,0.98) 0%,rgba(203,213,225,0.9) 100%)',
		wallpaperIndex: 19,
		theme: 'light',
		accentFollows: false,
		accent: 'steel',
		windowStyle: 'glass',
		taskbarStyle: 'glass',
		iconStyle: 'mercury',
		widgetsStyle: 'glass',
		fontBody: 'manrope',
		sceneDepth: 'soft',
		wallpaperCrossfadeEnabled: true,
	},
	{
		id: 'gold-lounge',
		preview:
			'linear-gradient(150deg,#120e18 0%,#2a2438 52%,rgba(212,175,106,0.28) 100%)',
		wallpaperIndex: 9,
		theme: 'dark',
		accentFollows: false,
		accent: 'orange',
		windowStyle: 'premium',
		taskbarStyle: 'premium',
		iconStyle: 'ember',
		widgetsStyle: 'premium',
		fontBody: 'montserrat',
		fontDisplay: 'cinzel',
		sceneDepth: 'immersive',
	},
	{
		id: 'blueprint-frame',
		preview: 'linear-gradient(180deg,#06080f 0%,#101a32 100%)',
		wallpaperIndex: 14,
		theme: 'dark',
		accentFollows: false,
		accent: 'blue',
		windowStyle: 'framed',
		taskbarStyle: 'framed',
		iconStyle: 'slate',
		widgetsStyle: 'framed',
		fontBody: 'manrope',
		sceneDepth: 'balanced',
	},
	{
		id: 'ink-quiet',
		preview: 'linear-gradient(170deg,#030712 0%,#111827 50%,#020617 100%)',
		wallpaperIndex: 1,
		theme: 'dark',
		accentFollows: false,
		accent: 'charcoal',
		windowStyle: 'minimal',
		taskbarStyle: 'minimal',
		iconStyle: 'slate',
		widgetsStyle: 'minimal',
		fontBody: 'raleway',
		sceneDepth: 'balanced',
		styledTooltips: true,
	},
	{
		id: 'mist-focus',
		preview: 'linear-gradient(192deg,#f8fafc 0%,#e2e8f0 55%,#cbd5e1 100%)',
		wallpaperIndex: 3,
		theme: 'light',
		accentFollows: false,
		accent: 'steel',
		windowStyle: 'minimal',
		taskbarStyle: 'glass',
		iconStyle: 'mercury',
		widgetsStyle: 'minimal',
		fontBody: 'manrope',
		sceneDepth: 'soft',
	},
	{
		id: 'pine-console',
		preview: 'linear-gradient(144deg,#022c22 0%,#065f46 50%,#022c22 100%)',
		wallpaperIndex: 8,
		theme: 'dark',
		accentFollows: false,
		accent: 'green',
		windowStyle: 'noir',
		taskbarStyle: 'framed',
		iconStyle: 'clay',
		widgetsStyle: 'noir',
		fontBody: 'raleway',
		fontDisplay: 'cinzel',
		sceneDepth: 'immersive',
	},
	{
		id: 'coral-flux',
		preview: 'linear-gradient(176deg,#fff7ed 0%,#fed7aa 44%,#fecaca 100%)',
		wallpaperIndex: 16,
		theme: 'light',
		accentFollows: false,
		accent: 'orange',
		windowStyle: 'framed',
		taskbarStyle: 'paper',
		iconStyle: 'clay',
		widgetsStyle: 'framed',
		fontBody: 'poppins',
		sceneDepth: 'soft',
	},
	{
		id: 'slate-grid',
		preview: 'linear-gradient(162deg,#0a0a0c 0%,#1e293b 48%,#0f172a 100%)',
		wallpaperIndex: 23,
		theme: 'dark',
		accentFollows: false,
		accent: 'cyan',
		windowStyle: 'minimal',
		taskbarStyle: 'noir',
		iconStyle: 'slate',
		widgetsStyle: 'minimal',
		fontBody: 'manrope',
		sceneDepth: 'balanced',
	},
	{
		id: 'rose-atelier',
		preview: 'linear-gradient(174deg,#fdf2f8 0%,#fbcfe8 46%,#fce7f3 100%)',
		wallpaperIndex: 27,
		theme: 'light',
		accentFollows: false,
		accent: 'pink',
		windowStyle: 'paper',
		taskbarStyle: 'glass',
		iconStyle: 'clay',
		widgetsStyle: 'paper',
		fontBody: 'raleway',
		fontDisplay: 'cormorant',
		sceneDepth: 'soft',
	},
];
