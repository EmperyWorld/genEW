/**
 * Текущий пресет «Стиль окон» (glass / framed / minimal) для вложенных приложений
 * (Content Manager в окне, AI Chat и т.д.), без проброса пропсов через десятки уровней.
 */

import * as React from 'react';
import type { DesktopWindowStyle } from '../../../types/profile';

const DesktopShellFrameContext =
	React.createContext<DesktopWindowStyle>('glass');

export function DesktopShellFrameProvider({
	windowStyle,
	children,
}: {
	windowStyle: DesktopWindowStyle;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<DesktopShellFrameContext.Provider value={windowStyle}>
			{children}
		</DesktopShellFrameContext.Provider>
	);
}

export function useDesktopShellFrame(): DesktopWindowStyle {
	return React.useContext(DesktopShellFrameContext);
}
