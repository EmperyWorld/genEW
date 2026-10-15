import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type RefObject,
} from 'react';
import {
	APP_THEME_PRESET_DARK,
	APP_THEME_PRESET_LIGHT,
} from '../../../hooks/useAppState';
import {
	type AccentColorId,
	type DesktopState,
} from '../context/DesktopStateContext';
import { ACCENT_COLORS } from '../constants';
import type { DesktopCuratedStyleSet } from '../constants/desktopCuratedStyleSets';
import { builtinDesktopWallpaperPath } from '../constants/wallpapers';
import { nextExplicitThemeAfterToggle } from '../utils/desktopThemeToggle';
import {
	parseDesktopAccentFromApi,
	rgbSpaceStringToHex,
} from '../utils/desktopAccentColor';
import { getDesktopThemeVars } from '../utils/desktopUi';
import type { UseDesktopStorageReturn } from './useDesktopStorage';

export function useDesktopWorkspaceThemeAccent(params: {
	config: UseDesktopStorageReturn['config'];
	updateConfig: UseDesktopStorageReturn['updateConfig'];
	/** While true (`ref.current`), theme/accent/wallpaper skip remote PATCH. */
	deferConfigPersistRef?: RefObject<boolean>;
	state: Pick<
		DesktopState,
		'theme' | 'accent' | 'accentCustomHex' | 'wallpaper'
	>;
	actions: Pick<
		{
			setTheme: (v: DesktopState['theme']) => void;
			setAccent: (v: AccentColorId) => void;
			setAccentCustomHex: (v: string) => void;
			setWallpaper: (v: string) => void;
		},
		'setTheme' | 'setAccent' | 'setAccentCustomHex' | 'setWallpaper'
	>;
}) {
	const { config, deferConfigPersistRef, updateConfig, state, actions } =
		params;

	const persistRemoteCfg = useCallback(
		() => deferConfigPersistRef?.current !== true,
		[deferConfigPersistRef]
	);

	const theme = config?.theme ?? state.theme;
	const setTheme = useCallback(
		(value: 'dark' | 'light' | 'auto') => {
			actions.setTheme(value);
			void updateConfig(
				{ theme: value },
				{ persistRemote: persistRemoteCfg() }
			).catch(() => {});
		},
		[actions, persistRemoteCfg, updateConfig]
	);

	const accent = state.accent;
	const accentCustomHex = state.accentCustomHex;

	const [mediaDark, setMediaDark] = useState(() =>
		typeof window !== 'undefined'
			? window.matchMedia('(prefers-color-scheme: dark)').matches
			: false
	);
	useEffect(() => {
		if (theme !== 'auto') return;
		const m = window.matchMedia('(prefers-color-scheme: dark)');
		const on = () => setMediaDark(m.matches);
		m.addEventListener('change', on);
		return () => m.removeEventListener('change', on);
	}, [theme]);
	const effectiveTheme =
		theme === 'auto' ? (mediaDark ? 'dark' : 'light') : theme;
	const desktopEmbeddedAppTheme = useMemo(
		() =>
			effectiveTheme === 'dark'
				? APP_THEME_PRESET_DARK
				: APP_THEME_PRESET_LIGHT,
		[effectiveTheme]
	);
	const desktopThemeVars = useMemo(
		() => getDesktopThemeVars(effectiveTheme),
		[effectiveTheme]
	);

	const setAccentChoice = useCallback(
		(value: AccentColorId) => {
			if (value === 'custom') {
				const seed =
					accent !== 'custom'
						? rgbSpaceStringToHex(
								ACCENT_COLORS.find((c) => c.id === accent)?.rgb ?? '168 85 247'
							)
						: accentCustomHex;
				actions.setAccentCustomHex(seed);
				actions.setAccent('custom');
				void updateConfig(
					{ accent: seed },
					{ persistRemote: persistRemoteCfg() }
				).catch(() => {});
				return;
			}
			actions.setAccent(value);
			void updateConfig(
				{ accent: value },
				{ persistRemote: persistRemoteCfg() }
			).catch(() => {});
		},
		[accent, accentCustomHex, actions, persistRemoteCfg, updateConfig]
	);

	const onAccentCustomHexChange = useCallback(
		(nextHex: string) => {
			actions.setAccentCustomHex(nextHex);
			void updateConfig(
				{ accent: nextHex },
				{ persistRemote: persistRemoteCfg() }
			).catch(() => {});
		},
		[actions, persistRemoteCfg, updateConfig]
	);

	const toggleExplicitTheme = useCallback(() => {
		setTheme(nextExplicitThemeAfterToggle(theme, effectiveTheme));
	}, [effectiveTheme, setTheme, theme]);

	/** Один PATCH конфига для готового образа (без параллельных updateConfig). */
	const applyCuratedDesktopConfigPreset = useCallback(
		(set: DesktopCuratedStyleSet) => {
			const wallpaperPath = builtinDesktopWallpaperPath(set.wallpaperIndex);
			actions.setTheme(set.theme);
			actions.setWallpaper(wallpaperPath);

			const patch: Parameters<typeof updateConfig>[0] = {
				theme: set.theme,
				wallpaper: wallpaperPath,
			};

			if (!set.accentFollows) {
				if (set.accent === 'custom') {
					const seed =
						accent !== 'custom'
							? rgbSpaceStringToHex(
									ACCENT_COLORS.find((c) => c.id === accent)?.rgb ??
										'168 85 247'
								)
							: accentCustomHex;
					actions.setAccentCustomHex(seed);
					actions.setAccent('custom');
					patch.accent = seed;
				} else {
					actions.setAccent(set.accent);
					patch.accent = set.accent;
				}
			}

			void updateConfig(patch, { persistRemote: persistRemoteCfg() }).catch(
				() => {}
			);
		},
		[accent, accentCustomHex, actions, persistRemoteCfg, updateConfig]
	);

	useEffect(() => {
		if (!config) return;
		if (state.theme !== config.theme) actions.setTheme(config.theme);
		const parsed = parseDesktopAccentFromApi(config.accent ?? 'purple');
		if (state.accent !== parsed.id) actions.setAccent(parsed.id);
		if (parsed.id === 'custom' && state.accentCustomHex !== parsed.customHex) {
			actions.setAccentCustomHex(parsed.customHex);
		}
		if (state.wallpaper !== config.wallpaper)
			actions.setWallpaper(config.wallpaper);
	}, [
		actions,
		config,
		state.accent,
		state.accentCustomHex,
		state.theme,
		state.wallpaper,
	]);

	return {
		theme,
		setTheme,
		effectiveTheme,
		desktopEmbeddedAppTheme,
		desktopThemeVars,
		accent,
		accentCustomHex,
		setAccentChoice,
		onAccentCustomHexChange,
		toggleExplicitTheme,
		applyCuratedDesktopConfigPreset,
	};
}
