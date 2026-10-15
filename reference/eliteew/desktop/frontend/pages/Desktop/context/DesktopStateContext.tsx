/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T <keysray70@gmail.com>
 * ---
 *
 * Purpose:
 * DesktopStateProvider is the single source of truth for transient Desktop UI state.
 * Context + reducer keep selection, menus and shell visibility flags out of scattered local state.
 *
 * Invariants:
 * - Reducer state is UI-only; persisted desktop data belongs to storage/config hooks.
 * - `showWelcome` starts disabled; desktop shell tour opens only from taskbar button.
 *
 * Related:
 * - src/pages/Desktop/DesktopWorkspaceContent.tsx
 * - src/pages/Desktop/components/DesktopWelcomeScreen.tsx
 */

import {
	createContext,
	useContext,
	useMemo,
	useReducer,
	type Dispatch,
	type ReactNode,
} from 'react';
import { WALLPAPERS } from '../constants';
import type {
	ContextMenuState,
	DesktopItem,
	RecentFile,
} from '../types/desktop.types';

export type AccentColorId =
	| 'pink'
	| 'purple'
	| 'blue'
	| 'green'
	| 'orange'
	| 'cyan'
	| 'gray'
	| 'steel'
	| 'charcoal'
	| 'custom';
export interface DesktopState {
	selected: Set<string>;
	ctx: ContextMenuState;
	wallpaper: string;
	showWP: boolean;
	showNF: boolean;
	showWelcome: boolean;
	theme: 'dark' | 'light' | 'auto';
	accent: AccentColorId;
	/** Актуально при accent === 'custom'; хранится как #rrggbb, в API — в accent_color. */
	accentCustomHex: string;
	recentFiles: RecentFile[];
	clipboard: DesktopItem[];
	clipboardAction: 'copy' | 'cut' | null;
	renamingId: string | null;
	showCommandPalette: boolean;
	showClipboard: boolean;
	isDraggingIcon: boolean;
	showEnhancedContextMenu: boolean;
	contextMenuPosition: { x: number; y: number };
	contextMenuType: 'desktop' | 'folder' | 'file' | 'app' | 'window';
}

type DesktopAction =
	| { type: 'SET_SELECTED'; payload: Set<string> }
	| { type: 'SET_CTX'; payload: ContextMenuState }
	| { type: 'SET_WALLPAPER'; payload: string }
	| { type: 'SET_SHOW_WP'; payload: boolean }
	| { type: 'SET_SHOW_NF'; payload: boolean }
	| { type: 'SET_SHOW_WELCOME'; payload: boolean }
	| { type: 'SET_THEME'; payload: 'dark' | 'light' | 'auto' }
	| { type: 'SET_ACCENT'; payload: AccentColorId }
	| { type: 'SET_ACCENT_CUSTOM_HEX'; payload: string }
	| { type: 'SET_RECENT_FILES'; payload: RecentFile[] }
	| {
			type: 'SET_CLIPBOARD';
			payload: { items: DesktopItem[]; action: 'copy' | 'cut' | null };
	  }
	| { type: 'SET_RENAMING_ID'; payload: string | null }
	| { type: 'SET_SHOW_COMMAND_PALETTE'; payload: boolean }
	| { type: 'SET_SHOW_CLIPBOARD'; payload: boolean }
	| { type: 'SET_IS_DRAGGING_ICON'; payload: boolean }
	| { type: 'SET_SHOW_ENHANCED_CONTEXT_MENU'; payload: boolean }
	| { type: 'SET_CONTEXT_MENU_POSITION'; payload: { x: number; y: number } }
	| {
			type: 'SET_CONTEXT_MENU_TYPE';
			payload: 'desktop' | 'folder' | 'file' | 'app' | 'window';
	  };

const defaultCtx: ContextMenuState = {
	isOpen: false,
	x: 0,
	y: 0,
	targetType: 'desktop',
};

/** Runtime guard: selection must stay a Set (HMR / bad payload must not break Array.from / spread). */
export function coerceDesktopSelectionSet(value: unknown): Set<string> {
	if (value instanceof Set) {
		return value as Set<string>;
	}
	if (Array.isArray(value)) {
		return new Set(value.map((x) => String(x)));
	}
	return new Set<string>();
}

// Initial recent files: empty until API or user actions populate (no fake placeholders per data-integrity)
const defaultRecentFiles: RecentFile[] = [];

function desktopReducer(
	state: DesktopState,
	action: DesktopAction
): DesktopState {
	switch (action.type) {
		case 'SET_SELECTED':
			return {
				...state,
				selected: coerceDesktopSelectionSet(action.payload),
			};
		case 'SET_CTX':
			return { ...state, ctx: action.payload };
		case 'SET_WALLPAPER':
			return { ...state, wallpaper: action.payload };
		case 'SET_SHOW_WP':
			return { ...state, showWP: action.payload };
		case 'SET_SHOW_NF':
			return { ...state, showNF: action.payload };
		case 'SET_SHOW_WELCOME':
			return { ...state, showWelcome: action.payload };
		case 'SET_THEME':
			return { ...state, theme: action.payload };
		case 'SET_ACCENT':
			return { ...state, accent: action.payload };
		case 'SET_ACCENT_CUSTOM_HEX':
			return { ...state, accentCustomHex: action.payload };
		case 'SET_RECENT_FILES':
			return { ...state, recentFiles: action.payload };
		case 'SET_CLIPBOARD':
			return {
				...state,
				clipboard: action.payload.items,
				clipboardAction: action.payload.action,
			};
		case 'SET_RENAMING_ID':
			return { ...state, renamingId: action.payload };
		case 'SET_SHOW_COMMAND_PALETTE':
			return { ...state, showCommandPalette: action.payload };
		case 'SET_SHOW_CLIPBOARD':
			return { ...state, showClipboard: action.payload };
		case 'SET_IS_DRAGGING_ICON':
			return { ...state, isDraggingIcon: action.payload };
		case 'SET_SHOW_ENHANCED_CONTEXT_MENU':
			return { ...state, showEnhancedContextMenu: action.payload };
		case 'SET_CONTEXT_MENU_POSITION':
			return { ...state, contextMenuPosition: action.payload };
		case 'SET_CONTEXT_MENU_TYPE':
			return { ...state, contextMenuType: action.payload };
		default:
			return state;
	}
}

const initialState: DesktopState = {
	selected: new Set(),
	ctx: defaultCtx,
	wallpaper: WALLPAPERS[0]?.style ?? '',
	showWP: false,
	showNF: false,
	showWelcome: false,
	theme: 'dark',
	accent: 'purple',
	accentCustomHex: '#a855f7',
	recentFiles: defaultRecentFiles, // empty; filled by useRecentFiles / API when available
	clipboard: [],
	clipboardAction: null,
	renamingId: null,
	showCommandPalette: false,
	showClipboard: false,
	isDraggingIcon: false,
	showEnhancedContextMenu: false,
	contextMenuPosition: { x: 0, y: 0 },
	contextMenuType: 'desktop',
};

type DesktopStateContextValue = {
	state: DesktopState;
	dispatch: Dispatch<DesktopAction>;
};

const DesktopStateContext = createContext<DesktopStateContextValue | null>(
	null
);

/** Стабильная ссылка на dispatch: подписчики не перерисовываются при смене state. */
const DesktopDispatchContext = createContext<Dispatch<DesktopAction> | null>(
	null
);

export interface DesktopStateProviderProps {
	children: ReactNode;
}

export function DesktopStateProvider({ children }: DesktopStateProviderProps) {
	const [state, dispatch] = useReducer(desktopReducer, initialState);

	const value = useMemo<DesktopStateContextValue>(
		() => ({ state, dispatch }),
		[state]
	);

	return (
		<DesktopDispatchContext.Provider value={dispatch}>
			<DesktopStateContext.Provider value={value}>
				{children}
			</DesktopStateContext.Provider>
		</DesktopDispatchContext.Provider>
	);
}

export function useDesktopDispatch(): Dispatch<DesktopAction> {
	const d = useContext(DesktopDispatchContext);
	if (!d) {
		throw new Error(
			'useDesktopDispatch must be used within DesktopStateProvider'
		);
	}
	return d;
}

export function useDesktopStateContext(): DesktopStateContextValue {
	const ctx = useContext(DesktopStateContext);
	if (!ctx) {
		throw new Error(
			'useDesktopStateContext must be used within DesktopStateProvider'
		);
	}
	return ctx;
}

/** Helpers for common updates (optional; components can dispatch directly) */
export function useDesktopStateActions() {
	const dispatch = useDesktopDispatch();
	return useMemo(
		() => ({
			setSelected: (selected: Set<string>) =>
				dispatch({
					type: 'SET_SELECTED',
					payload: coerceDesktopSelectionSet(selected),
				}),
			setCtx: (ctx: ContextMenuState) =>
				dispatch({ type: 'SET_CTX', payload: ctx }),
			setWallpaper: (v: string) =>
				dispatch({ type: 'SET_WALLPAPER', payload: v }),
			setShowWP: (v: boolean) => dispatch({ type: 'SET_SHOW_WP', payload: v }),
			setShowNF: (v: boolean) => dispatch({ type: 'SET_SHOW_NF', payload: v }),
			setShowWelcome: (v: boolean) =>
				dispatch({ type: 'SET_SHOW_WELCOME', payload: v }),
			setTheme: (v: 'dark' | 'light' | 'auto') =>
				dispatch({ type: 'SET_THEME', payload: v }),
			setAccent: (v: AccentColorId) =>
				dispatch({ type: 'SET_ACCENT', payload: v }),
			setAccentCustomHex: (v: string) =>
				dispatch({ type: 'SET_ACCENT_CUSTOM_HEX', payload: v }),
			setRecentFiles: (v: RecentFile[]) =>
				dispatch({ type: 'SET_RECENT_FILES', payload: v }),
			setClipboard: (items: DesktopItem[], action: 'copy' | 'cut' | null) =>
				dispatch({ type: 'SET_CLIPBOARD', payload: { items, action } }),
			setRenamingId: (v: string | null) =>
				dispatch({ type: 'SET_RENAMING_ID', payload: v }),
			setShowCommandPalette: (v: boolean) =>
				dispatch({ type: 'SET_SHOW_COMMAND_PALETTE', payload: v }),
			setShowClipboard: (v: boolean) =>
				dispatch({ type: 'SET_SHOW_CLIPBOARD', payload: v }),
			setIsDraggingIcon: (v: boolean) =>
				dispatch({ type: 'SET_IS_DRAGGING_ICON', payload: v }),
			setShowEnhancedContextMenu: (v: boolean) =>
				dispatch({ type: 'SET_SHOW_ENHANCED_CONTEXT_MENU', payload: v }),
			setContextMenuPosition: (v: { x: number; y: number }) =>
				dispatch({ type: 'SET_CONTEXT_MENU_POSITION', payload: v }),
			setContextMenuType: (
				v: 'desktop' | 'folder' | 'file' | 'app' | 'window'
			) => dispatch({ type: 'SET_CONTEXT_MENU_TYPE', payload: v }),
		}),
		[dispatch]
	);
}
