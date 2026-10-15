/**
 * Настройки рабочего стола в обычном окне (без полноэкранной модалки).
 */

import type { ReactElement } from 'react';
import { useCallback } from 'react';
import { useDesktopShellSettingsBridge } from '../context/DesktopShellSettingsBridgeContext';
import { DesktopSettingsPanel } from './DesktopSettingsPanel';

/** After closing settings window, return focus to workspace landmark (wave 16 / a11y). */
function focusDesktopMainDeferred(): void {
	window.setTimeout(() => {
		document.getElementById('desktop-main')?.focus({ preventScroll: true });
	}, 0);
}

export function DesktopShellSettingsWindowContent({
	onRequestClose,
}: {
	onRequestClose?: () => void;
}): ReactElement {
	const bridge = useDesktopShellSettingsBridge();

	const handleClose = useCallback(() => {
		onRequestClose?.();
		focusDesktopMainDeferred();
	}, [onRequestClose]);

	return (
		<DesktopSettingsPanel
			{...bridge}
			isOpen
			onClose={handleClose}
			presentation="embedded"
		/>
	);
}
