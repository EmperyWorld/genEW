import { useCallback, useMemo } from 'react';
import { DEFAULT_DESKTOP_WALLPAPER_STYLE } from '../constants';

type SurfaceWelcomeActions = {
	setWallpaper: (v: string) => void;
	setShowWP: (v: boolean) => void;
	setShowNF: (v: boolean) => void;
	setShowWelcome: (v: boolean) => void;
};

export function useDesktopWorkspaceSurfaceWelcomeBridge(params: {
	configWallpaper: string | undefined;
	stateWallpaper: string;
	showWP: boolean;
	showNF: boolean;
	showWelcome: boolean;
	actions: SurfaceWelcomeActions;
}) {
	const {
		configWallpaper,
		stateWallpaper,
		showWP,
		showNF,
		showWelcome,
		actions,
	} = params;

	/** `??` skips only null/undefined — empty string from API would paint a blank desktop; normalize to fallback. */
	const wallpaper = useMemo(() => {
		const trimOrUndef = (v: string | undefined) => {
			if (typeof v !== 'string') return undefined;
			const t = v.trim();
			return t === '' ? undefined : t;
		};
		return (
			trimOrUndef(configWallpaper) ??
			trimOrUndef(stateWallpaper) ??
			DEFAULT_DESKTOP_WALLPAPER_STYLE
		);
	}, [configWallpaper, stateWallpaper]);
	const setWallpaper = useCallback(
		(value: string) => {
			actions.setWallpaper(value);
		},
		[actions]
	);

	return {
		wallpaper,
		setWallpaper,
		showWP,
		setShowWP: actions.setShowWP,
		showNF,
		setShowNF: actions.setShowNF,
		showWelcome,
		setShowWelcome: actions.setShowWelcome,
	};
}
