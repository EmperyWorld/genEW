import { useMemo } from 'react';
import type { GridStepPreference } from '../constants';
import type { DesktopConfig } from '../types/desktop.types';

type IconSizePreference = 'small' | 'medium' | 'large';

export function useDesktopWorkspaceLayoutConfigDerived(
	config: DesktopConfig | null | undefined
) {
	return useMemo((): {
		iconSize: IconSizePreference;
		snapToGridEnabled: boolean;
		gridStep: GridStepPreference;
	} => {
		const iconSize = config?.icon_size ?? 'medium';
		const gridRaw = config?.grid_step ?? 'medium';
		const gridStep: GridStepPreference =
			gridRaw === 'small' || gridRaw === 'medium' || gridRaw === 'large'
				? gridRaw
				: 'medium';
		return {
			iconSize:
				iconSize === 'small' || iconSize === 'medium' || iconSize === 'large'
					? iconSize
					: 'medium',
			snapToGridEnabled: config?.snap_to_grid !== false,
			gridStep,
		};
	}, [config]);
}
