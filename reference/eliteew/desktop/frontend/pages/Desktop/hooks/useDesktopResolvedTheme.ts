/**
 * Resolved desktop theme: 'dark' | 'light'.
 * When stored `theme` is `'auto'`, follows `prefers-color-scheme: dark` (updates on
 * `matchMedia('(prefers-color-scheme: dark)').change` — e.g. OS light/dark toggle).
 * Use inside DesktopStateProvider.
 */

import { useEffect, useState } from 'react';

import { useDesktopStateContext } from '../context/DesktopStateContext';

export function useDesktopResolvedTheme(): 'dark' | 'light' {
	const {
		state: { theme },
	} = useDesktopStateContext();

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

	return theme === 'auto' ? (mediaDark ? 'dark' : 'light') : theme;
}
