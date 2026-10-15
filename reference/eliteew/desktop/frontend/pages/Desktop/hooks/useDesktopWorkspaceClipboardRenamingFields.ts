import type { DesktopItem } from '../types/desktop.types';

export function useDesktopWorkspaceClipboardRenamingFields(params: {
	clipboard: DesktopItem[];
	clipboardAction: 'copy' | 'cut' | null;
	renamingId: string | null;
	setClipboardItems: (
		items: DesktopItem[],
		action: 'copy' | 'cut' | null
	) => void;
	setRenamingId: (v: string | null) => void;
}) {
	const {
		clipboard,
		clipboardAction,
		renamingId,
		setClipboardItems,
		setRenamingId,
	} = params;

	const setClipboard = (items: DesktopItem[], action: 'copy' | 'cut' | null) =>
		setClipboardItems(items, action);

	return {
		clipboard,
		clipboardAction,
		setClipboard,
		renamingId,
		setRenamingId,
	};
}
