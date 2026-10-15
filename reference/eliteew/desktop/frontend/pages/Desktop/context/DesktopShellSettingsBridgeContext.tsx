/**
 * Props for `DesktopSettingsPanel` (без режима открытия) — пробрасываются в окно
 * `DesktopShellSettings`, чтобы не дублировать десятки колбэков через lazy chunk.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { DesktopSettingsPanelProps } from '../components/DesktopSettingsPanel';

export type DesktopShellSettingsBridgeValue = Omit<
	DesktopSettingsPanelProps,
	'isOpen' | 'onClose' | 'presentation'
>;

const DesktopShellSettingsBridgeContext =
	createContext<DesktopShellSettingsBridgeValue | null>(null);

export function DesktopShellSettingsBridgeProvider({
	value,
	children,
}: {
	value: DesktopShellSettingsBridgeValue;
	children: ReactNode;
}): React.ReactElement {
	return (
		<DesktopShellSettingsBridgeContext.Provider value={value}>
			{children}
		</DesktopShellSettingsBridgeContext.Provider>
	);
}

export function useDesktopShellSettingsBridge(): DesktopShellSettingsBridgeValue {
	const v = useContext(DesktopShellSettingsBridgeContext);
	if (!v) {
		throw new Error(
			'useDesktopShellSettingsBridge must be used within DesktopShellSettingsBridgeProvider'
		);
	}
	return v;
}

/** Вне провайдера — `null` (например тесты или редактор вне оболочки стола). */
export function useOptionalDesktopShellSettingsBridge(): DesktopShellSettingsBridgeValue | null {
	return useContext(DesktopShellSettingsBridgeContext);
}
