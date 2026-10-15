import type { PerformanceSummary } from '../components/DesktopSettingsPanel';

/** Статичные метрики для вкладок настроек, где live telemetry не нужна. */
export const STATIC_DESKTOP_SETTINGS_PERFORMANCE: PerformanceSummary = {
	metrics: {
		fps: 0,
		renderTime: 0,
		memoryUsage: 0,
		windowCount: 0,
		activeAdapters: 0,
		suspendedAdapters: 0,
		pausedEffects: 0,
		backgroundInvalidationsPerMin: 0,
		longTaskSupported: false,
		longTaskCount: 0,
		lastLongTaskMs: null,
		lastAction: null,
		actionSampleCount: 0,
	},
	isHighPerformanceMode: false,
	preferAggressiveBackgroundSuspend: false,
	recommendations: [],
};

/** Заглушка perf для плавающего виджета в quiet mode. */
export const QUIET_FLOATING_WIDGET_PERFORMANCE: PerformanceSummary = {
	metrics: {
		fps: 0,
		renderTime: 0,
		memoryUsage: 0,
		windowCount: 0,
		activeAdapters: 0,
		suspendedAdapters: 0,
		pausedEffects: 0,
		backgroundInvalidationsPerMin: 0,
		longTaskSupported: false,
		longTaskCount: 0,
		lastLongTaskMs: null,
		lastAction: null,
		actionSampleCount: 0,
	},
	isHighPerformanceMode: false,
	preferAggressiveBackgroundSuspend: false,
	recommendations: [],
};
