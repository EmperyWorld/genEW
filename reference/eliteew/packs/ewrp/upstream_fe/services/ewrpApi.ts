/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Frontend client for EWRP presentation jobs: create/status/list/edit and authenticated PDF download.
 *
 * Invariants:
 * - Blob downloads go through `apiClient` so SPA Authorization headers are preserved.
 * - Direct PDF URLs may include only short-lived server-issued download tokens, never bearer tokens.
 *
 * Related:
 * - src/components/EWRP/EWRPGeneratorMain.tsx
 * - src/features/ewa/companionOperations/CompanionOperationPresentationCard.tsx
 */

import { apiClient } from './api';
import { API_PATHS } from './api/config';

const base = () => API_PATHS.EWRP;

export interface EwrpCreateRequest {
	topic: string;
	title?: string;
	num_slides?: number;
	/** Дополнительные текстовые вводные для генератора контента. */
	extra_context?: string;
	/** ID документа из Content Manager (unified_content.id), который будет использован как фактический контент. */
	source_content_id?: string;
	/** Визуальный стиль итогового PDF (фон, палитра): classic, midnight, ember, aurora, paper, editorial, brutal, noir, linen. */
	presentation_theme?: string;
	/** Раскладка текста на контентных слайдах (со 2-го); пусто — авто после генерации. */
	default_slide_layout?: string;
	web_search_quality?: 'off' | 'light' | 'standard' | 'deep';
	use_web_search?: boolean;
}

export interface EwrpCreateResponse {
	id: string;
	status: string;
	message: string;
}

export interface EwrpSlide {
	title: string;
	bullets: string[];
	image_filename?: string | null;
	/** True when the authenticated slide PNG endpoint can serve this image. */
	image_ready?: boolean;
	/** Последний промпт визуала (опционально) */
	image_prompt?: string | null;
	/** Шаблон оформления (statement, split, grid, …); без поля — авто */
	layout?: string | null;
}

export interface EwrpStatusResponse {
	id: string;
	status: string;
	progress: number;
	error_message: string | null;
	/** full | degraded — when LLM JSON failed and template text was used */
	content_quality?: string | null;
	/** User-visible hint when content_quality is degraded */
	content_warning?: string | null;
	pdf_url: string | null;
	pdf_download_token?: string | null;
	slides?: EwrpSlide[] | null;
	/** Вводные задачи (подставить в форму) */
	topic?: string | null;
	title?: string | null;
	num_slides?: number | null;
	extra_context?: string | null;
	source_content_id?: string | null;
	/** Визуальный стиль PDF, выбранный при создании. */
	presentation_theme?: string | null;
	/** Раскладка текста на контентных слайдах при создании. */
	default_slide_layout?: string | null;
	web_search_quality?: 'off' | 'light' | 'standard' | 'deep' | null;
	use_web_search?: boolean | null;
	/** Последнее обновление задачи (для retry зависших in-progress). */
	updated_at?: string | null;
}

export interface EwrpJobListItem {
	id: string;
	title: string;
	topic: string;
	num_slides: number;
	status: string;
	progress: number;
	error_message?: string | null;
	created_at: string | null;
	updated_at: string | null;
	completed_at: string | null;
}

export type EwrpCreateOptions = {
	/** Заголовок Idempotency-Key для защиты от двойного списания при повторе запроса. */
	idempotencyKey?: string;
};

export const ewrpApi = {
	create(
		body: EwrpCreateRequest,
		options?: EwrpCreateOptions
	): Promise<{ data: EwrpCreateResponse }> {
		const pt = (body.presentation_theme ?? 'classic').trim() || 'classic';
		const dl = body.default_slide_layout?.trim();
		const ws = body.web_search_quality ?? 'off';
		const key = options?.idempotencyKey?.trim();
		return apiClient.post(
			base(),
			{
				topic: body.topic,
				title: body.title ?? undefined,
				num_slides: body.num_slides ?? 5,
				extra_context: body.extra_context?.trim() || undefined,
				source_content_id: body.source_content_id || undefined,
				presentation_theme: pt,
				default_slide_layout: dl || undefined,
				web_search_quality: ws,
				...(ws !== 'off' ? { use_web_search: true } : {}),
			},
			key ? { headers: { 'Idempotency-Key': key } } : undefined
		);
	},

	updateSlides(
		jobId: string,
		slides: EwrpSlide[]
	): Promise<{ data: EwrpStatusResponse }> {
		return apiClient.put(`${base()}/${jobId}/slides`, {
			slides,
		});
	},

	/** Перегенерация визуала слайда через UGS (платно). */
	regenerateSlideImage(
		jobId: string,
		slideIndex: number,
		prompt: string
	): Promise<{ data: EwrpStatusResponse }> {
		return apiClient.post(
			`${base()}/${jobId}/slides/${slideIndex}/regenerate-image`,
			{ prompt }
		);
	},

	/** Перегенерация текста слайда (платно). */
	regenerateSlideText(
		jobId: string,
		slideIndex: number,
		instruction?: string
	): Promise<{ data: EwrpStatusResponse }> {
		return apiClient.post(
			`${base()}/${jobId}/slides/${slideIndex}/regenerate-text`,
			{ instruction: instruction?.trim() || undefined }
		);
	},

	/** Новая задача с теми же вводными (новое списание энергии). */
	duplicate(jobId: string): Promise<{ data: EwrpCreateResponse }> {
		return apiClient.post(`${base()}/${jobId}/duplicate`);
	},

	/** Повтор в той же задаче: failed (списание) или зависшая (без списания). */
	retry(jobId: string): Promise<{ data: EwrpCreateResponse }> {
		return apiClient.post(`${base()}/${jobId}/retry`);
	},

	getStatus(jobId: string): Promise<{ data: EwrpStatusResponse }> {
		return apiClient.get(`${base()}/${jobId}/status`);
	},

	listJobs(limit = 50, offset = 0): Promise<EwrpJobListItem[]> {
		return apiClient
			.get<EwrpJobListItem[]>(`${base()}/jobs`, {
				params: { limit, offset },
			})
			.then((res) => (Array.isArray(res.data) ? res.data : []));
	},

	deleteJob(jobId: string): Promise<void> {
		return apiClient.delete(`${base()}/${jobId}`).then(() => {});
	},

	getPdfUrl(jobId: string): string {
		return `${base()}/${jobId}/pdf`;
	},

	/** Download PDF as Blob (uses same auth as apiClient — session Bearer). */
	async downloadPdf(jobId: string): Promise<Blob> {
		const res = await apiClient.get<Blob>(`${base()}/${jobId}/pdf`, {
			responseType: 'blob',
			params: { _nocache: Date.now() },
			headers: {
				'Cache-Control': 'no-cache',
				Pragma: 'no-cache',
			},
		});
		return res.data instanceof Blob ? res.data : new Blob([res.data]);
	},

	/** Download one slide PNG preview (authenticated owner). */
	async downloadSlideImage(jobId: string, slideIndex: number): Promise<Blob> {
		const res = await apiClient.get<Blob>(
			`${base()}/${jobId}/slides/${slideIndex}/image`,
			{
				responseType: 'blob',
				params: { _nocache: Date.now() },
				headers: {
					'Cache-Control': 'no-cache',
					Pragma: 'no-cache',
				},
			}
		);
		return res.data instanceof Blob ? res.data : new Blob([res.data]);
	},
};

/**
 * Абсолютный URL для GET PDF (тот же origin, что у SPA).
 * `token` из `EwrpStatusResponse.pdf_download_token` — для открытия в новой вкладке без заголовка Authorization.
 */
export function ewrpPdfAbsoluteUrl(
	jobId: string,
	token?: string | null
): string {
	const path = `${base()}/${jobId}/pdf`;
	if (typeof window === 'undefined') {
		return path;
	}
	const url = new URL(path, window.location.origin);
	const t = token?.trim();
	if (t) {
		url.searchParams.set('token', t);
	}
	return url.href;
}

/**
 * Direct browser downloads can only use the short-lived server token. Without it,
 * callers must keep the authenticated Blob fallback so bearer tokens never move
 * into URLs.
 */
export function ewrpPdfDirectDownloadUrl(
	jobId: string,
	token?: string | null
): string | null {
	const t = token?.trim();
	if (!t) {
		return null;
	}
	return ewrpPdfAbsoluteUrl(jobId, t);
}
