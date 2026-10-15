const LOW_GPU_WINDOWS_STORAGE_KEY = 'elite_desktop_low_gpu_windows';

function parseBooleanLike(value: string | null | undefined): boolean | null {
	if (value == null) return null;
	const normalized = value.trim().toLowerCase();
	if (
		normalized === '1' ||
		normalized === 'true' ||
		normalized === 'on' ||
		normalized === 'yes'
	) {
		return true;
	}
	if (
		normalized === '0' ||
		normalized === 'false' ||
		normalized === 'off' ||
		normalized === 'no'
	) {
		return false;
	}
	return null;
}

export function isDesktopLowGpuModeEnabled(): boolean {
	if (typeof window !== 'undefined') {
		try {
			const override = parseBooleanLike(
				window.localStorage.getItem(LOW_GPU_WINDOWS_STORAGE_KEY)
			);
			if (override != null) return override;
		} catch {
			/* ignore localStorage read failures */
		}
	}
	const envValue = parseBooleanLike(
		(import.meta.env?.VITE_DESKTOP_LOW_GPU_WINDOWS as string | undefined) ??
			undefined
	);
	return envValue ?? true;
}
