/**
 * Taskbar + optional virtual-desktop strip (hidden on compact / mobile layout).
 */
import { useMemo } from 'react';
import type { ComponentProps } from 'react';
import { Taskbar } from './Taskbar';
import { VirtualDesktops } from './VirtualDesktops';
import { VirtualDesktopsCompactMenu } from './VirtualDesktopsCompactMenu';
import type { VirtualDesktopsProps } from './VirtualDesktops';

type TaskbarOnlyProps = Omit<ComponentProps<typeof Taskbar>, 'children'>;

export interface DesktopWorkspaceTaskbarProps extends TaskbarOnlyProps {
	/** When false (e.g. mobile), the virtual-desktop strip is not rendered. */
	showVirtualDesktopStrip: boolean;
	virtualDesktops: Pick<
		VirtualDesktopsProps,
		| 'desktops'
		| 'activeDesktopId'
		| 'createDesktop'
		| 'deleteDesktop'
		| 'switchToDesktop'
		| 'updateDesktopName'
		| 'workspaceScenarioCountByDesktopId'
		| 'workspaceQuickScenarios'
		| 'onOpenWorkspaceQuickScenario'
	>;
}

export function DesktopWorkspaceTaskbar({
	showVirtualDesktopStrip,
	virtualDesktops,
	...taskbarProps
}: DesktopWorkspaceTaskbarProps) {
	const activeDesktopIndex = useMemo(
		() =>
			virtualDesktops.desktops.findIndex(
				(d) => d.id === virtualDesktops.activeDesktopId
			),
		[virtualDesktops.desktops, virtualDesktops.activeDesktopId]
	);

	return (
		<Taskbar {...taskbarProps}>
			{showVirtualDesktopStrip ? (
				<VirtualDesktops
					{...virtualDesktops}
					activeDesktopIndex={activeDesktopIndex}
				/>
			) : (
				<VirtualDesktopsCompactMenu {...virtualDesktops} />
			)}
		</Taskbar>
	);
}
