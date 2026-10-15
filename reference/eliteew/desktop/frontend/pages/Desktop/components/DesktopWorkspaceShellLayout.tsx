/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Structural desktop shell: skip-link, main, canvas, taskbar, and on-demand overlays.
 * Heavy overlays (search, app store, window layer, live voice) mount only when needed.
 *
 * Invariants:
 * - Idle `#desktop` must not download AppStore / QuickSearch / LiveVoice / WindowLayer chunks.
 * - No static framer-motion import in this shell file (LayoutGroup removed).
 *
 * Related:
 * - DesktopWorkspaceContent.tsx, LiveVoiceDesktopPipelineGate.tsx
 */

import type { DesktopWindowStyle } from '@/types/profile';
import * as React from 'react';
import { Suspense, lazy, useMemo } from 'react';
import type { DesktopShellSettingsBridgeValue } from '../context/DesktopShellSettingsBridgeContext';
import { DesktopShellFrameProvider } from '../context/DesktopShellFrameContext';
import { DesktopShellSettingsBridgeProvider } from '../context/DesktopShellSettingsBridgeContext';
import { DESKTOP_INTERACTIVE, DESKTOP_Z_INDEX } from '../constants';
import { clampDesktopUiScale } from '../utils/desktopUiScale';
import { DesktopVoiceBridge } from './DesktopVoiceBridge';
import type { DesktopWorkspaceAppStoreLayerProps } from './DesktopWorkspaceAppStoreLayer';
import {
	DesktopWorkspaceCanvas,
	type DesktopWorkspaceCanvasProps,
} from './DesktopWorkspaceCanvas';
import {
	DesktopWorkspaceHelpAndSession,
	type DesktopWorkspaceHelpAndSessionProps,
} from './DesktopWorkspaceHelpAndSession';
import type { DesktopWorkspaceSearchOverlaysProps } from './DesktopWorkspaceSearchOverlays';
import type { DesktopModalsLayerProps } from './DesktopModalsLayer';
import type { DesktopWindowLayerProps } from './DesktopWindowLayer';
import {
	DesktopWorkspaceTaskbar,
	type DesktopWorkspaceTaskbarProps,
} from './DesktopWorkspaceTaskbar';
import { DesktopWorkspaceWindowContextMenu } from './DesktopWorkspaceWindowContextMenu';
import type { DesktopWorkspaceWindowContextMenuProps } from './DesktopWorkspaceWindowContextMenu';
import { VoiceCommandOnDemandMount } from './VoiceCommandOnDemandMount';
import { LiveVoiceDesktopPipelineGate } from './LiveVoiceDesktopPipelineGate';

const DesktopWindowLayer = lazy(() =>
	import('./DesktopWindowLayer').then((m) => ({
		default: m.DesktopWindowLayer,
	}))
);
const DesktopWorkspaceSearchOverlays = lazy(() =>
	import('./DesktopWorkspaceSearchOverlays').then((m) => ({
		default: m.DesktopWorkspaceSearchOverlays,
	}))
);
const DesktopWorkspaceAppStoreLayer = lazy(() =>
	import('./DesktopWorkspaceAppStoreLayer').then((m) => ({
		default: m.DesktopWorkspaceAppStoreLayer,
	}))
);
const DesktopModalsLayer = lazy(() =>
	import('./DesktopModalsLayer').then((m) => ({
		default: m.DesktopModalsLayer,
	}))
);

export interface DesktopWorkspaceShellLayoutProps {
	openVoiceCommandCenter: () => void;
	skipToContentLabel: string;
	iconsKeyboardHint: string;
	iconsKeyboardHintId: string;
	workspaceShellCss: string;
	desktopAreaRef: React.RefObject<HTMLElement | null>;
	effectiveTheme: string;
	isWorkspaceDragging: boolean;
	mainAriaLabel: string;
	desktopMainSurfaceStyle: React.CSSProperties;
	desktopWindowStyle: DesktopWindowStyle;
	shellSettingsBridge: DesktopShellSettingsBridgeValue;
	desktopUiScale: number;
	/** Wave 2: hook for per-space chrome / CSS (optional). */
	activeVirtualDesktopId?: string;
	activeVirtualDesktopName?: string;
	canvas: DesktopWorkspaceCanvasProps;
	windowContextMenu: DesktopWorkspaceWindowContextMenuProps;
	windowLayer: DesktopWindowLayerProps;
	taskbar: DesktopWorkspaceTaskbarProps;
	helpAndSession: DesktopWorkspaceHelpAndSessionProps;
	appStoreLayer: DesktopWorkspaceAppStoreLayerProps;
	searchOverlays: DesktopWorkspaceSearchOverlaysProps;
	modals: DesktopModalsLayerProps;
	hasOpenStudioGUWindow: boolean;
	/** Wave 7: Assistant/GAF quick actions when desktop icons selected (root scope). */
	assistantSelectionRail?: React.ReactNode;
}

function searchOverlaysNeeded(
	searchOverlays: DesktopWorkspaceSearchOverlaysProps
): boolean {
	return (
		Boolean(searchOverlays.taskSwitcher.isOpen) ||
		Boolean(searchOverlays.quickSearch.isOpen)
	);
}

function modalsNeeded(modals: DesktopModalsLayerProps): boolean {
	return (
		modals.showWallpaper ||
		modals.showNewFolder ||
		modals.showCommandPalette ||
		modals.showClipboard
	);
}

export function DesktopWorkspaceShellLayout({
	openVoiceCommandCenter,
	skipToContentLabel,
	iconsKeyboardHint,
	iconsKeyboardHintId,
	workspaceShellCss,
	desktopAreaRef,
	effectiveTheme,
	isWorkspaceDragging,
	mainAriaLabel,
	desktopMainSurfaceStyle,
	desktopWindowStyle,
	shellSettingsBridge,
	desktopUiScale,
	activeVirtualDesktopId,
	activeVirtualDesktopName,
	canvas,
	windowContextMenu,
	windowLayer,
	taskbar,
	helpAndSession,
	appStoreLayer,
	searchOverlays,
	modals,
	hasOpenStudioGUWindow,
	assistantSelectionRail,
}: DesktopWorkspaceShellLayoutProps): React.JSX.Element {
	const uiScale = clampDesktopUiScale(desktopUiScale);
	const hasOpenWindows = useMemo(
		() => (windowLayer.currentDesktopWindows?.length ?? 0) > 0,
		[windowLayer.currentDesktopWindows]
	);
	const showSearchOverlays = searchOverlaysNeeded(searchOverlays);
	const showModals = modalsNeeded(modals);
	const showAppStore = Boolean(appStoreLayer.showAppStore);

	return (
		<>
			<DesktopVoiceBridge openVoiceCommandCenter={openVoiceCommandCenter} />
			<a
				href="#desktop-main"
				className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.55)] ${DESKTOP_INTERACTIVE.btnPrimary}`}
				style={{ zIndex: DESKTOP_Z_INDEX.SKIP_LINK }}
			>
				{skipToContentLabel}
			</a>
			<p id={iconsKeyboardHintId} className="sr-only">
				{iconsKeyboardHint}
			</p>
			<style>{workspaceShellCss}</style>
			<main
				id="desktop-main"
				ref={desktopAreaRef}
				tabIndex={-1}
				aria-label={mainAriaLabel}
				aria-describedby={iconsKeyboardHintId}
				data-theme={effectiveTheme}
				data-desktop-dragging={isWorkspaceDragging ? 'true' : undefined}
				data-active-virtual-desktop-id={activeVirtualDesktopId || undefined}
				data-active-virtual-desktop-name={activeVirtualDesktopName || undefined}
				className={`desktop-workspace-shell relative min-h-0 h-screen w-full overflow-hidden overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)] focus-visible:ring-inset ${effectiveTheme === 'dark' ? 'dark' : ''}`}
				style={desktopMainSurfaceStyle}
			>
				<DesktopShellFrameProvider windowStyle={desktopWindowStyle}>
					<DesktopShellSettingsBridgeProvider value={shellSettingsBridge}>
						<div className="absolute inset-0 min-h-0 overflow-hidden">
							<div
								className="absolute top-0 left-0 min-h-0 origin-top-left"
								style={{
									width: `calc(100% / ${uiScale})`,
									height: `calc(100% / ${uiScale})`,
									transform: `scale(${uiScale})`,
								}}
								data-desktop-ui-scale={String(uiScale)}
							>
								<DesktopWorkspaceCanvas {...canvas} />
								<DesktopWorkspaceWindowContextMenu {...windowContextMenu} />
								{hasOpenWindows ? (
									<Suspense fallback={null}>
										<DesktopWindowLayer {...windowLayer} />
									</Suspense>
								) : null}
								{assistantSelectionRail}
								<DesktopWorkspaceTaskbar {...taskbar} />
								<DesktopWorkspaceHelpAndSession {...helpAndSession} />
								{showAppStore ? (
									<Suspense fallback={null}>
										<DesktopWorkspaceAppStoreLayer {...appStoreLayer} />
									</Suspense>
								) : null}
								{showSearchOverlays ? (
									<Suspense fallback={null}>
										<DesktopWorkspaceSearchOverlays {...searchOverlays} />
									</Suspense>
								) : null}
							</div>
						</div>

						{showModals ? (
							<Suspense fallback={null}>
								<DesktopModalsLayer {...modals} />
							</Suspense>
						) : null}
					</DesktopShellSettingsBridgeProvider>
				</DesktopShellFrameProvider>
			</main>

			<VoiceCommandOnDemandMount
				hasOpenStudioGUWindow={hasOpenStudioGUWindow}
			/>
			<LiveVoiceDesktopPipelineGate />
		</>
	);
}
