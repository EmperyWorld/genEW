/**
 * useDesktopState – single source for Desktop UI state (Context-based).
 * Must be used within DesktopStateProvider. Re-exports context API for consistency.
 */

import {
	useDesktopStateContext,
	useDesktopStateActions,
} from '../context/DesktopStateContext';

/**
 * Combined state + actions from DesktopStateProvider.
 * Use inside DesktopWorkspace (or any tree wrapped with DesktopStateProvider).
 */
export function useDesktopState() {
	const { state } = useDesktopStateContext();
	const actions = useDesktopStateActions();
	return { state, ...actions };
}
