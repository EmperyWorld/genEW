/**
 * DesktopVoiceContext – голосовые режимы рабочего стола (Голосовой штаб + Live Voice).
 * Взаимное исключение: активен только один из voice-command | live-voice.
 * Кнопки в плавающем виджете (часы / кредиты / аватар); фоновый VCC + LiveVoiceDesktopPipeline.
 */

import * as React from 'react';
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	type ReactNode,
} from 'react';

export type DesktopVoiceMode = 'voice-command' | 'live-voice' | null;

export type LastSuccessStatus = 'success' | 'error' | null;

export interface VoiceCommandStatus {
	serviceAvailable: boolean;
	lastSuccess: LastSuccessStatus;
}

export interface LiveVoiceStatus {
	serviceAvailable: boolean;
	lastSuccess: LastSuccessStatus;
}

export interface DesktopVoiceContextValue {
	activeMode: DesktopVoiceMode;
	voiceCommand: VoiceCommandStatus;
	liveVoice: LiveVoiceStatus;
	pendingVoiceCommandStart: boolean;

	setActiveMode: (mode: DesktopVoiceMode) => void;
	setVoiceCommandStatus: (status: Partial<VoiceCommandStatus>) => void;
	setLiveVoiceStatus: (status: Partial<LiveVoiceStatus>) => void;
	requestVoiceCommandListen: () => void;
	clearPendingVoiceCommandStart: () => void;

	/** Set by DesktopWorkspaceContent to open Voice Command window */
	openVoiceCommandCenter: (() => void) | null;
	setOpenVoiceCommandCenter: (fn: (() => void) | null) => void;

	/** Open Live Voice expanded panel (set by bar / consumer) */
	showLiveVoicePanel: boolean;
	setShowLiveVoicePanel: (show: boolean) => void;
}

const defaultVoiceStatus: VoiceCommandStatus = {
	serviceAvailable: false,
	lastSuccess: null,
};

const defaultLiveVoiceStatus: LiveVoiceStatus = {
	serviceAvailable: false,
	lastSuccess: null,
};

const DesktopVoiceContext = createContext<DesktopVoiceContextValue | null>(
	null
);

export function useDesktopVoice(): DesktopVoiceContextValue {
	const ctx = useContext(DesktopVoiceContext);
	if (!ctx) {
		throw new Error('useDesktopVoice must be used within DesktopVoiceProvider');
	}
	return ctx;
}

export function useDesktopVoiceOptional(): DesktopVoiceContextValue | null {
	return useContext(DesktopVoiceContext);
}

interface DesktopVoiceProviderProps {
	children: ReactNode;
}

export function DesktopVoiceProvider({
	children,
}: DesktopVoiceProviderProps): React.ReactElement {
	const [activeMode, setActiveModeState] = useState<DesktopVoiceMode>(null);
	const [voiceCommand, setVoiceCommandState] =
		useState<VoiceCommandStatus>(defaultVoiceStatus);
	const [liveVoice, setLiveVoiceState] = useState<LiveVoiceStatus>(
		defaultLiveVoiceStatus
	);
	const [pendingVoiceCommandStart, setPendingVoiceCommandStart] =
		useState(false);
	const [openVoiceCommandCenterFn, setOpenVoiceCommandCenterState] = useState<
		(() => void) | null
	>(null);
	const [showLiveVoicePanel, setShowLiveVoicePanel] = useState(false);

	const setActiveMode = useCallback((mode: DesktopVoiceMode) => {
		setActiveModeState(mode);
		if (mode !== 'live-voice') {
			setShowLiveVoicePanel(false);
		}
	}, []);

	const setVoiceCommandStatus = useCallback(
		(patch: Partial<VoiceCommandStatus>) => {
			setVoiceCommandState((prev) => ({ ...prev, ...patch }));
		},
		[]
	);

	const setLiveVoiceStatus = useCallback((patch: Partial<LiveVoiceStatus>) => {
		setLiveVoiceState((prev) => ({ ...prev, ...patch }));
	}, []);

	const requestVoiceCommandListen = useCallback(() => {
		setPendingVoiceCommandStart(true);
	}, []);

	const clearPendingVoiceCommandStart = useCallback(() => {
		setPendingVoiceCommandStart(false);
	}, []);

	const setOpenVoiceCommandCenter = useCallback((fn: (() => void) | null) => {
		// Store the callback as a value, not as a React state updater.
		setOpenVoiceCommandCenterState(() => fn);
	}, []);

	const value = useMemo<DesktopVoiceContextValue>(
		() => ({
			activeMode,
			voiceCommand,
			liveVoice,
			pendingVoiceCommandStart,
			setActiveMode,
			setVoiceCommandStatus,
			setLiveVoiceStatus,
			requestVoiceCommandListen,
			clearPendingVoiceCommandStart,
			openVoiceCommandCenter: openVoiceCommandCenterFn,
			setOpenVoiceCommandCenter,
			showLiveVoicePanel,
			setShowLiveVoicePanel,
		}),
		[
			activeMode,
			voiceCommand,
			liveVoice,
			pendingVoiceCommandStart,
			setActiveMode,
			setVoiceCommandStatus,
			setLiveVoiceStatus,
			requestVoiceCommandListen,
			clearPendingVoiceCommandStart,
			openVoiceCommandCenterFn,
			setOpenVoiceCommandCenter,
			showLiveVoicePanel,
		]
	);

	return (
		<DesktopVoiceContext.Provider value={value}>
			{children}
		</DesktopVoiceContext.Provider>
	);
}
