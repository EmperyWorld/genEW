/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop app/folder window shell: react-rnd placement, title bar (`WindowTitleBar`), lazy app content, and minimize/maximize/close wiring.
 *
 * Invariants:
 * - Title bar control hints and `aria-label` text come from `WindowTitleBar` + i18n — do not mutate button attributes by DOM index (extra toolbar buttons broke a11y).
 * - App body is wrapped in `DesktopGuideTourOpenerProvider` so per-app tours register the title-bar «Экскурсия» button.
 * - Guide opener is stored in a ref; title bar visibility toggles only on register/unregister, not on callback identity churn.
 * - Folder windows mirror apps: **`onUpdatePayload`** pushes **`WindowInitialPayload`** patches (e.g. **`companionListingPlain`** for shell_context).
 * - App window body layout sync is localized (double rAF); never dispatches synthetic `window` resize (boot perf).
 *
 * Related:
 * - WindowTitleBar.tsx
 * - DesktopWorkspaceContent.tsx
 */

import { RetryBlock } from '@/components/ui/RetryBlock';
import i18n from '@/i18n/config';
import { AnimatePresence, m, type Variants } from 'framer-motion';
import { useDesktopShellMotionPrefs } from '../context/DesktopShellMotionPrefsContext';
import * as React from 'react';
import {
	memo,
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { Rnd } from 'react-rnd';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import type { DesktopWindowStyle } from '../../../types/profile';
import { safeCopyToClipboard } from '../../../utils/clipboard';
import { log } from '../../../utils/logger';
import { isLikelyStaleChunkImportError } from '../../../utils/staleBundleReload';
import { showDesktopChunkUpdateNoticeThenReload } from '../utils/showDesktopChunkUpdateNotice';
import {
	buildDesktopWindowErrorMessage,
	buildDesktopWindowLoadingMessage,
	buildDesktopWindowMinSizeHint,
} from '../utils/desktopWindowChromeCopy';
import {
	desktopEmbeddedFloatingMenuZIndex,
	DESKTOP_LAYOUT,
	DESKTOP_LUCIDE,
	DESKTOP_SURFACE,
} from '../constants';
import { DesktopWindowPortalStackContext } from '../context/DesktopWindowPortalStackContext';
import { DesktopGuideTourOpenerProvider } from '../context/DesktopGuideTourOpenerContext';
import { useDesktopAppProps } from '../context/DesktopAppPropsContext';
import { DesktopWindowActiveProvider } from '../context/DesktopWindowActiveContext';
import { DesktopWindowContextProvider } from '../context/DesktopWindowContext';
import { useDesktopBackgroundAdapter } from '../runtime/useDesktopBackgroundAdapter';
import { useDesktopInactiveWindowSoftBlur } from '../runtime/useDesktopInactiveWindowSoftBlur';
import type {
	BeforeCloseHandler,
	DesktopItem,
	WindowState,
} from '../types/desktop.types';
import { getDesktopWindowMinSize } from '../utils/desktopWindowMinSizeRegistry';
import { isDesktopAppWindowBodySelfScrollApp } from '../utils/desktopWindowBodyScrollRegistry';
import {
	getDesktopWindowContentVariants,
	getDesktopWindowFrameVariants,
} from '../utils/desktopWindowMotionVariants';
import {
	DESKTOP_WINDOW_FRAME_STYLES,
	DESKTOP_WINDOW_TITLEBAR_STYLES,
} from '../utils/desktopVisualSystem';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';
import { scheduleAppWindowBodyLayoutSync } from '../utils/desktopAppWindowBodyLayoutSync';
import { resolveDesktopWindowAppComponent } from '../utils/desktopWindowResolveApp';
import { resolveDesktopWindowDisplayTitle } from '../utils/desktopWindowDisplayTitle';
import { isDesktopLaserPointerEnvironment } from '../utils/desktopLaserPointerEnvironment';
import { getDesktopWindowAppContent } from './desktopWindowAppContent';
import {
	DesktopAppContentWrapper,
	DesktopAppEmptyState,
	DesktopAppMenuItem,
	DesktopAppMenuSurface,
} from './DesktopAppChrome';
import { DesktopShellFloatingPortal } from './DesktopShellFloatingPortal';
import { DesktopFolderWindow } from './DesktopFolderWindow';
import { WindowTitleBar } from './WindowTitleBar';
import {
	ArrowPathIcon,
	Cog6ToothIcon,
	FolderIcon,
	PauseCircleIcon,
} from '@heroicons/react/24/outline';

const MAX_WINDOW_WIDTH = DESKTOP_LAYOUT.MAX_WINDOW_WIDTH_PX;
const MAX_WINDOW_HEIGHT = DESKTOP_LAYOUT.MAX_WINDOW_HEIGHT_PX;

/**
 * Верхняя граница размера для Rnd: ровно рабочая область (`readDesktopWorkArea`), как у snap / maximize.
 * Не вычитать WINDOW_MARGIN и не ужимать по MAX_* — иначе полноширинные/полновысотные пресеты (низ, трети)
 * визуально сужаются или «пружинят» относительно состояния после snap.
 */
function computeViewportMaxFromWorkArea(): { width: number; height: number } {
	if (typeof document === 'undefined') {
		return {
			width: MAX_WINDOW_WIDTH,
			height: MAX_WINDOW_HEIGHT,
		};
	}
	const gw = globalThis as unknown as Window;
	if (typeof gw.innerWidth !== 'number') {
		return {
			width: MAX_WINDOW_WIDTH,
			height: MAX_WINDOW_HEIGHT,
		};
	}
	const wa = readDesktopWorkArea();
	return {
		width: Math.max(320, wa.width),
		height: Math.max(240, wa.height),
	};
}

/** Higher-contrast resize affordances (react-rnd handles) + explicit resize cursors */
const DESKTOP_RND_RESIZE_HANDLE_CLASSES = {
	top: '!h-2.5 !top-0 cursor-ns-resize border-t-2 border-[rgb(var(--desktop-accent-rgb)/0.42)] hover:border-[rgb(var(--desktop-accent-rgb)/0.72)] motion-reduce:transition-none',
	right:
		'!w-2.5 !right-0 cursor-ew-resize border-r-2 border-[rgb(var(--desktop-accent-rgb)/0.42)] hover:border-[rgb(var(--desktop-accent-rgb)/0.72)] motion-reduce:transition-none',
	bottom:
		'!h-2.5 !bottom-0 cursor-ns-resize border-b-2 border-[rgb(var(--desktop-accent-rgb)/0.42)] hover:border-[rgb(var(--desktop-accent-rgb)/0.72)] motion-reduce:transition-none',
	left: '!w-2.5 !left-0 cursor-ew-resize border-l-2 border-[rgb(var(--desktop-accent-rgb)/0.42)] hover:border-[rgb(var(--desktop-accent-rgb)/0.72)] motion-reduce:transition-none',
	topRight:
		'!h-4 !w-4 !top-0 !right-0 cursor-nesw-resize rounded-br-md bg-[rgb(var(--desktop-accent-rgb)/0.28)] hover:bg-[rgb(var(--desktop-accent-rgb)/0.48)] motion-reduce:transition-none',
	bottomRight:
		'!h-4 !w-4 !bottom-0 !right-0 cursor-nwse-resize rounded-tl-md bg-[rgb(var(--desktop-accent-rgb)/0.28)] hover:bg-[rgb(var(--desktop-accent-rgb)/0.48)] motion-reduce:transition-none',
	bottomLeft:
		'!h-4 !w-4 !bottom-0 !left-0 cursor-nesw-resize rounded-tr-md bg-[rgb(var(--desktop-accent-rgb)/0.28)] hover:bg-[rgb(var(--desktop-accent-rgb)/0.48)] motion-reduce:transition-none',
	topLeft:
		'!h-4 !w-4 !top-0 !left-0 cursor-nwse-resize rounded-br-md bg-[rgb(var(--desktop-accent-rgb)/0.28)] hover:bg-[rgb(var(--desktop-accent-rgb)/0.48)] motion-reduce:transition-none',
} as const;

// Error boundary so failed lazy loads show message instead of blank
class AppErrorBoundary extends React.Component<
	{
		children: React.ReactNode;
		fallback: (errorMessage: string | null) => React.ReactNode;
		appComponent?: string | null;
	},
	{ hasError: boolean; errorMessage: string | null }
> {
	state = { hasError: false, errorMessage: null };
	static getDerivedStateFromError(error: Error) {
		return {
			hasError: true,
			errorMessage:
				error?.message ??
				i18n.t('windowChrome.unknownAppError', { ns: 'desktopUi' }),
		};
	}
	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		const appComponent = this.props.appComponent ?? 'unknown';
		const message =
			error?.message ??
			i18n.t('windowChrome.unknownAppError', { ns: 'desktopUi' });
		log.error('DesktopAppErrorBoundary', `[${appComponent}] ${message}`, error);
		console.error(
			`[DesktopAppErrorBoundary:${appComponent}]`,
			error,
			errorInfo
		);
		// React.lazy: failed import() does not always reach window "unhandledrejection"
		if (isLikelyStaleChunkImportError(message)) {
			showDesktopChunkUpdateNoticeThenReload('chunk_load_failure');
			return;
		}
		this.setState({ errorMessage: message });
	}
	render() {
		if (this.state.hasError) {
			return this.props.fallback(this.state.errorMessage);
		}
		return this.props.children;
	}
}

/** Координаты указателя в viewport; для программного clamp позиции не передаются (без snap). */
type DesktopWindowDragPointer = { clientX: number; clientY: number };

function pointerFromDragEvent(e: unknown): DesktopWindowDragPointer {
	if (!e || typeof e !== 'object') {
		return { clientX: 0, clientY: 0 };
	}
	const v = e as { touches?: TouchList; clientX?: number; clientY?: number };
	if (v.touches && v.touches.length > 0) {
		const t = v.touches[0];
		return { clientX: t.clientX, clientY: t.clientY };
	}
	if (typeof v.clientX === 'number' && typeof v.clientY === 'number') {
		return { clientX: v.clientX, clientY: v.clientY };
	}
	return { clientX: 0, clientY: 0 };
}

export function isDesktopAppWindowBodySelfScroll(
	windowType: WindowState['type'],
	appComponent?: string | null
): boolean {
	if (windowType !== 'app') return false;
	return isDesktopAppWindowBodySelfScrollApp(appComponent);
}

interface EnhancedWindowProps {
	desktopWindow: WindowState;
	/** When window is a folder, optional item for color/name (from desktop items) */
	folderItem?: DesktopItem | null;
	isActive?: boolean;
	isTabVisible?: boolean;
	onDragStart: () => void;
	onDrag: (x: number, y: number, pointer: DesktopWindowDragPointer) => void;
	onDragEnd: (
		x: number,
		y: number,
		pointer: DesktopWindowDragPointer | null
	) => void;
	onResize: (width: number, height: number) => void;
	onClose: () => void;
	onMinimize: () => void;
	onMaximize: () => void;
	onFocus: () => void;
	registerBeforeClose?: (id: string, fn: BeforeCloseHandler) => void;
	unregisterBeforeClose?: (id: string) => void;
	/** Called when app wants to update window payload (e.g. DocEditor sets documentId after user selects doc). */
	onUpdatePayload?: (
		payload: import('../types/desktop.types').WindowInitialPayload
	) => void;
	/** Navigate folder window to another folder (tree / breadcrumb). */
	onRetargetFolder?: (target: {
		folderId: string;
		title: string;
		path: string[];
	}) => void;
	visualStyle?: DesktopWindowStyle;
	/** Подпись про лимит окон из витрины (рядом с типом окна в заголовке). */
	storeInstancePolicyLabel?: string;
	alwaysOnTop?: boolean;
	onToggleAlwaysOnTop?: () => void;
}

export const EnhancedWindow: React.FC<EnhancedWindowProps> = memo(
	({
		desktopWindow,
		folderItem: _folderMeta = null,
		isActive = false,
		isTabVisible = true,
		onDragStart,
		onDrag,
		onDragEnd,
		onResize,
		onClose,
		onMinimize,
		onMaximize,
		onFocus,
		registerBeforeClose,
		unregisterBeforeClose,
		onUpdatePayload,
		onRetargetFolder,
		visualStyle = 'glass',
		storeInstancePolicyLabel,
		alwaysOnTop = false,
		onToggleAlwaysOnTop,
	}) => {
		const { t } = useTranslation('desktopUi');
		const win = desktopWindow;
		const isMaximized = desktopWindow.isMaximized;
		const appProps = useDesktopAppProps();
		const { reduceMotion, speed } = useDesktopShellMotionPrefs();
		const windowVariants: Variants = useMemo(
			() => getDesktopWindowFrameVariants(reduceMotion, speed),
			[reduceMotion, speed]
		);
		const contentVariants: Variants = useMemo(
			() => getDesktopWindowContentVariants(reduceMotion),
			[reduceMotion]
		);
		const frameStyle = useMemo(
			() =>
				DESKTOP_WINDOW_FRAME_STYLES[visualStyle] ??
				DESKTOP_WINDOW_FRAME_STYLES.glass,
			[visualStyle]
		);
		const inactiveSoftBlurShell = useDesktopInactiveWindowSoftBlur({
			isActive,
			isMinimized: desktopWindow.isMinimized,
			isMinimizing: desktopWindow.isMinimizing,
		});
		const titleBarPreset = useMemo(
			() =>
				DESKTOP_WINDOW_TITLEBAR_STYLES[visualStyle] ??
				DESKTOP_WINDOW_TITLEBAR_STYLES.glass,
			[visualStyle]
		);
		const [contentKey, setContentKey] = React.useState(0);
		const [textContextMenu, setTextContextMenu] = React.useState<{
			x: number;
			y: number;
			mode: 'copy' | 'paste' | 'copy-paste';
			editableElement: HTMLElement | null;
			selectionText: string;
			inputSelection: { start: number; end: number } | null;
		} | null>(null);
		const textContextRangeRef = useRef<Range | null>(null);
		const floatingMenuZIndex = desktopEmbeddedFloatingMenuZIndex(
			desktopWindow.zIndex
		);
		const floatingMenuBackdropZIndex = floatingMenuZIndex - 1;

		const titleBarTitle = useMemo(() => {
			return resolveDesktopWindowDisplayTitle(win);
		}, [win]);

		const closeTextContextMenu = (): void => {
			textContextRangeRef.current = null;
			setTextContextMenu(null);
		};

		useEffect(() => {
			return () => {
				unregisterBeforeClose?.(win.id);
			};
		}, [win.id, unregisterBeforeClose]);

		// Render app component based on window type
		const renderAppContent = useCallback(() => {
			if (win.type === 'folder') {
				return (
					<DesktopFolderWindow
						win={win}
						windowId={win.id}
						visualStyle={visualStyle}
						contentVariants={contentVariants}
						reduceMotion={reduceMotion}
						floatingMenuZIndex={floatingMenuZIndex}
						floatingMenuBackdropZIndex={floatingMenuBackdropZIndex}
						titleBarPreset={titleBarPreset}
						onUpdatePayload={onUpdatePayload}
						onRetargetFolder={onRetargetFolder}
					/>
				);
			}

			return (
				<AppWindowContent
					win={win}
					visualStyle={visualStyle}
					appProps={appProps}
					contentKey={contentKey}
					onRetry={() => setContentKey((k) => k + 1)}
					onClose={onClose}
					onMaximize={onMaximize}
					onUpdatePayload={onUpdatePayload}
				/>
			);
		}, [
			win,
			visualStyle,
			titleBarPreset,
			appProps,
			contentKey,
			onClose,
			onMaximize,
			onUpdatePayload,
			onRetargetFolder,
			floatingMenuBackdropZIndex,
			floatingMenuZIndex,
			reduceMotion,
			contentVariants,
		]);

		// Memoize position and size to prevent unnecessary re-renders.
		// Be defensive against legacy/corrupted window state where position/size might be missing.
		const position = useMemo(() => {
			const pos = win.position ?? { x: 200, y: 120 };
			return {
				x: typeof pos.x === 'number' ? pos.x : 200,
				y: typeof pos.y === 'number' ? pos.y : 120,
			};
		}, [win.position]);

		const size = useMemo(() => {
			const minSizeLocal = getDesktopWindowMinSize(desktopWindow);
			const fallback = {
				width: minSizeLocal.minWidth,
				height: minSizeLocal.minHeight,
			};
			const s = win.size ?? fallback;
			const raw = s as { width?: unknown; height?: unknown };
			return {
				width: typeof raw.width === 'number' ? raw.width : fallback.width,
				height: typeof raw.height === 'number' ? raw.height : fallback.height,
			};
		}, [win.size, desktopWindow]);

		// Viewport-based max size (recompute on resize).
		// NOTE: use globalThis to avoid shadowing the WindowState prop named "window".
		const [viewportMax, setViewportMax] = useState(() =>
			computeViewportMaxFromWorkArea()
		);
		const guideTourOpenerRef = useRef<(() => void) | null>(null);
		const [guideTourOpenerReady, setGuideTourOpenerReady] = useState(false);
		const setGuideTourOpener = useCallback((fn: (() => void) | null) => {
			const wasReady = guideTourOpenerRef.current != null;
			const isReady = fn != null;
			guideTourOpenerRef.current = fn;
			if (wasReady !== isReady) {
				setGuideTourOpenerReady(isReady);
			}
		}, []);
		const invokeGuideTourOpener = useCallback(() => {
			guideTourOpenerRef.current?.();
		}, []);

		useEffect(() => {
			if (typeof globalThis === 'undefined') {
				return;
			}
			const gw = globalThis as unknown as Window;
			if (typeof gw.addEventListener !== 'function') {
				return;
			}
			const onResize = () => {
				setViewportMax(computeViewportMaxFromWorkArea());
			};
			gw.addEventListener('resize', onResize);
			return () => gw.removeEventListener('resize', onResize);
		}, []);

		const minSize = useMemo(
			() => getDesktopWindowMinSize(desktopWindow),
			[desktopWindow]
		);
		const [minSizeHintVisible, setMinSizeHintVisible] = useState(false);
		const minSizeHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
			null
		);

		const flashMinSizeHint = useCallback(() => {
			setMinSizeHintVisible(true);
			if (minSizeHintTimerRef.current) {
				clearTimeout(minSizeHintTimerRef.current);
			}
			minSizeHintTimerRef.current = setTimeout(() => {
				setMinSizeHintVisible(false);
				minSizeHintTimerRef.current = null;
			}, 2400);
		}, []);

		useEffect(() => {
			return () => {
				if (minSizeHintTimerRef.current) {
					clearTimeout(minSizeHintTimerRef.current);
				}
			};
		}, []);

		/**
		 * Редактор документов сам скроллит контент; внешний `overflow-auto` на `<section>`
		 * даёт двойной скролл и сбивает позиционирование Tiptap BubbleMenu / клики.
		 * (ContentManagerPro оставляем с `data-desktop-scroll` — превью ищет этот контейнер.)
		 * App Store — внутренний scroll на `<main>` каталога; внешний overflow-auto ломает flex-цепочку.
		 * Site Studio — shell/framed app with its own tab scroll areas; outer body scroll creates nested bars.
		 * Marketing/Customer Cabinet — scroll в `MarketingCabinetContentFrame`; иначе окно «не встраивается» в высоту.
		 * DesktopShellSettings — scroll на tabpanel (`overflow-y-auto`); внешний overflow-auto
		 * уезжает весь chrome (sidebar + вкладки) вместо прокрутки содержимого.
		 */
		const appWindowBodySelfScroll = useMemo(
			() => isDesktopAppWindowBodySelfScroll(win.type, win.appComponent),
			[win.type, win.appComponent]
		);

		const isMinimizedHidden =
			desktopWindow.isMinimized && !desktopWindow.isMinimizing;

		const shellRef = useRef<HTMLDivElement>(null);
		const appWindowBodyRef = useRef<HTMLElement | null>(null);
		const wasAppWindowMinimizedRef = useRef(false);

		/** Nested flex + lazy Suspense: localized geometry read after paint — no global resize fan-out. */
		// biome-ignore lint/correctness/useExhaustiveDependencies: geometry sync when window chrome size changes
		useLayoutEffect(() => {
			if (win.type !== 'app') return;
			scheduleAppWindowBodyLayoutSync(appWindowBodyRef.current);
		}, [win.type, size.width, size.height, isMaximized]);

		useLayoutEffect(() => {
			if (win.type !== 'app') return;
			const nowHidden = Boolean(
				desktopWindow.isMinimized || desktopWindow.isMinimizing
			);
			if (wasAppWindowMinimizedRef.current && !nowHidden) {
				scheduleAppWindowBodyLayoutSync(appWindowBodyRef.current);
			}
			wasAppWindowMinimizedRef.current = nowHidden;
		}, [win.type, desktopWindow.isMinimized, desktopWindow.isMinimizing]);

		/** Свёрнутое окно помечается `inert` / скрыто от AT — убираем фокус с потомков, иначе Chrome: aria-hidden + focus. */
		useLayoutEffect(() => {
			if (!isMinimizedHidden) return;
			const root = shellRef.current;
			if (!root) return;
			const ae = document.activeElement;
			if (ae instanceof HTMLElement && root.contains(ae)) {
				ae.blur();
			}
		}, [isMinimizedHidden]);

		useEffect(() => {
			if (!isDesktopLaserPointerEnvironment()) return;
			const releaseDragResize = () => {
				try {
					document.dispatchEvent(
						new MouseEvent('mouseup', {
							bubbles: true,
							cancelable: true,
							view: window,
						})
					);
				} catch {
					// ignore
				}
			};
			window.addEventListener('pointerup', releaseDragResize, {
				capture: true,
			});
			window.addEventListener('pointercancel', releaseDragResize, {
				capture: true,
			});
			return () => {
				window.removeEventListener('pointerup', releaseDragResize, {
					capture: true,
				});
				window.removeEventListener('pointercancel', releaseDragResize, {
					capture: true,
				});
			};
		}, []);

		useEffect(() => {
			if (
				desktopWindow.isMaximized ||
				desktopWindow.isMinimized ||
				desktopWindow.isMinimizing
			) {
				return;
			}
			const gw =
				typeof globalThis !== 'undefined'
					? (globalThis as unknown as Window)
					: null;
			if (!gw || typeof gw.innerWidth !== 'number') {
				return;
			}
			const w = size.width;
			const h = size.height;
			const wa = readDesktopWorkArea();
			const maxX = Math.max(0, wa.width - w);
			const maxY = Math.max(0, wa.height - h);
			const nx = Math.min(Math.max(0, position.x), maxX);
			const ny = Math.min(Math.max(0, position.y), maxY);
			if (nx !== position.x || ny !== position.y) {
				onDragEnd(nx, ny, null);
			}
		}, [
			desktopWindow.isMaximized,
			desktopWindow.isMinimized,
			desktopWindow.isMinimizing,
			position.x,
			position.y,
			size.width,
			size.height,
			onDragEnd,
		]);

		return (
			<>
				<AnimatePresence mode="wait">
					<Rnd
						key={desktopWindow.id}
						cancel="[data-desktop-window-control], .desktop-window-no-drag"
						size={size}
						position={position}
						onDragStart={() => onDragStart()}
						onDrag={(e, data) => {
							const p = pointerFromDragEvent(e);
							onDrag(data.x, data.y, p);
						}}
						onDragStop={(e, data) => {
							onDragEnd(data.x, data.y, pointerFromDragEvent(e));
						}}
						onResizeStop={(_e, _direction, ref) => {
							onResize(
								parseInt(ref.style.width, 10),
								parseInt(ref.style.height, 10)
							);
						}}
						onResize={(_e, _direction, ref) => {
							const w = parseInt(ref.style.width, 10);
							const h = parseInt(ref.style.height, 10);
							if (w <= minSize.minWidth + 1 || h <= minSize.minHeight + 1) {
								flashMinSizeHint();
							}
						}}
						minWidth={minSize.minWidth}
						minHeight={minSize.minHeight}
						maxWidth={desktopWindow.isMaximized ? '100%' : viewportMax.width}
						maxHeight={desktopWindow.isMaximized ? '100%' : viewportMax.height}
						disableDragging={
							desktopWindow.isMaximized ||
							desktopWindow.isMinimizing ||
							desktopWindow.isMinimized
						}
						enableResizing={
							!desktopWindow.isMaximized &&
							!desktopWindow.isMinimizing &&
							!desktopWindow.isMinimized
						}
						dragHandleClassName="desktop-window-drag-handle"
						resizeHandleClasses={DESKTOP_RND_RESIZE_HANDLE_CLASSES}
						bounds="window"
						style={{
							zIndex: isMinimizedHidden
								? 0
								: desktopWindow.isMinimizing
									? 0
									: desktopWindow.zIndex,
							pointerEvents:
								desktopWindow.isMinimizing || isMinimizedHidden
									? 'none'
									: 'auto',
							visibility: isMinimizedHidden ? 'hidden' : 'visible',
						}}
						className={cn(
							'desktop-window-root overflow-hidden',
							frameStyle.frame,
							isMaximized
								? 'rounded-none border-0 shadow-none! ring-0 [box-shadow:none]'
								: [
										DESKTOP_SURFACE.radiusFrame,
										DESKTOP_SURFACE.shadow,
										isActive && !win.isMinimizing
											? frameStyle.active
											: frameStyle.inactive,
									]
						)}
						data-desktop-window
						data-desktop-window-active={isActive ? 'true' : 'false'}
						inert={isMinimizedHidden ? true : undefined}
					>
						<m.div
							ref={shellRef}
							variants={windowVariants}
							initial="initial"
							animate={
								desktopWindow.isMinimizing || desktopWindow.isMinimized
									? 'minimized'
									: 'animate'
							}
							exit="exit"
							className={cn(
								'relative w-full h-full flex flex-col min-h-0',
								frameStyle.shell,
								isActive ? 'brightness-100' : 'brightness-[0.96]',
								inactiveSoftBlurShell && 'desktop-window-inactive-soft-blur'
							)}
							onClick={onFocus}
						>
							{!isMaximized ? (
								<div
									aria-hidden
									className={`pointer-events-none absolute left-4 right-4 top-0 h-px ${frameStyle.accentLine}`}
								/>
							) : null}
							<WindowTitleBar
								className="desktop-window-drag-handle relative z-10 min-w-0 shrink-0 [&_button:focus-visible]:relative [&_button:focus-visible]:z-1"
								title={titleBarTitle}
								windowId={desktopWindow.id}
								windowMorphActive={!isMinimizedHidden}
								icon={
									desktopWindow.type === 'folder' ? (
										<FolderIcon
											className="h-full w-full p-0.5 text-(--desktop-text-primary)"
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
									) : (
										desktopWindow.icon
									)
								}
								onClose={onClose}
								onMinimize={onMinimize}
								onMaximize={onMaximize}
								isMaximized={isMaximized}
								alwaysOnTop={alwaysOnTop}
								onToggleAlwaysOnTop={onToggleAlwaysOnTop}
								windowType={desktopWindow.type === 'app' ? 'app' : 'folder'}
								instancePolicyPill={
									desktopWindow.type === 'app'
										? storeInstancePolicyLabel
										: undefined
								}
								onContextMenu={(e) => {
									e.preventDefault();
									e.stopPropagation();
									window.dispatchEvent(
										new CustomEvent('desktop-window-context-menu', {
											detail: {
												windowId: desktopWindow.id,
												x: e.clientX,
												y: e.clientY,
											},
										})
									);
								}}
								visualStyle={visualStyle}
								onGuideTour={
									desktopWindow.type === 'app' && guideTourOpenerReady
										? invokeGuideTourOpener
										: undefined
								}
							/>

							{/* Content - scrollable, never overlaps title bar */}
							<section
								ref={appWindowBodyRef}
								aria-label={t('windowChrome.windowContentAria')}
								className={cn(
									'flex-1 min-h-0 relative',
									frameStyle.content,
									appWindowBodySelfScroll ? 'overflow-hidden' : 'overflow-auto'
								)}
								data-desktop-scroll={
									appWindowBodySelfScroll ? undefined : 'true'
								}
								onContextMenu={(e) => {
									// Child already handled menu (e.g. track row with preventDefault); avoid stacking
									// the window chrome menu (Свернуть / Восстановить / Закрыть) on top.
									if (e.defaultPrevented) {
										return;
									}
									const target = e.target as HTMLElement;
									const ignoreWindowContext = !!target.closest(
										'[data-desktop-window-ignore-context]'
									);
									const editableRoot = target.closest(
										'input, textarea, [contenteditable]:not([contenteditable="false"])'
									) as HTMLElement | null;
									const isEditable = !!editableRoot;
									const selection =
										typeof window !== 'undefined' &&
										typeof window.getSelection === 'function'
											? window.getSelection()
											: null;
									let selectionText = '';
									let inputSelection: { start: number; end: number } | null =
										null;
									let selectionRange: Range | null = null;

									if (
										editableRoot instanceof HTMLInputElement ||
										editableRoot instanceof HTMLTextAreaElement
									) {
										const start =
											editableRoot.selectionStart ?? editableRoot.value.length;
										const end =
											editableRoot.selectionEnd ?? editableRoot.value.length;
										inputSelection = { start, end };
										if (end > start) {
											selectionText = editableRoot.value.slice(start, end);
										}
									} else if (selection && selection.rangeCount > 0) {
										const range = selection.getRangeAt(0);
										const inEditable = editableRoot
											? editableRoot.contains(range.commonAncestorContainer)
											: true;
										if (inEditable) {
											if (!selection.isCollapsed) {
												selectionText = selection.toString();
											}
											if (editableRoot?.isContentEditable) {
												selectionRange = range.cloneRange();
											}
										}
									}

									const hasSelection = selectionText.length > 0;

									if (hasSelection || isEditable) {
										e.preventDefault();
										e.stopPropagation();
										const mode: 'copy' | 'paste' | 'copy-paste' =
											hasSelection && isEditable
												? 'copy-paste'
												: hasSelection
													? 'copy'
													: 'paste';
										textContextRangeRef.current = selectionRange;
										setTextContextMenu({
											x: e.clientX,
											y: e.clientY,
											mode,
											editableElement: editableRoot,
											selectionText,
											inputSelection,
										});
										return;
									}

									textContextRangeRef.current = null;
									if (ignoreWindowContext) {
										return;
									}

									e.preventDefault();
									e.stopPropagation();
									window.dispatchEvent(
										new CustomEvent('desktop-window-context-menu', {
											detail: {
												windowId: desktopWindow.id,
												x: e.clientX,
												y: e.clientY,
											},
										})
									);
								}}
							>
								<DesktopGuideTourOpenerProvider setOpener={setGuideTourOpener}>
									<DesktopWindowPortalStackContext.Provider
										value={floatingMenuZIndex}
									>
										<DesktopWindowActiveProvider
											isActive={isActive}
											isMinimized={desktopWindow.isMinimized}
											isMinimizing={desktopWindow.isMinimizing}
											isTabVisible={isTabVisible}
										>
											{registerBeforeClose && unregisterBeforeClose ? (
												<DesktopWindowContextProvider
													windowId={desktopWindow.id}
													registerBeforeClose={registerBeforeClose}
													unregisterBeforeClose={unregisterBeforeClose}
												>
													{renderAppContent()}
												</DesktopWindowContextProvider>
											) : (
												renderAppContent()
											)}
										</DesktopWindowActiveProvider>
									</DesktopWindowPortalStackContext.Provider>
								</DesktopGuideTourOpenerProvider>
							</section>
							{minSizeHintVisible ? (
								<div
									role="status"
									aria-live="polite"
									className="pointer-events-none absolute inset-x-0 bottom-0 z-20 border-t border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] px-3 py-1.5 text-center text-xs text-(--desktop-text-primary) shadow-[inset_0_0_12px_rgb(var(--desktop-accent-rgb)/0.15)]"
								>
									{buildDesktopWindowMinSizeHint(
										t,
										minSize.minWidth,
										minSize.minHeight
									)}
								</div>
							) : null}
						</m.div>
					</Rnd>
				</AnimatePresence>
				{textContextMenu && (
					<DesktopShellFloatingPortal>
						<div
							className="fixed inset-0"
							style={{ zIndex: floatingMenuBackdropZIndex }}
							aria-hidden
							onClick={closeTextContextMenu}
						/>
						<m.div
							initial={
								reduceMotion === true
									? false
									: { opacity: 0, scale: 0.95, y: 4 }
							}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={
								reduceMotion === true
									? { opacity: 0 }
									: { opacity: 0, scale: 0.95, y: 4 }
							}
							className="fixed"
							style={{
								left: textContextMenu.x,
								top: textContextMenu.y,
								zIndex: floatingMenuZIndex,
							}}
							onClick={(e) => e.stopPropagation()}
						>
							<DesktopAppMenuSurface
								windowStyle={visualStyle}
								className="min-w-[168px]"
							>
								{(textContextMenu.mode === 'copy' ||
									textContextMenu.mode === 'copy-paste') && (
									<DesktopAppMenuItem
										type="button"
										shortcut={<span className="tabular-nums">Ctrl+C</span>}
										onClick={async () => {
											try {
												const textFromMenu = textContextMenu.selectionText;
												const fallbackSelection =
													typeof window !== 'undefined' &&
													typeof window.getSelection === 'function'
														? window.getSelection()
														: null;
												const textFromWindow =
													fallbackSelection && !fallbackSelection.isCollapsed
														? fallbackSelection.toString()
														: '';
												const text = textFromMenu || textFromWindow;
												if (text) {
													const copied = await safeCopyToClipboard(text);
													if (!copied) {
														console.error(
															'[EnhancedWindow] Clipboard copy failed'
														);
													}
												}
											} finally {
												closeTextContextMenu();
											}
										}}
									>
										Копировать
									</DesktopAppMenuItem>
								)}
								{(textContextMenu.mode === 'paste' ||
									textContextMenu.mode === 'copy-paste') && (
									<DesktopAppMenuItem
										type="button"
										shortcut={<span className="tabular-nums">Ctrl+V</span>}
										onClick={async () => {
											try {
												const active =
													(textContextMenu.editableElement as HTMLElement | null) ??
													(typeof document !== 'undefined'
														? (document.activeElement as HTMLElement | null)
														: null);
												if (!active) return;
												active.focus();

												if (typeof document !== 'undefined') {
													try {
														// Keep this first and synchronous to preserve user-activation.
														const pasted = document.execCommand('paste');
														if (pasted) {
															return;
														}
													} catch (err) {
														console.warn(
															'[EnhancedWindow] execCommand(paste) failed',
															err
														);
													}
												}

												let text = '';
												if (
													typeof navigator !== 'undefined' &&
													navigator.clipboard?.readText
												) {
													try {
														text = await navigator.clipboard.readText();
													} catch (err) {
														console.error(
															'[EnhancedWindow] Clipboard readText failed',
															err
														);
													}
												}

												if (!text) return;

												if (
													active instanceof HTMLInputElement ||
													active instanceof HTMLTextAreaElement
												) {
													const el = active;
													const start =
														textContextMenu.inputSelection?.start ??
														el.selectionStart ??
														el.value.length;
													const end =
														textContextMenu.inputSelection?.end ??
														el.selectionEnd ??
														el.value.length;
													const nextValue =
														el.value.slice(0, start) +
														text +
														el.value.slice(end);
													const nativeValueSetter =
														Object.getOwnPropertyDescriptor(
															el instanceof HTMLTextAreaElement
																? window.HTMLTextAreaElement.prototype
																: window.HTMLInputElement.prototype,
															'value'
														)?.set;
													if (nativeValueSetter) {
														nativeValueSetter.call(el, nextValue);
													} else {
														el.value = nextValue;
													}
													const pos = start + text.length;
													el.selectionStart = pos;
													el.selectionEnd = pos;
													if (typeof InputEvent !== 'undefined') {
														el.dispatchEvent(
															new InputEvent('input', {
																bubbles: true,
																data: text,
																inputType: 'insertText',
															})
														);
													} else {
														el.dispatchEvent(
															new Event('input', { bubbles: true })
														);
													}
													el.dispatchEvent(
														new Event('change', { bubbles: true })
													);
												} else if (
													active.isContentEditable &&
													typeof window !== 'undefined' &&
													typeof document !== 'undefined'
												) {
													const sel = window.getSelection();
													if (!sel) return;
													let range: Range | null = null;
													const savedRange = textContextRangeRef.current;
													if (
														savedRange &&
														active.contains(savedRange.commonAncestorContainer)
													) {
														range = savedRange.cloneRange();
													} else if (sel.rangeCount > 0) {
														const candidate = sel.getRangeAt(0);
														if (
															active.contains(candidate.commonAncestorContainer)
														) {
															range = candidate;
														}
													}
													if (!range) {
														range = document.createRange();
														range.selectNodeContents(active);
														range.collapse(false);
														sel.removeAllRanges();
														sel.addRange(range);
													}
													range.deleteContents();
													const node = document.createTextNode(text);
													range.insertNode(node);
													range.setStartAfter(node);
													range.collapse(true);
													sel.removeAllRanges();
													sel.addRange(range);
													if (typeof InputEvent !== 'undefined') {
														active.dispatchEvent(
															new InputEvent('input', {
																bubbles: true,
																data: text,
																inputType: 'insertText',
															})
														);
													} else {
														active.dispatchEvent(
															new Event('input', { bubbles: true })
														);
													}
													active.dispatchEvent(
														new Event('change', { bubbles: true })
													);
												} else if (typeof document !== 'undefined') {
													// Final fallback for editable non-input hosts.
													try {
														document.execCommand('insertText', false, text);
													} catch (err) {
														console.error(
															'[EnhancedWindow] execCommand(insertText) failed',
															err
														);
													}
												}
											} catch (err) {
												console.error(
													'[EnhancedWindow] Clipboard paste failed',
													err
												);
											} finally {
												closeTextContextMenu();
											}
										}}
									>
										Вставить
									</DesktopAppMenuItem>
								)}
							</DesktopAppMenuSurface>
						</m.div>
					</DesktopShellFloatingPortal>
				)}
			</>
		);
	}
);

interface AppWindowContentProps {
	win: WindowState;
	visualStyle: DesktopWindowStyle;
	appProps:
		| import('../context/DesktopAppPropsContext').DesktopAppPropsContextValue
		| null;
	contentKey: number;
	onRetry: () => void;
	onClose: () => void;
	onMaximize: () => void;
	onUpdatePayload?: (
		payload: import('../types/desktop.types').WindowInitialPayload
	) => void;
}

// Keep app loading outside the memoized/animated window shell.
// Restored windows must be able to retry Suspense as soon as lazy imports resolve,
// without waiting for an unrelated window state update (move/resize/focus).
const AppWindowContent: React.FC<AppWindowContentProps> = ({
	win,
	visualStyle,
	appProps,
	contentKey,
	onRetry,
	onClose,
	onMaximize,
	onUpdatePayload,
}) => {
	const { t } = useTranslation('desktopUi');
	const resolvedAppComponent = resolveDesktopWindowAppComponent(
		win.appComponent,
		win
	);
	const runtimeAdapter = useDesktopBackgroundAdapter(
		resolvedAppComponent ?? win.appComponent ?? 'unknown'
	);

	useEffect(() => {
		runtimeAdapter.setPausedEffectsCount(
			runtimeAdapter.shouldPauseEffects ? 1 : 0
		);
	}, [runtimeAdapter]);

	const AppContent = getDesktopWindowAppContent(
		resolvedAppComponent ?? undefined,
		appProps,
		win,
		{
			onClose,
			onMaximize,
			onUpdatePayload,
			visualStyle,
		}
	);

	if (win.type === 'app' && AppContent == null) {
		console.warn(
			'[Desktop:Debug] App window: no component',
			JSON.stringify({
				windowId: win.id,
				title: win.title,
				appComponent: win.appComponent ?? '(empty)',
			})
		);
	}

	if (AppContent == null) {
		return (
			<div className="h-full">
				<DesktopAppContentWrapper
					appComponent={win.appComponent}
					windowStyle={visualStyle}
				>
					<DesktopAppEmptyState
						className="h-full"
						icon={
							<Cog6ToothIcon className="w-12 h-12 text-(--desktop-text-dim)" />
						}
						title={t('windowChrome.appNotFound')}
					/>
				</DesktopAppContentWrapper>
			</div>
		);
	}

	if (win.type === 'app' && runtimeAdapter.shouldSuspendAppRuntime) {
		return (
			<div className="h-full">
				<DesktopAppContentWrapper
					appComponent={resolvedAppComponent ?? win.appComponent}
					windowStyle={visualStyle}
				>
					<DesktopAppEmptyState
						className="h-full"
						icon={
							<PauseCircleIcon className="w-12 h-12 text-(--desktop-text-dim)" />
						}
						title={t('windowChrome.paused.title')}
						description={t('windowChrome.paused.description')}
					/>
				</DesktopAppContentWrapper>
			</div>
		);
	}

	const LoadingFallback: React.FC = () => (
		<DesktopAppContentWrapper
			appComponent={win.appComponent}
			windowStyle={visualStyle}
		>
			<div
				role="status"
				aria-live="polite"
				aria-busy="true"
				className="flex h-full min-w-0 flex-col items-center justify-center gap-3 border border-dashed border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/20 p-8 text-(--desktop-text-muted)"
			>
				<div className="animate-spin motion-reduce:animate-none">
					<ArrowPathIcon
						className="h-10 w-10 text-[rgb(var(--desktop-accent-rgb))]"
						aria-hidden="true"
						strokeWidth={DESKTOP_LUCIDE.stroke}
					/>
				</div>
				<p className="text-sm font-medium text-(--desktop-text-primary)">
					{buildDesktopWindowLoadingMessage(t, win)}
				</p>
			</div>
		</DesktopAppContentWrapper>
	);

	const errorFallback = (_errorMessage: string | null) => (
		<DesktopAppContentWrapper
			appComponent={win.appComponent}
			windowStyle={visualStyle}
		>
			<div className="h-full min-h-[200px] flex items-center justify-center p-6">
				<RetryBlock
					message={buildDesktopWindowErrorMessage(t, win)}
					onRetry={onRetry}
					retryLabel={t('windowChrome.retry')}
				/>
			</div>
		</DesktopAppContentWrapper>
	);

	return (
		<div className="h-full">
			<AppErrorBoundary
				key={contentKey}
				fallback={errorFallback}
				appComponent={win.appComponent}
			>
				<Suspense fallback={<LoadingFallback />}>
					<DesktopAppContentWrapper
						appComponent={win.appComponent}
						windowStyle={visualStyle}
					>
						{React.isValidElement(AppContent)
							? AppContent
							: React.createElement(AppContent as React.ComponentType)}
					</DesktopAppContentWrapper>
				</Suspense>
			</AppErrorBoundary>
		</div>
	);
};

EnhancedWindow.displayName = 'EnhancedWindow';
