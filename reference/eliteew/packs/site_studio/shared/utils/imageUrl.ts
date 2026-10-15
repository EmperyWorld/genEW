import { rewriteSiteStudioProxyUrl } from '@/services/api/siteStudioProxy';

/**
 * Приводит абсолютные URL (витрина, EliteEW proxy) к каноническому пути `/uploads/...`
 * для сохранения в БД и для витрины runtime (там только относительные пути к nginx).
 */
export function normalizeUploadsPath(input: string | null | undefined): string {
	if (input == null || input === '') {
		return '';
	}
	const s = String(input).trim();
	if (s.startsWith('/uploads')) {
		return s;
	}
	if (s.startsWith('http://') || s.startsWith('https://')) {
		try {
			const u = new URL(s);
			const idx = u.pathname.indexOf('/uploads/');
			if (idx !== -1) {
				return u.pathname.slice(idx) + (u.search || '');
			}
		} catch {
			/* ignore */
		}
	}
	return s;
}

/**
 * Resolve URL for uploaded/static images under `/uploads/*`.
 *
 * Встроенная админка на `app.eliteew.ru`: при активном прокси `rewriteSiteStudioProxyUrl`
 * подставляет **origin публичной витрины** (`publicSiteUrl` / `instance.public_url`), потому что
 * `<img>` не передаёт Bearer — запросы к `/api/.../proxy/uploads/...` дают 401.
 *
 * @param imagePath - e.g. "/uploads/services/flower.webp" or "https://..."
 */
export const getUploadedImageUrl = (
	imagePath: string | null | undefined
): string => {
	if (!imagePath) {
		return '';
	}

	if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
		return imagePath;
	}

	if (imagePath.startsWith('/uploads')) {
		const rewritten = rewriteSiteStudioProxyUrl(imagePath);
		return rewritten ?? imagePath;
	}

	if (imagePath.startsWith('/')) {
		return imagePath;
	}

	return imagePath;
};
