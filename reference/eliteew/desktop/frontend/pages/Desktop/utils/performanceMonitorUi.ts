/**
 * Class strings + motion props for desktop performance UI — tokens and prefers-reduced-motion.
 */

/** FAB and panel: no scale/y when reduced motion — opacity only, zero duration */
export function performanceMonitorFabMotionProps(
	reduceMotion: boolean | null
): {
	initial: Record<string, number>;
	animate: Record<string, number>;
	transition: { duration: number };
} {
	if (reduceMotion) {
		return {
			initial: { opacity: 0 },
			animate: { opacity: 1 },
			transition: { duration: 0 },
		};
	}
	return {
		initial: { opacity: 0, scale: 0.8 },
		animate: { opacity: 1, scale: 1 },
		transition: { duration: 0.2 },
	};
}

export function performanceMonitorPanelMotionProps(
	reduceMotion: boolean | null
): {
	initial: Record<string, number>;
	animate: Record<string, number>;
	exit: Record<string, number>;
	transition?: { duration: number };
} {
	if (reduceMotion) {
		return {
			initial: { opacity: 0 },
			animate: { opacity: 1 },
			exit: { opacity: 0 },
			transition: { duration: 0 },
		};
	}
	return {
		initial: { opacity: 0, scale: 0.8, y: -20 },
		animate: { opacity: 1, scale: 1, y: 0 },
		exit: { opacity: 0, scale: 0.8, y: -20 },
	};
}

export function virtualizationToggleButtonClasses(enabled: boolean): string {
	const base =
		'px-2 py-1 rounded text-xs font-medium transition-colors border motion-reduce:transition-none';
	if (enabled) {
		return [
			base,
			'bg-(--desktop-surface-soft) text-emerald-400/95',
			'border-[color-mix(in_srgb,rgb(52_211_153)_30%,var(--desktop-border-subtle))]',
		].join(' ');
	}
	return [
		base,
		'bg-(--desktop-surface-soft) text-(--desktop-text-muted)',
		'border-(--desktop-border-subtle)',
	].join(' ');
}
