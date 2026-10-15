/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Внешний стек провайдеров рабочего стола (perf → GAF → голос → app props → опционально **shell bridge**
 * для EWA companion **`shell_context`**).
 *
 * Invariants:
 * - Порядок вложения фиксирован; taskbar shell prefs — `DesktopTaskbarShellPrefsProvider`
 *   оборачивает `DesktopWorkspaceContent` (hooks bridge + taskbar + Settings Center).
 *
 * Related:
 * - src/pages/Desktop/DesktopWorkspaceContent.tsx
 * - src/pages/Desktop/context/EwaCompanionShellBridgeContext.tsx
 */

import * as React from 'react';
import { DesktopAppPropsProvider } from '../context/DesktopAppPropsContext';
import type { DesktopAppPropsContextValue } from '../context/DesktopAppPropsContext';
import {
	DesktopGafActionsProvider,
	type DesktopGafOpenActions,
} from '../context/DesktopGafActionsContext';
import { DesktopShellPerformanceProvider } from '../context/DesktopShellPerformanceContext';
import { DesktopVoiceProvider } from '../context/DesktopVoiceContext';
import {
	EwaCompanionShellBridgeProvider,
	type EwaCompanionShellBridgeValue,
} from '../context/EwaCompanionShellBridgeContext';

export function DesktopWorkspaceShellProviders({
	aggressiveBackgroundSuspend,
	gafActions,
	appProps,
	companionShellBridge,
	children,
}: {
	aggressiveBackgroundSuspend: boolean;
	gafActions: DesktopGafOpenActions;
	appProps: DesktopAppPropsContextValue;
	/** Optional snapshot bridge for **EwaApp** companion chat (`shell_context`). */
	companionShellBridge?: EwaCompanionShellBridgeValue | null;
	children: React.ReactNode;
}): React.JSX.Element {
	const innerDesktopTree = (
		<DesktopGafActionsProvider value={gafActions}>
			<DesktopVoiceProvider>
				<DesktopAppPropsProvider value={appProps}>
					{children}
				</DesktopAppPropsProvider>
			</DesktopVoiceProvider>
		</DesktopGafActionsProvider>
	);

	return (
		<DesktopShellPerformanceProvider
			aggressiveBackgroundSuspend={aggressiveBackgroundSuspend}
		>
			{companionShellBridge ? (
				<EwaCompanionShellBridgeProvider value={companionShellBridge}>
					{innerDesktopTree}
				</EwaCompanionShellBridgeProvider>
			) : (
				innerDesktopTree
			)}
		</DesktopShellPerformanceProvider>
	);
}
