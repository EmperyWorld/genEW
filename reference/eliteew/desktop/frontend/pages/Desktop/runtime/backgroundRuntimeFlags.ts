const STORAGE_FLAG_KEY = 'elite_desktop_bg_runtime_adapter';

const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes']);
const FALSE_VALUES = new Set(['0', 'false', 'off', 'no']);

function parseBooleanLike(input: string | null | undefined): boolean | null {
	if (typeof input !== 'string') return null;
	const value = input.trim().toLowerCase();
	if (TRUE_VALUES.has(value)) return true;
	if (FALSE_VALUES.has(value)) return false;
	return null;
}

function readLocalOverride(): boolean | null {
	if (typeof window === 'undefined') return null;
	try {
		return parseBooleanLike(window.localStorage.getItem(STORAGE_FLAG_KEY));
	} catch {
		return null;
	}
}

export function isDesktopBackgroundRuntimeAdapterEnabled(): boolean {
	const localOverride = readLocalOverride();
	if (localOverride != null) return localOverride;

	const envValue = parseBooleanLike(
		(import.meta.env?.VITE_DESKTOP_BG_RUNTIME_ADAPTER as string | undefined) ??
			undefined
	);
	return envValue ?? true;
}
