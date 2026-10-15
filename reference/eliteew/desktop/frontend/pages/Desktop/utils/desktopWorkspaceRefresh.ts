import { isLegacyHiddenDesktopAppComponent } from './desktopAppRegistry';
import type { WindowState } from '../types/desktop.types';

/** Window ids for legacy hidden surface apps (e.g. Voice Command) to close on full desktop refresh. */
export function collectLegacyVoiceWindowIds(windows: WindowState[]): string[] {
	return windows
		.filter((w) => isLegacyHiddenDesktopAppComponent(w.appComponent))
		.map((w) => w.id);
}
