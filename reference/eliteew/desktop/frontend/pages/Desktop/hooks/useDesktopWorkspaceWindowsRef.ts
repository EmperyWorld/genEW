import { useRef, type MutableRefObject } from 'react';

/**
 * Ref, всегда указывающий на последний `windows`, для подписок/эффектов без лишних перерендеров.
 */
export function useDesktopWorkspaceWindowsRef<T>(
	value: T
): MutableRefObject<T> {
	const ref = useRef(value);
	ref.current = value;
	return ref;
}
