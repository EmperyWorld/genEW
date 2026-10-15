/**
 * When the user picks «auto», `theme` is `'auto'` but the shell renders light/dark
 * via `resolved`. Toggles should flip the *visible* appearance, not always force `dark`.
 */
export function nextExplicitThemeAfterToggle(
	mode: 'dark' | 'light' | 'auto',
	resolved: 'dark' | 'light'
): 'dark' | 'light' {
	if (mode === 'auto') {
		return resolved === 'dark' ? 'light' : 'dark';
	}
	return mode === 'dark' ? 'light' : 'dark';
}
