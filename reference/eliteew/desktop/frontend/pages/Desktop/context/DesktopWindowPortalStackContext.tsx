import { createContext, useContext, useMemo } from 'react';
import { DESKTOP_PORTAL_STACK_BUMP, DESKTOP_Z_INDEX } from '../constants';

/**
 * Базовый z-index для `createPortal(..., document.body)` из содержимого окна:
 * равен `desktopEmbeddedFloatingMenuZIndex(window.zIndex)` в `EnhancedWindow`.
 * Вне провайдера — `DESKTOP_Z_INDEX.CONTEXT_MENU` (трей без окна и т.п.).
 */
export const DesktopWindowPortalStackContext = createContext<number>(
	DESKTOP_Z_INDEX.CONTEXT_MENU
);

export function useDesktopWindowPortalStackBase(): number {
	return useContext(DesktopWindowPortalStackContext);
}

/** Z-index для `createPortal` модалок из вложенного приложения (выше меню того же окна). */
export function useEmbeddedPortaledModalZIndex(): {
	backdrop: number;
	content: number;
} {
	const base = useContext(DesktopWindowPortalStackContext);
	return useMemo(
		() => ({
			backdrop: base + DESKTOP_PORTAL_STACK_BUMP.EMBEDDED_MODAL_BACKDROP,
			content: base + DESKTOP_PORTAL_STACK_BUMP.EMBEDDED_MODAL_CONTENT,
		}),
		[base]
	);
}

/**
 * Z-index для фиксированных правых панелей Ultimate Doc Editor (файлы, поиск, комментарии, …).
 * См. **`DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_SIDE_PANEL`**.
 */
export function useDocEditorSidePanelZIndex(): number {
	const base = useContext(DesktopWindowPortalStackContext);
	return useMemo(
		() => base + DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_SIDE_PANEL,
		[base]
	);
}

/**
 * Порталы в `document.body` из shell редактора (меню экспорта, `ColorPicker`).
 * См. **`DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_TOOLBAR_PORTAL_POPOVER`**.
 */
export function useDocEditorToolbarPortalPopoverZIndex(): number {
	const base = useContext(DesktopWindowPortalStackContext);
	return useMemo(
		() =>
			base +
			DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_TOOLBAR_PORTAL_POPOVER,
		[base]
	);
}

/**
 * ПКМ в Tiptap и по строке в файловом менеджере документов.
 * См. **`DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_CONTEXT_MENU`**.
 */
export function useDocEditorContextMenuZIndex(): number {
	const base = useContext(DesktopWindowPortalStackContext);
	return useMemo(
		() => base + DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_CONTEXT_MENU,
		[base]
	);
}

/**
 * Слои **`absolute` / `sticky`** внутри корня `.ultimate-doc-editor` (не порталы в `body`).
 * См. блок **`DOC_EDITOR_IN_WINDOW_*`** в **`DESKTOP_PORTAL_STACK_BUMP`**.
 */
/**
 * Крупный drag-over слой во вложенном приложении (контент-менеджер и т.п.): та же шкала, что
 * **`DOC_EDITOR_IN_WINDOW_DRAG_OVERLAY`** в редакторе документов.
 */
export function useDesktopEmbeddedDragOverlayZIndex(): number {
	const base = useContext(DesktopWindowPortalStackContext);
	return useMemo(
		() => base + DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_DRAG_OVERLAY,
		[base]
	);
}

export function useDocEditorInWindowStackZIndex(): {
	scrollFab: number;
	stickyToolbar: number;
	stickyDocHeader: number;
	stickyAlert: number;
	guideCard: number;
	memoryToast: number;
	dragOverlay: number;
} {
	const base = useContext(DesktopWindowPortalStackContext);
	return useMemo(
		() => ({
			scrollFab:
				base + DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_SCROLL_FAB,
			stickyToolbar:
				base + DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_STICKY_TOOLBAR,
			stickyDocHeader:
				base + DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_STICKY_DOC_HEADER,
			stickyAlert:
				base + DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_STICKY_ALERT,
			guideCard:
				base + DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_GUIDE_CARD,
			memoryToast:
				base + DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_MEMORY_TOAST,
			dragOverlay:
				base + DESKTOP_PORTAL_STACK_BUMP.DOC_EDITOR_IN_WINDOW_DRAG_OVERLAY,
		}),
		[base]
	);
}
