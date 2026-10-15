import { useLayoutEffect, type RefObject } from 'react';

/**
 * Копирует inline CSS-переменные и признаки темы с `#desktop-main` на узел портала,
 * чтобы модалки на `document.body` получали те же токены, что и рабочий стол.
 */
export function useSyncDesktopThemeFromMain(
	enabled: boolean,
	targetRef: RefObject<HTMLElement | null>
): void {
	useLayoutEffect(() => {
		if (!enabled) {
			return;
		}
		const main = document.getElementById('desktop-main');
		const node = targetRef.current;
		if (!main || !node) {
			return;
		}

		const src = main.style;
		const copiedNames: string[] = [];
		for (let i = 0; i < src.length; i++) {
			const name = src.item(i);
			if (name?.startsWith('--')) {
				node.style.setProperty(name, src.getPropertyValue(name));
				copiedNames.push(name);
			}
		}

		const colorScheme = src.colorScheme;
		if (colorScheme) {
			node.style.colorScheme = colorScheme;
		}
		const fontFamily = src.fontFamily;
		if (fontFamily) {
			node.style.fontFamily = fontFamily;
		}

		const dataTheme = main.getAttribute('data-theme');
		if (dataTheme) {
			node.setAttribute('data-theme', dataTheme);
		}
		if (dataTheme === 'light') {
			node.classList.remove('dark');
		} else {
			node.classList.add('dark');
		}

		return () => {
			for (const n of copiedNames) {
				node.style.removeProperty(n);
			}
			node.style.removeProperty('color-scheme');
			node.style.removeProperty('font-family');
			node.removeAttribute('data-theme');
			node.classList.remove('dark');
		};
	}, [enabled, targetRef]);
}
