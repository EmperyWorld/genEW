/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Merge shell settings scroll target from `DesktopShellSettings` window payload into bridge value.
 *
 * Invariants:
 * - Clears `shellSettingsScrollToElementId` on handled scroll (one-shot deep link).
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`, `desktopSettingsStorageMapNavigation.ts`
 */

import { useMemo } from 'react';
import type { WindowState } from '../types/desktop.types';

type ShellSettingsBridgeBase = Record<string, unknown>;

export function useDesktopShellSettingsScrollBridge<
	T extends ShellSettingsBridgeBase,
>(
	shellSettingsBridgeBase: T,
	params: {
		windows: WindowState[];
		updateWindowPayload: (
			windowId: string,
			payload: { shellSettingsScrollToElementId?: undefined }
		) => void;
	}
): T & {
	pendingShellScrollElementId: string | null;
	onShellScrollHandled: () => void;
} {
	const { windows, updateWindowPayload } = params;

	const shellSettingsScrollBridge = useMemo(() => {
		const w = windows.find((x) => x.appComponent === 'DesktopShellSettings');
		return {
			shellWindowId: w?.id ?? null,
			pendingScrollId:
				w?.initialPayload?.shellSettingsScrollToElementId ?? null,
		};
	}, [windows]);

	return useMemo(
		() => ({
			...shellSettingsBridgeBase,
			pendingShellScrollElementId: shellSettingsScrollBridge.pendingScrollId,
			onShellScrollHandled: () => {
				if (shellSettingsScrollBridge.shellWindowId) {
					updateWindowPayload(shellSettingsScrollBridge.shellWindowId, {
						shellSettingsScrollToElementId: undefined,
					});
				}
			},
		}),
		[
			shellSettingsBridgeBase,
			shellSettingsScrollBridge.pendingScrollId,
			shellSettingsScrollBridge.shellWindowId,
			updateWindowPayload,
		]
	);
}
