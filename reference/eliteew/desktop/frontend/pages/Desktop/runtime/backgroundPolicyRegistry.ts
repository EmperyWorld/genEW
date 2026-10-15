export type DesktopBackgroundPolicyMode =
	| 'always_on_minimal'
	| 'pause_effects_when_hidden'
	| 'allow_unmount_when_minimized';

export interface DesktopAppBackgroundPolicy {
	appComponent: string;
	mode: DesktopBackgroundPolicyMode;
	pauseEffectsWhenHidden: boolean;
	allowUnmountWhenMinimized: boolean;
	keepMinimalRuntime: boolean;
}

const ALL_POLICY: DesktopAppBackgroundPolicy = {
	appComponent: '*',
	mode: 'pause_effects_when_hidden',
	pauseEffectsWhenHidden: true,
	allowUnmountWhenMinimized: false,
	keepMinimalRuntime: false,
};

const POLICY_BY_COMPONENT: Record<string, DesktopAppBackgroundPolicy> = {
	Analytics: {
		appComponent: 'Analytics',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	AppStore: {
		appComponent: 'AppStore',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	DesktopShellSettings: {
		appComponent: 'DesktopShellSettings',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	AssistantApp: {
		appComponent: 'AssistantApp',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	ClipboardManager: {
		appComponent: 'ClipboardManager',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	ContentManagerPro: {
		appComponent: 'ContentManagerPro',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	CustomerCabinet: {
		appComponent: 'CustomerCabinet',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	DesktopAiChatApp: {
		appComponent: 'DesktopAiChatApp',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	DesktopAppMaintenance: {
		appComponent: 'DesktopAppMaintenance',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	DocEditor: {
		appComponent: 'DocEditor',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	EWDeskApp: {
		appComponent: 'EWDeskApp',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	EliteChat: {
		appComponent: 'EliteChat',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	EWRP: {
		appComponent: 'EWRP',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	FeedbackHubApp: {
		appComponent: 'FeedbackHubApp',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	FriendsApp: {
		appComponent: 'FriendsApp',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	GAFChatApp: {
		appComponent: 'GAFChatApp',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: true,
	},
	VideoCallApp: {
		appComponent: 'VideoCallApp',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: true,
	},
	ImageStudio: {
		appComponent: 'ImageStudio',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	KirsClientSite: {
		appComponent: 'KirsClientSite',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	KirsCuration: {
		appComponent: 'KirsCuration',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	MarketingCabinet: {
		appComponent: 'MarketingCabinet',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	EwaApp: {
		appComponent: 'EwaApp',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	MusicGenerator: {
		appComponent: 'MusicGenerator',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	MusicPlayer: {
		appComponent: 'MusicPlayer',
		mode: 'always_on_minimal',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: true,
	},
	NotificationsApp: {
		appComponent: 'NotificationsApp',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	Presentations: {
		appComponent: 'Presentations',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	PresentationsArchive: {
		appComponent: 'PresentationsArchive',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	SocialHubApp: {
		appComponent: 'SocialHubApp',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	StudioGU: {
		appComponent: 'StudioGU',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	SystemMonitorWidget: {
		appComponent: 'SystemMonitorWidget',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	UGS: {
		appComponent: 'UGS',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	UGSHubApp: {
		appComponent: 'UGSHubApp',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	UnifiedAdminApp: {
		appComponent: 'UnifiedAdminApp',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	UserProfile: {
		appComponent: 'UserProfile',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
	UserSiteStudio: {
		appComponent: 'UserSiteStudio',
		mode: 'allow_unmount_when_minimized',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: true,
		keepMinimalRuntime: false,
	},
	VideoStudio: {
		appComponent: 'VideoStudio',
		mode: 'pause_effects_when_hidden',
		pauseEffectsWhenHidden: true,
		allowUnmountWhenMinimized: false,
		keepMinimalRuntime: false,
	},
};

export function getDesktopAppBackgroundPolicy(
	appComponent: string | null | undefined
): DesktopAppBackgroundPolicy {
	if (!appComponent) {
		return ALL_POLICY;
	}
	return POLICY_BY_COMPONENT[appComponent] ?? ALL_POLICY;
}

/**
 * Дополнительные приложения: полный suspend при сворачивании/скрытии только если
 * включён режим «расширенная выгрузка фона» (см. usePerformanceOptimizer).
 * Базовая POLICY для них остаётся консервативной.
 */
const AGGRESSIVE_EXTRA_ALLOW_UNMOUNT = new Set<string>(['KirsClientSite']);

export function getDesktopAppBackgroundPolicyEffective(
	appComponent: string | null | undefined,
	options: { aggressiveBackgroundSuspend: boolean }
): DesktopAppBackgroundPolicy {
	const base = getDesktopAppBackgroundPolicy(appComponent);
	if (
		!options.aggressiveBackgroundSuspend ||
		!appComponent ||
		base.allowUnmountWhenMinimized ||
		base.mode === 'always_on_minimal'
	) {
		return base;
	}
	if (!AGGRESSIVE_EXTRA_ALLOW_UNMOUNT.has(appComponent)) {
		return base;
	}
	return { ...base, allowUnmountWhenMinimized: true };
}

export const DESKTOP_REGISTERED_BACKGROUND_POLICIES =
	POLICY_BY_COMPONENT as Readonly<Record<string, DesktopAppBackgroundPolicy>>;
