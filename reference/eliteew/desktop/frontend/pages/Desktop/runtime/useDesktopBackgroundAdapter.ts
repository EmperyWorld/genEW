import * as React from 'react';
import {
	useDesktopWindowSurfaceState,
	type DesktopWindowBackgroundLevel,
} from '../context/DesktopWindowActiveContext';
import { useDesktopShellPerformance } from '../context/DesktopShellPerformanceContext';
import { getDesktopAppBackgroundPolicyEffective } from './backgroundPolicyRegistry';
import { isDesktopBackgroundRuntimeAdapterEnabled } from './backgroundRuntimeFlags';
import { useDesktopBackgroundRuntimeController } from './DesktopBackgroundRuntimeContext';

export interface DesktopBackgroundAdapterState {
	appComponent: string;
	backgroundLevel: DesktopWindowBackgroundLevel;
	enabled: boolean;
	shouldPauseEffects: boolean;
	shouldSuspendAppRuntime: boolean;
	shouldRenderFullApp: boolean;
	setPausedEffectsCount: (value: number) => void;
}

export function useDesktopBackgroundAdapter(
	appComponent: string
): DesktopBackgroundAdapterState {
	const surfaceState = useDesktopWindowSurfaceState();
	const shellPerf = useDesktopShellPerformance();
	const runtimeController = useDesktopBackgroundRuntimeController();
	const adapterId = React.useId();

	const policy = React.useMemo(
		() =>
			getDesktopAppBackgroundPolicyEffective(appComponent, {
				aggressiveBackgroundSuspend: shellPerf.aggressiveBackgroundSuspend,
			}),
		[appComponent, shellPerf.aggressiveBackgroundSuspend]
	);
	const enabled = isDesktopBackgroundRuntimeAdapterEnabled();

	const shouldPauseEffects =
		enabled &&
		policy.pauseEffectsWhenHidden &&
		surfaceState.backgroundLevel !== 'foreground';

	const shouldSuspendAppRuntime =
		enabled &&
		policy.allowUnmountWhenMinimized &&
		(surfaceState.isMinimized ||
			surfaceState.backgroundLevel === 'suspended' ||
			!surfaceState.isSurfaceVisible);

	const [pausedEffectsCount, setPausedEffectsCount] = React.useState(0);

	React.useEffect(() => {
		runtimeController.upsertAdapterSnapshot({
			id: adapterId,
			appComponent,
			backgroundLevel: surfaceState.backgroundLevel,
			shouldSuspendAppRuntime,
			shouldPauseEffects,
			pausedEffects: pausedEffectsCount,
		});
		return () => runtimeController.removeAdapterSnapshot(adapterId);
	}, [
		runtimeController,
		adapterId,
		appComponent,
		surfaceState.backgroundLevel,
		shouldSuspendAppRuntime,
		shouldPauseEffects,
		pausedEffectsCount,
	]);

	const setPausedEffectsCountSafe = React.useCallback(
		(value: number) => {
			const next = Math.max(0, Math.floor(value));
			setPausedEffectsCount(next);
			runtimeController.setAdapterPausedEffects(adapterId, next);
		},
		[adapterId, runtimeController]
	);

	return React.useMemo(
		() => ({
			appComponent,
			backgroundLevel: surfaceState.backgroundLevel,
			enabled,
			shouldPauseEffects,
			shouldSuspendAppRuntime,
			shouldRenderFullApp: !shouldSuspendAppRuntime,
			setPausedEffectsCount: setPausedEffectsCountSafe,
		}),
		[
			appComponent,
			surfaceState.backgroundLevel,
			enabled,
			shouldPauseEffects,
			shouldSuspendAppRuntime,
			setPausedEffectsCountSafe,
		]
	);
}
