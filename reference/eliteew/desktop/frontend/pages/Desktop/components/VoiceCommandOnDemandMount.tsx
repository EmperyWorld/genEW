/**
 * Тяжёлый VoiceCommandCenter (health-интервал, useLiveVoiceWebSocket и т.д.) не монтируем
 * в фоне. Пока движок выключен — только лёгкий слушатель Space; полный VCC подключается
 * по хоткею или при pendingVoiceCommandStart (виджет / мост).
 */

import * as React from 'react';
import { useCallback, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { VOICE_HOTKEY } from '../../StudioGU/voiceCommand/types';
import { useDesktopVoice } from '../context/DesktopVoiceContext';

const VoiceCommandCenter = React.lazy(
	() => import('../../StudioGU/voiceCommand/VoiceCommandCenter')
);

function isKeyboardTargetInEditable(e: KeyboardEvent): boolean {
	const target = e.target as Node;
	if (target && typeof (target as HTMLElement).closest === 'function') {
		const el = (target as HTMLElement).closest(
			'input, textarea, select, [contenteditable="true"]'
		);
		if (el) return true;
	}
	return false;
}

/** Только Space → поднять движок; без WebSocket/health (их поднимает VoiceCommandCenter). */
function VoiceCommandDesktopHotkeys({
	onActivate,
}: {
	onActivate: () => void;
}): React.ReactElement | null {
	React.useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== VOICE_HOTKEY || e.repeat || isKeyboardTargetInEditable(e)) {
				return;
			}
			e.preventDefault();
			onActivate();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [onActivate]);

	return null;
}

export function VoiceCommandOnDemandMount({
	hasOpenStudioGUWindow,
}: {
	hasOpenStudioGUWindow: boolean;
}): React.ReactElement | null {
	const { pendingVoiceCommandStart, requestVoiceCommandListen } =
		useDesktopVoice();
	const [voiceEngineMounted, setVoiceEngineMounted] = useState(false);

	useLayoutEffect(() => {
		if (!pendingVoiceCommandStart || hasOpenStudioGUWindow) return;
		flushSync(() => {
			setVoiceEngineMounted(true);
		});
	}, [pendingVoiceCommandStart, hasOpenStudioGUWindow]);

	const mountEngineFromHotkey = useCallback(() => {
		if (hasOpenStudioGUWindow) return;
		flushSync(() => {
			setVoiceEngineMounted(true);
		});
		requestVoiceCommandListen();
	}, [hasOpenStudioGUWindow, requestVoiceCommandListen]);

	if (hasOpenStudioGUWindow) {
		return null;
	}

	return (
		<>
			{!voiceEngineMounted ? (
				<VoiceCommandDesktopHotkeys onActivate={mountEngineFromHotkey} />
			) : null}
			{voiceEngineMounted ? (
				<React.Suspense fallback={null}>
					<VoiceCommandCenter backgroundOnly />
				</React.Suspense>
			) : null}
		</>
	);
}
