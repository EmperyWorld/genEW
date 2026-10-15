/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Flush debounced coalesced shell_state patches on tab unload via keepalive PATCH.
 *
 * Invariants:
 * - Mounted once on desktop workspace shell; complements window snapshot pagehide flush.
 *
 * Related:
 * - `desktopShellStateMutationPipeline.ts`, `DesktopWorkspaceContent.tsx`
 */

import { useEffect } from 'react';
import { flushShellStatePipelineOnPageHide } from '../utils/desktopShellStateMutationPipeline';

/** Register pagehide/beforeunload listener for pending coalesced shell_state writer. */
export function useCoalescedDesktopShellStatePagehideFlush(): void {
	useEffect(() => {
		const onUnload = () => flushShellStatePipelineOnPageHide();
		window.addEventListener('pagehide', onUnload);
		window.addEventListener('beforeunload', onUnload);
		return () => {
			window.removeEventListener('pagehide', onUnload);
			window.removeEventListener('beforeunload', onUnload);
		};
	}, []);
}
