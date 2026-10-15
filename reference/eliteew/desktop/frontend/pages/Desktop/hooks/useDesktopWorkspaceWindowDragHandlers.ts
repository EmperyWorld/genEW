import {
	useCallback,
	useEffect,
	type Dispatch,
	type MutableRefObject,
	type SetStateAction,
} from 'react';

export function useDesktopWorkspaceWindowDragHandlers(params: {
	markWindowDragActivity: () => void;
	clearWindowDragWidgetTimer: () => void;
	isWindowDragActiveRef: MutableRefObject<boolean>;
	setIsWindowDragActive: Dispatch<SetStateAction<boolean>>;
	moveWindow: (windowId: string, x: number, y: number) => void;
	commitWindowPosition: (windowId: string, x: number, y: number) => void;
}) {
	const {
		markWindowDragActivity,
		clearWindowDragWidgetTimer,
		isWindowDragActiveRef,
		setIsWindowDragActive,
		moveWindow,
		commitWindowPosition,
	} = params;

	const handleWindowDrag = useCallback(
		(id: string, x: number, y: number) => {
			markWindowDragActivity();
			moveWindow(id, x, y);
		},
		[markWindowDragActivity, moveWindow]
	);

	const handleWindowDragCommit = useCallback(
		(id: string, x: number, y: number) => {
			clearWindowDragWidgetTimer();
			if (isWindowDragActiveRef.current) {
				isWindowDragActiveRef.current = false;
				setIsWindowDragActive(false);
			}
			commitWindowPosition(id, x, y);
		},
		[
			clearWindowDragWidgetTimer,
			commitWindowPosition,
			isWindowDragActiveRef,
			setIsWindowDragActive,
		]
	);

	useEffect(() => {
		return () => {
			clearWindowDragWidgetTimer();
		};
	}, [clearWindowDragWidgetTimer]);

	return { handleWindowDrag, handleWindowDragCommit };
}
