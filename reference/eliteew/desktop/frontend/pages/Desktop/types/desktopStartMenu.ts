/** Tabs in Start Menu (desktop shell). */
export type StartMenuTab = 'recent' | 'work' | 'pinned' | 'all' | 'categories';

export type { DesktopMenuMode } from '../../../types/profile';
export {
	DESKTOP_MENU_MODE_KEYS,
	normalizeDesktopMenuMode,
} from '../../../types/profile';
