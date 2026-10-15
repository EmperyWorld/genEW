/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Renders the desktop window stack and delegates each window to `EnhancedWindow`.
 * Owns snap preview visibility, active/tab-visible signals, and per-window memoized row wiring.
 *
 * Invariants:
 * - Window rows stay stable under drag/resize; callbacks are passed through without allocating extra chrome actions per render.
 * - `AnimatePresence` remains the single window animation boundary for app and folder windows.
 *
 * Related:
 * - EnhancedWindow.tsx
 * - utils/subscribeDocumentVisibleSync.ts
 */

import { AnimatePresence } from 'framer-motion';
import * as React from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopWindowStyle } from '../../../types/profile';
import type {
	BeforeCloseHandler,
	DesktopItem,
	SnapZone,
	WindowInitialPayload,
	WindowState,
} from '../types/desktop.types';
import { EnhancedWindow } from './EnhancedWindow';
import { SnapPreview } from './SnapPreview';
import { DesktopSnapTeachOverlay } from './DesktopSnapTeachOverlay';
import { isDesktopLowGpuModeEnabled } from '../runtime/desktopLowGpuMode';
import { subscribeDocumentVisibilityChange } from '../utils/subscribeDocumentVisibleSync';
import { getAppStoreWindowInstanceCap } from '../utils/appStoreWindowPolicy';
import { resolveVirtualDesktopDropTarget } from '../utils/desktopVirtualDesktopDrop';

export interface DesktopWindowLayerProps {
	currentDesktopWindows: WindowState[];
	/** Desktop items (for folder windows: resolve folderItem by folderId) */
	desktopItems?: DesktopItem[];
	/** Для подсказки «сколько окон» в заголовке (витрина / установленные). */
	installedApps?: DesktopItem[];
	activeWindowId: string | null;
	snapZone: SnapZone;
	onClose: (windowId: string) => void;
	onMinimize: (windowId: string) => void;
	onMaximize: (windowId: string) => void;
	onFocus: (windowId: string) => void;
	onMove: (windowId: string, x: number, y: number) => void;
	onResize: (windowId: string, width: number, height: number) => void;
	onDrag: (windowId: string, x: number, y: number) => void;
	/** Сразу зафиксировать позицию при отпускании (после throttled onDrag). */
	onDragCommit: (windowId: string, x: number, y: number) => void;
	updateSnapZone: (clientX: number, clientY: number) => void;
	getSnapZoneForPosition: (clientX: number, clientY: number) => SnapZone;
	clearSnapZone: () => void;
	snapWindow: (windowId: string, zone: SnapZone) => void;
	registerBeforeClose: (id: string, fn: BeforeCloseHandler) => void;
	unregisterBeforeClose: (id: string) => void;
	updateWindowPayload?: (
		windowId: string,
		payload: WindowInitialPayload
	) => void;
	retargetFolderWindow?: (
		windowId: string,
		target: { folderId: string; title: string; path: string[] }
	) => void;
	visualStyle?: DesktopWindowStyle;
	/** Полноэкранная сетка snap на время перетаскивания окна. */
	snapLayoutPickerOpen?: boolean;
	activeDesktopId?: string;
	moveWindowToDesktop?: (windowId: string, desktopId: string) => void;
	onVdDropHover?: (desktopId: string | null) => void;
	onToggleAlwaysOnTop?: (windowId: string) => void;
}

/** Стабильная заглушка для react.memo внутри строки окна. */
function windowDragStartNoop() {}

type DesktopWindowLayerRowProps = {
	win: WindowState;
	isActive: boolean;
	isTabVisible: boolean;
	folderItem: DesktopItem | null;
	installedApps?: DesktopItem[];
	visualStyle: DesktopWindowStyle;
	onClose: (windowId: string) => void;
	onMinimize: (windowId: string) => void;
	onMaximize: (windowId: string) => void;
	onFocus: (windowId: string) => void;
	onDrag: (windowId: string, x: number, y: number) => void;
	onDragCommit: (windowId: string, x: number, y: number) => void;
	onResize: (windowId: string, width: number, height: number) => void;
	updateSnapZone: (clientX: number, clientY: number) => void;
	getSnapZoneForPosition: (clientX: number, clientY: number) => SnapZone;
	clearSnapZone: () => void;
	snapWindow: (windowId: string, zone: SnapZone) => void;
	registerBeforeClose: (id: string, fn: BeforeCloseHandler) => void;
	unregisterBeforeClose: (id: string) => void;
	updateWindowPayload?: (
		windowId: string,
		payload: WindowInitialPayload
	) => void;
	retargetFolderWindow?: (
		windowId: string,
		target: { folderId: string; title: string; path: string[] }
	) => void;
	activeDesktopId?: string;
	moveWindowToDesktop?: (windowId: string, desktopId: string) => void;
	onVdDropHover?: (desktopId: string | null) => void;
	onToggleAlwaysOnTop?: (windowId: string) => void;
};

const DesktopWindowLayerRow = memo(function DesktopWindowLayerRow({
	win,
	isActive,
	isTabVisible,
	folderItem,
	installedApps,
	visualStyle,
	onClose,
	onMinimize,
	onMaximize,
	onFocus,
	onDrag,
	onDragCommit,
	onResize,
	updateSnapZone,
	getSnapZoneForPosition,
	clearSnapZone,
	snapWindow,
	registerBeforeClose,
	unregisterBeforeClose,
	updateWindowPayload,
	retargetFolderWindow,
	activeDesktopId,
	moveWindowToDesktop,
	onVdDropHover,
	onToggleAlwaysOnTop,
}: DesktopWindowLayerRowProps) {
	const id = win.id;
	const { t } = useTranslation('desktopUi');
	const storeInstancePolicyLabel = useMemo(() => {
		if (win.type !== 'app' || !win.appComponent || !installedApps?.length) {
			return undefined;
		}
		const app = installedApps.find(
			(a) =>
				a.type === 'app' &&
				a.appComponent &&
				a.appComponent === win.appComponent
		);
		if (!app) return undefined;
		const cap = getAppStoreWindowInstanceCap({
			allow_multiple_windows: app.allowMultipleWindows,
			max_window_instances: app.maxWindowInstances,
		});
		if (!cap.allowsMultipleInstances || cap.maxInstances <= 1) {
			return undefined;
		}
		return t('titleBarChrome.instancePolicyMultiple', {
			count: cap.maxInstances,
		});
	}, [installedApps, t, win.appComponent, win.type]);

	const handleClose = useCallback(() => onClose(id), [onClose, id]);
	const handleMinimize = useCallback(() => onMinimize(id), [onMinimize, id]);
	const handleMaximize = useCallback(() => onMaximize(id), [onMaximize, id]);
	const handleFocus = useCallback(() => onFocus(id), [onFocus, id]);
	const handleToggleAlwaysOnTop = useCallback(() => {
		onToggleAlwaysOnTop?.(id);
	}, [onToggleAlwaysOnTop, id]);

	const handleDrag = useCallback(
		(x: number, y: number, pointer: { clientX: number; clientY: number }) => {
			onDrag(id, x, y);
			updateSnapZone(pointer.clientX, pointer.clientY);
			onVdDropHover?.(
				resolveVirtualDesktopDropTarget(pointer.clientX, pointer.clientY)
			);
		},
		[onDrag, onVdDropHover, updateSnapZone, id]
	);

	const handleDragEnd = useCallback(
		(
			x: number,
			y: number,
			pointer: { clientX: number; clientY: number } | null
		) => {
			onDragCommit(id, x, y);
			if (pointer && moveWindowToDesktop) {
				const targetDesktopId = resolveVirtualDesktopDropTarget(
					pointer.clientX,
					pointer.clientY
				);
				onVdDropHover?.(null);
				if (
					targetDesktopId &&
					activeDesktopId &&
					targetDesktopId !== activeDesktopId
				) {
					moveWindowToDesktop(id, targetDesktopId);
					clearSnapZone();
					return;
				}
			}
			onVdDropHover?.(null);
			if (pointer) {
				snapWindow(
					id,
					getSnapZoneForPosition(pointer.clientX, pointer.clientY)
				);
			}
			clearSnapZone();
		},
		[
			activeDesktopId,
			clearSnapZone,
			getSnapZoneForPosition,
			id,
			moveWindowToDesktop,
			onDragCommit,
			onVdDropHover,
			snapWindow,
		]
	);

	const handleResize = useCallback(
		(w: number, h: number) => onResize(id, w, h),
		[onResize, id]
	);

	const handleUpdatePayload = useCallback(
		(payload: WindowInitialPayload) => {
			updateWindowPayload?.(id, payload);
		},
		[updateWindowPayload, id]
	);

	const handleRetargetFolder = useCallback(
		(target: { folderId: string; title: string; path: string[] }) => {
			retargetFolderWindow?.(id, target);
		},
		[retargetFolderWindow, id]
	);

	return (
		<EnhancedWindow
			desktopWindow={win}
			folderItem={folderItem}
			isActive={isActive}
			isTabVisible={isTabVisible}
			onClose={handleClose}
			onMinimize={handleMinimize}
			onMaximize={handleMaximize}
			onFocus={handleFocus}
			onDragStart={windowDragStartNoop}
			onDrag={handleDrag}
			onDragEnd={handleDragEnd}
			onResize={handleResize}
			registerBeforeClose={registerBeforeClose}
			unregisterBeforeClose={unregisterBeforeClose}
			onUpdatePayload={updateWindowPayload ? handleUpdatePayload : undefined}
			onRetargetFolder={retargetFolderWindow ? handleRetargetFolder : undefined}
			visualStyle={visualStyle}
			storeInstancePolicyLabel={storeInstancePolicyLabel}
			alwaysOnTop={win.alwaysOnTop === true}
			onToggleAlwaysOnTop={
				onToggleAlwaysOnTop ? handleToggleAlwaysOnTop : undefined
			}
		/>
	);
});

DesktopWindowLayerRow.displayName = 'DesktopWindowLayerRow';

const DesktopWindowLayerInner: React.FC<DesktopWindowLayerProps> = ({
	currentDesktopWindows,
	desktopItems = [],
	installedApps = [],
	activeWindowId,
	snapZone,
	onClose,
	onMinimize,
	onMaximize,
	onFocus,
	onMove: _onMove,
	onResize,
	onDrag,
	onDragCommit,
	updateSnapZone,
	getSnapZoneForPosition,
	clearSnapZone,
	snapWindow,
	registerBeforeClose,
	unregisterBeforeClose,
	updateWindowPayload,
	retargetFolderWindow,
	snapLayoutPickerOpen = false,
	visualStyle = 'glass',
	activeDesktopId,
	moveWindowToDesktop,
	onVdDropHover,
	onToggleAlwaysOnTop,
}) => {
	const lowGpuWindowsEnabled = useMemo(() => isDesktopLowGpuModeEnabled(), []);
	const folderItemsById = useMemo(
		() =>
			new Map(
				desktopItems
					.filter((item) => item.type === 'folder')
					.map((item) => [item.id, item] as const)
			),
		[desktopItems]
	);

	const renderedWindows = useMemo(() => {
		// Все окна остаются в DOM при сворачивании — иначе размонтируется контент и теряется state приложений.
		return currentDesktopWindows;
	}, [currentDesktopWindows]);

	const [isTabVisible, setIsTabVisible] = useState(() => {
		if (typeof document === 'undefined') return true;
		return document.visibilityState === 'visible';
	});

	useEffect(() => {
		return subscribeDocumentVisibilityChange(() => {
			setIsTabVisible(document.visibilityState === 'visible');
		});
	}, []);

	return (
		<div
			className={`absolute inset-0 z-2 min-h-0 min-w-0 pointer-events-none ${
				lowGpuWindowsEnabled ? 'desktop-low-gpu-windows' : ''
			}`}
		>
			{lowGpuWindowsEnabled ? (
				<style>
					{`
						.desktop-low-gpu-windows [data-desktop-window],
						.desktop-low-gpu-windows [data-desktop-window] * {
							backdrop-filter: none !important;
							-webkit-backdrop-filter: none !important;
							filter: none !important;
						}
						.desktop-low-gpu-windows [data-desktop-window] {
							box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32) !important;
							background-color: rgb(var(--desktop-bg-primary-rgb) / 0.9) !important;
						}
						.desktop-low-gpu-windows [data-desktop-window] [class*="shadow-"] {
							box-shadow: none !important;
						}
						.desktop-low-gpu-windows [data-desktop-window] [class*="transition-"] {
							transition: none !important;
						}
					`}
				</style>
			) : null}
			<SnapPreview
				zone={snapZone}
				show={!!snapZone}
				pickerOpen={snapLayoutPickerOpen}
				lowGpu={lowGpuWindowsEnabled}
			/>
			<DesktopSnapTeachOverlay snapPickerOpen={snapLayoutPickerOpen} />

			<AnimatePresence initial={false}>
				{renderedWindows.map((win) => (
					<DesktopWindowLayerRow
						key={win.id}
						win={win}
						folderItem={
							win.type === 'folder' && win.folderId
								? (folderItemsById.get(win.folderId) ?? null)
								: null
						}
						installedApps={installedApps}
						isActive={win.id === activeWindowId}
						isTabVisible={isTabVisible}
						visualStyle={visualStyle}
						onClose={onClose}
						onMinimize={onMinimize}
						onMaximize={onMaximize}
						onFocus={onFocus}
						onDrag={onDrag}
						onDragCommit={onDragCommit}
						onResize={onResize}
						updateSnapZone={updateSnapZone}
						getSnapZoneForPosition={getSnapZoneForPosition}
						clearSnapZone={clearSnapZone}
						snapWindow={snapWindow}
						registerBeforeClose={registerBeforeClose}
						unregisterBeforeClose={unregisterBeforeClose}
						updateWindowPayload={updateWindowPayload}
						retargetFolderWindow={retargetFolderWindow}
						activeDesktopId={activeDesktopId}
						moveWindowToDesktop={moveWindowToDesktop}
						onVdDropHover={onVdDropHover}
						onToggleAlwaysOnTop={onToggleAlwaysOnTop}
					/>
				))}
			</AnimatePresence>
		</div>
	);
};

export const DesktopWindowLayer = memo<DesktopWindowLayerProps>(
	DesktopWindowLayerInner
);
DesktopWindowLayer.displayName = 'DesktopWindowLayer';
