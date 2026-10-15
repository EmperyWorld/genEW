/**
 * T23: стабильные колбэки и memo {@link virtualDesktops} для
 * {@link useDesktopWorkspaceShellModalsAndLayoutSlotsCluster} — меньше инлайна
 * и лишних замыканий в {@link DesktopWorkspaceContent}.
 */

import {
	useCallback,
	useMemo,
	type Dispatch,
	type SetStateAction,
} from 'react';
import type { DesktopControlCenterTab } from '../components/DesktopSettingsPanel';
import type { DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams } from './useDesktopWorkspaceShellModalsAndLayoutSlotsCluster';
import type { DesktopItem } from '../types/desktop.types';
import type { DesktopWorkspaceProfile } from '../types/desktopExpansion.types';

export type DesktopWorkspaceShellModalsLayoutDerivedHandlers = Pick<
	DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams,
	| 'onDismissWindowContextMenu'
	| 'onWallpaper'
	| 'onOpenAdmin'
	| 'onCloseShortcutsHelp'
	| 'onCloseSessionPanel'
	| 'virtualDesktops'
>;

export function useDesktopWorkspaceShellModalsLayoutDerivedHandlers(params: {
	setWindowContextMenu: Dispatch<
		SetStateAction<{
			windowId: string;
			x: number;
			y: number;
		} | null>
	>;
	openShellSettings: (
		tab?: DesktopControlCenterTab,
		opts?: { scrollToElementId?: string }
	) => void;
	canOpenUnifiedAdmin: boolean;
	handleOpenWindow: (item: DesktopItem) => void;
	unifiedAdminDesktopItem: DesktopItem;
	setShowShortcutsHelp: (open: boolean) => void;
	setShowSessionInfoPanel: (open: boolean) => void;
	desktops: DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams['virtualDesktops']['desktops'];
	activeDesktopId: DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams['virtualDesktops']['activeDesktopId'];
	createDesktop: DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams['virtualDesktops']['createDesktop'];
	deleteDesktop: DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams['virtualDesktops']['deleteDesktop'];
	switchToDesktop: DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams['virtualDesktops']['switchToDesktop'];
	updateDesktopName: DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams['virtualDesktops']['updateDesktopName'];
	workspaceProfiles: readonly DesktopWorkspaceProfile[];
	onOpenWorkspaceProfile?: (profileId: string) => void;
	vdDropHoverId?: string | null;
}): DesktopWorkspaceShellModalsLayoutDerivedHandlers {
	const {
		setWindowContextMenu,
		openShellSettings,
		canOpenUnifiedAdmin,
		handleOpenWindow,
		unifiedAdminDesktopItem,
		setShowShortcutsHelp,
		setShowSessionInfoPanel,
		desktops,
		activeDesktopId,
		createDesktop,
		deleteDesktop,
		switchToDesktop,
		updateDesktopName,
		workspaceProfiles,
		onOpenWorkspaceProfile,
		vdDropHoverId = null,
	} = params;

	const onDismissWindowContextMenu = useCallback(() => {
		setWindowContextMenu(null);
	}, [setWindowContextMenu]);

	const onWallpaper = useCallback(() => {
		openShellSettings('personalize');
	}, [openShellSettings]);

	const onOpenAdmin = useMemo(
		() =>
			canOpenUnifiedAdmin
				? () => {
						handleOpenWindow(unifiedAdminDesktopItem);
					}
				: undefined,
		[canOpenUnifiedAdmin, handleOpenWindow, unifiedAdminDesktopItem]
	);

	const onCloseShortcutsHelp = useCallback(() => {
		setShowShortcutsHelp(false);
	}, [setShowShortcutsHelp]);

	const onCloseSessionPanel = useCallback(() => {
		setShowSessionInfoPanel(false);
	}, [setShowSessionInfoPanel]);

	const workspaceScenarioCountByDesktopId = useMemo(() => {
		const m: Record<string, number> = {};
		for (const p of workspaceProfiles) {
			const id = p.desktopId?.trim();
			if (!id) continue;
			m[id] = (m[id] ?? 0) + 1;
		}
		return m;
	}, [workspaceProfiles]);

	const workspaceQuickScenarios = useMemo(() => {
		if (!onOpenWorkspaceProfile || workspaceProfiles.length === 0) {
			return undefined;
		}
		return workspaceProfiles.map((p) => ({
			id: p.id,
			name: p.name,
			desktopId: p.desktopId,
		}));
	}, [onOpenWorkspaceProfile, workspaceProfiles]);

	const virtualDesktops = useMemo(
		() => ({
			desktops,
			activeDesktopId,
			createDesktop,
			deleteDesktop,
			switchToDesktop,
			updateDesktopName,
			workspaceScenarioCountByDesktopId,
			workspaceQuickScenarios,
			onOpenWorkspaceQuickScenario: onOpenWorkspaceProfile,
			vdDropHoverId,
		}),
		[
			desktops,
			activeDesktopId,
			createDesktop,
			deleteDesktop,
			switchToDesktop,
			updateDesktopName,
			workspaceScenarioCountByDesktopId,
			workspaceQuickScenarios,
			onOpenWorkspaceProfile,
			vdDropHoverId,
		]
	);

	return {
		onDismissWindowContextMenu,
		onWallpaper,
		onOpenAdmin,
		onCloseShortcutsHelp,
		onCloseSessionPanel,
		virtualDesktops,
	};
}
