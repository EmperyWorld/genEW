import { useMemo } from 'react';
import type { DesktopWindowStyle } from '@/types/profile';
import { ACCENT_COLORS } from '../constants';
import type { AccentColorId } from '../context/DesktopStateContext';
import {
	desktopAccentRgbSpaceFromWindowStyle,
	hexToRgbSpaceString,
} from '../utils/desktopAccentColor';

export function useDesktopWorkspaceAccentRgb(params: {
	/** When `true`, accent RGB follows {@link desktopWindowStyle}. */
	desktopAccentFollowsWindowStyle: boolean | null | undefined;
	desktopWindowStyle: DesktopWindowStyle;
	accent: AccentColorId;
	accentCustomHex: string;
}) {
	const {
		desktopAccentFollowsWindowStyle,
		desktopWindowStyle,
		accent,
		accentCustomHex,
	} = params;

	const accentFollowsWindowStyle = desktopAccentFollowsWindowStyle === true;

	return useMemo(() => {
		if (accentFollowsWindowStyle) {
			return desktopAccentRgbSpaceFromWindowStyle(desktopWindowStyle);
		}
		if (accent === 'custom') {
			return hexToRgbSpaceString(accentCustomHex);
		}
		return (
			ACCENT_COLORS.find((color) => color.id === accent)?.rgb ?? '168 85 247'
		);
	}, [accentFollowsWindowStyle, desktopWindowStyle, accent, accentCustomHex]);
}
