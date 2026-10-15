/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Main desktop workspace router: windows, virtual desktops, installed apps, overlays, and **`EwaCompanionShellBridge`**
 * snapshots for **`/ewa/companion-chat`** (`includeAllVirtualDesktops`) — lazy-loaded from `DesktopWorkspace`.
 * Wave A1.1: hook orchestration lives in head/tail/view-model clusters; this file is render branches only.
 *
 * Invariants:
 * - Lazy-loaded chunk (avoid TDZ / circular imports with `DesktopWorkspace`).
 *
 * Related:
 * - `DesktopWorkspace.tsx`, `DesktopWorkspaceShellProviders.tsx`, `useDesktopWorkspaceContentViewModel.ts`
 */

import * as React from 'react';
import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { EliteRecoveryScreen } from '@/components/ui/EliteRecoveryScreen';
import { MOBILE_EMBEDDED_APP_ROOT_CLASS } from '@/components/mobileEmbedded/mobileEmbeddedLayoutTokens';
import { cn } from '@/utils/cn';
import { performRecoveryConnectionCheck } from '@/services/maintenance/reloadCircuitBreaker';
import { DesktopWorkspaceLoadingShell } from './components/DesktopWorkspaceLoadingShell';
import { DesktopMaintenanceOverlay } from './components/DesktopMaintenanceOverlay';
import { DesktopWindowLayoutPresetApplyDialog } from './components/DesktopWindowLayoutPresetApplyDialog';
import { DesktopWorkspaceShellLayout } from './components/DesktopWorkspaceShellLayout';
import { DesktopShellMotionPrefsProvider } from './context/DesktopShellMotionPrefsContext';
import { DesktopWorkspaceShellProviders } from './components/DesktopWorkspaceShellProviders';
import type { UseDesktopStorageReturn } from './hooks/useDesktopStorage';
import { useDesktopWorkspaceContentViewModel } from './hooks/useDesktopWorkspaceContentViewModel';
import { DesktopTaskbarShellPrefsProvider } from './hooks/useDesktopTaskbarShellPrefs';

const DesktopSettingsPanel = lazy(() =>
	import('./components/DesktopSettingsPanel').then((m) => ({
		default: m.DesktopSettingsPanel,
	}))
);
const DesktopModalsLayer = lazy(() =>
	import('./components/DesktopModalsLayer').then((m) => ({
		default: m.DesktopModalsLayer,
	}))
);
const NewFolderDialog = lazy(() =>
	import('./components/NewFolderDialog').then((m) => ({
		default: m.NewFolderDialog,
	}))
);

/** Re-exports for tests and callers that imported from this module. */
export {
	buildContentManagerOpenPayload,
	buildGafChatOpenPayload,
	canResolveInstalledDesktopApps,
	filterRestoredWindows,
	findVoiceCommandLauncherItem,
} from './utils/desktopOpenPayloads';

/** Inner content that consumes DesktopStateContext */
const DesktopWorkspaceContentInner: React.FC<{
	storage: UseDesktopStorageReturn;
	embeddedMobileSettingsOnly?: boolean;
}> = ({ storage, embeddedMobileSettingsOnly = false }) => {
	const vm = useDesktopWorkspaceContentViewModel({ storage });
	const { t } = useTranslation('desktopUi');

	const {
		showStoragePreloader,
		loadingShellProps,
		loadFailure,
		config,
		loadFailureMessage,
		clearLoadFailure,
		refreshForPersistenceShell,
		performance,
		desktopGafOpenActions,
		appPropsValue,
		shellSettingsBridge,
		showWP,
		setShowWP,
		wallpaper,
		handleWallpaperChange,
		handleRemoveUserWallpaper,
		desktopWindowStyle,
		desktopIconStyle,
		layoutPresetApplyPrompt,
		setLayoutPresetApplyPrompt,
		currentDesktopWindows,
		executeApplyWindowLayoutPreset,
		shellMotionPrefs,
		companionShellBridge,
		editFolderIconTarget,
		onCloseEditFolderIcon,
		handleSaveFolderIcon,
		shellLayoutRootProps,
		shellCanvasProps,
		windowContextMenuProps,
		windowLayerProps,
		shellTaskbarProps,
		helpAndSessionProps,
		appStoreLayerProps,
		shellSearchOverlaysProps,
		shellModalsProps,
		assistantSelectionRail,
		desktopMaintenanceOverlay,
	} = vm;

	if (showStoragePreloader) {
		return <DesktopWorkspaceLoadingShell {...loadingShellProps} />;
	}

	if (loadFailure && !config) {
		return (
			<EliteRecoveryScreen
				title={t('workspace.loadRecoveryTitle')}
				description={loadFailureMessage ?? t('workspace.loadError.unknown')}
				statusLabel={t('workspace.loadRecoveryStatus')}
				panelVariant="recovery"
				actionLabel={t('workspace.checkConnection')}
				actionPendingLabel={t('workspace.checkConnectionPending')}
				onAction={async () => {
					const ready = await performRecoveryConnectionCheck();
					if (ready) {
						clearLoadFailure();
						await refreshForPersistenceShell();
					}
				}}
				footnote={t('workspace.loadRecoveryFootnote')}
			/>
		);
	}

	if (embeddedMobileSettingsOnly) {
		return (
			<DesktopWorkspaceShellProviders
				aggressiveBackgroundSuspend={
					performance.preferAggressiveBackgroundSuspend
				}
				gafActions={desktopGafOpenActions}
				appProps={appPropsValue}
			>
				<div
					data-embedded-mobile="1"
					data-desktop-settings-root="1"
					className={cn(
						'flex h-full min-h-0 flex-col overflow-hidden',
						MOBILE_EMBEDDED_APP_ROOT_CLASS
					)}
				>
					<Suspense fallback={null}>
						<DesktopSettingsPanel
							{...shellSettingsBridge}
							isOpen
							onClose={() => {}}
							presentation="embedded"
							embeddedMobile
						/>
					</Suspense>
				</div>
				<Suspense fallback={null}>
					<DesktopModalsLayer
						showWallpaper={showWP}
						onCloseWallpaper={() => setShowWP(false)}
						wallpaper={wallpaper}
						wallpaperHistory={config?.wallpaper_history}
						onWallpaperChange={handleWallpaperChange}
						onRemoveUserWallpaper={handleRemoveUserWallpaper}
						onOpenWallpaperPicker={() => setShowWP(true)}
						showNewFolder={false}
						onCloseNewFolder={() => {}}
						onCreateFolder={async () => {}}
						desktopWindowStyle={desktopWindowStyle}
						desktopIconStyle={desktopIconStyle}
						showCommandPalette={false}
						onCloseCommandPalette={() => {}}
						items={[]}
						onOpenItem={() => {}}
						onCommandAction={() => {}}
						showClipboard={false}
						onCloseClipboard={() => {}}
					/>
				</Suspense>
				<DesktopWindowLayoutPresetApplyDialog
					isOpen={layoutPresetApplyPrompt != null}
					preset={layoutPresetApplyPrompt}
					openWindowCount={currentDesktopWindows.length}
					onClose={() => setLayoutPresetApplyPrompt(null)}
					onReplace={(preset) => {
						executeApplyWindowLayoutPreset(preset, 'replace');
						setLayoutPresetApplyPrompt(null);
					}}
					onAdd={(preset) => {
						executeApplyWindowLayoutPreset(preset, 'add');
						setLayoutPresetApplyPrompt(null);
					}}
				/>
			</DesktopWorkspaceShellProviders>
		);
	}

	return (
		<DesktopShellMotionPrefsProvider value={shellMotionPrefs}>
			<DesktopWorkspaceShellProviders
				aggressiveBackgroundSuspend={
					performance.preferAggressiveBackgroundSuspend
				}
				gafActions={desktopGafOpenActions}
				appProps={appPropsValue}
				companionShellBridge={companionShellBridge}
			>
				{editFolderIconTarget != null ? (
					<Suspense fallback={null}>
						<NewFolderDialog
							isOpen
							onClose={onCloseEditFolderIcon}
							mode="editIcon"
							initialName={editFolderIconTarget.name}
							initialIconId={editFolderIconTarget.folderIconId}
							onSaveIcon={handleSaveFolderIcon}
						/>
					</Suspense>
				) : null}
				<DesktopWindowLayoutPresetApplyDialog
					isOpen={layoutPresetApplyPrompt != null}
					preset={layoutPresetApplyPrompt}
					openWindowCount={currentDesktopWindows.length}
					onClose={() => setLayoutPresetApplyPrompt(null)}
					onReplace={(preset) => {
						executeApplyWindowLayoutPreset(preset, 'replace');
						setLayoutPresetApplyPrompt(null);
					}}
					onAdd={(preset) => {
						executeApplyWindowLayoutPreset(preset, 'add');
						setLayoutPresetApplyPrompt(null);
					}}
				/>
				<DesktopWorkspaceShellLayout
					{...shellLayoutRootProps}
					canvas={shellCanvasProps}
					windowContextMenu={windowContextMenuProps}
					windowLayer={windowLayerProps}
					taskbar={shellTaskbarProps}
					helpAndSession={helpAndSessionProps}
					appStoreLayer={appStoreLayerProps}
					searchOverlays={shellSearchOverlaysProps}
					modals={shellModalsProps}
					assistantSelectionRail={assistantSelectionRail}
				/>
				{desktopMaintenanceOverlay ? (
					<DesktopMaintenanceOverlay
						windowId={desktopMaintenanceOverlay.windowId}
						title={desktopMaintenanceOverlay.title}
						message={desktopMaintenanceOverlay.message}
						statusLabel={desktopMaintenanceOverlay.statusLabel}
						footnote={t('workspace.loadRecoveryFootnote')}
					/>
				) : null}
			</DesktopWorkspaceShellProviders>
		</DesktopShellMotionPrefsProvider>
	);
};

const DesktopWorkspaceContentWithShellPrefs: React.FC<{
	storage: UseDesktopStorageReturn;
	embeddedMobileSettingsOnly?: boolean;
}> = (props) => {
	const { user: authUser } = useAuth();
	return (
		<DesktopTaskbarShellPrefsProvider userId={authUser?.id}>
			<DesktopWorkspaceContentInner {...props} />
		</DesktopTaskbarShellPrefsProvider>
	);
};

const DesktopWorkspaceContent: React.FC<{
	storage: UseDesktopStorageReturn;
	embeddedMobileSettingsOnly?: boolean;
}> = (props) => <DesktopWorkspaceContentWithShellPrefs {...props} />;

export default DesktopWorkspaceContent;
