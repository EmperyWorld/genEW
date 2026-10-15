import { useCallback, useRef } from 'react';

export function useDesktopWorkspaceRefreshBootstrap(
	refreshStorage: () => void
) {
	const workspaceRefreshImplRef = useRef<(() => void) | null>(null);
	const refreshForPersistenceShell = useCallback(() => {
		const impl = workspaceRefreshImplRef.current;
		if (impl) {
			impl();
			return;
		}
		void refreshStorage();
	}, [refreshStorage]);

	return { workspaceRefreshImplRef, refreshForPersistenceShell };
}
