import { useDesktopWorkspaceCommandAction } from './useDesktopWorkspaceCommandAction';
import type { UseDesktopWorkspaceCommandActionParams } from './useDesktopWorkspaceCommandAction';
import {
	useDesktopWorkspaceHandleAction,
	type UseDesktopWorkspaceHandleActionParams,
} from './useDesktopWorkspaceHandleAction';
import { useDesktopWorkspaceShellModalsProps } from './useDesktopWorkspaceShellModalsProps';

type ShellModalsPropsParams = Parameters<
	typeof useDesktopWorkspaceShellModalsProps
>[0];

export function useDesktopWorkspaceShellModalsChain(params: {
	handleAction: UseDesktopWorkspaceHandleActionParams;
	commandAction: UseDesktopWorkspaceCommandActionParams;
	/** Palette action is produced by this chain — not an input. */
	modals: Omit<ShellModalsPropsParams, 'handleCommandPaletteAction'>;
}) {
	const handleAction = useDesktopWorkspaceHandleAction(params.handleAction);
	const handleCommandPaletteAction = useDesktopWorkspaceCommandAction(
		params.commandAction
	);
	const shellModalsProps = useDesktopWorkspaceShellModalsProps({
		...params.modals,
		handleCommandPaletteAction,
	});

	return { handleAction, handleCommandPaletteAction, shellModalsProps };
}
