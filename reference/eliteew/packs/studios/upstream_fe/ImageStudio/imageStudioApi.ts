/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Image Studio HTTP helpers: idempotent POSTs, upload resize, download, base64→File, error mapping.
 *
 * Invariants:
 * - Every gen/suggest POST sends a fresh `Idempotency-Key` (UUID).
 * - 402 with detail.code `insufficient_credits` maps to a stable code for i18n.
 *
 * Related:
 * - documentation/product/IMAGE-STUDIO.md
 * - api/routers/image_studio.py
 * - api/routers/creative_studio_utils.py
 */

import { api } from '@/services/api/client';
import { getApiErrorMessage } from '@/utils/apiError';
import { resizeImageForUpload as resizeImageForUploadUtil } from '@/utils/imageResize';
import { confirmCreativeNonCommercialDownload } from '@/constants/creativeOutputNonCommercial';
import type {
	ImageStudioApiResponse,
	ImageStudioResult,
} from './workspaces/types';

export { resizeImageForUploadUtil as resizeImageForUpload };

export function newIdempotencyKey(): string {
	if (
		typeof crypto !== 'undefined' &&
		typeof crypto.randomUUID === 'function'
	) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function idempotencyHeaders(key?: string): { headers: Record<string, string> } {
	return {
		headers: {
			'Idempotency-Key': key?.trim() || newIdempotencyKey(),
		},
	};
}

export type MappedImageStudioError = {
	message: string;
	code?: 'insufficient_credits' | 'payload_too_large' | string;
	status?: number;
};

/**
 * Map API errors for Image Studio UI.
 * 402 + detail.code insufficient_credits → code for i18n; message from detail.message when present.
 */
export function mapApiError(error: unknown): MappedImageStudioError {
	const err = error as {
		response?: {
			status?: number;
			data?: { detail?: unknown };
		};
	};
	const status = err?.response?.status;
	const detail = err?.response?.data?.detail;

	if (status === 413) {
		return {
			status,
			code: 'payload_too_large',
			message:
				'Файл слишком большой для загрузки. Мы сжимаем изображение автоматически — попробуйте ещё раз.',
		};
	}

	if (
		status === 402 &&
		detail &&
		typeof detail === 'object' &&
		!Array.isArray(detail)
	) {
		const o = detail as { code?: unknown; message?: unknown };
		const code = typeof o.code === 'string' ? o.code : 'insufficient_credits';
		const message =
			typeof o.message === 'string' && o.message.trim()
				? o.message.trim()
				: getApiErrorMessage(error);
		return { status, code, message };
	}

	if (status === 402) {
		return {
			status,
			code: 'insufficient_credits',
			message: getApiErrorMessage(error),
		};
	}

	return { status, message: getApiErrorMessage(error) };
}

export async function postTextToImage(body: {
	prompt: string;
	width: number;
	height: number;
	seed?: number;
	idempotencyKey?: string;
}): Promise<ImageStudioApiResponse> {
	const payload: Record<string, unknown> = {
		prompt: body.prompt,
		width: body.width,
		height: body.height,
	};
	if (typeof body.seed === 'number' && !Number.isNaN(body.seed)) {
		payload.seed = body.seed;
	}
	return api.post<ImageStudioApiResponse>(
		'/image-studio/text-to-image',
		payload,
		{
			baseURL: '/api/v1',
			timeout: 320000,
			...idempotencyHeaders(body.idempotencyKey),
		}
	);
}

export async function postSuggestPrompt(body: {
	idea: string;
	language: 'en' | 'ru';
	idempotencyKey?: string;
}): Promise<{ prompt: string }> {
	return api.post<{ prompt: string }>(
		'/image-studio/suggest-prompt',
		{ idea: body.idea, language: body.language },
		{
			baseURL: '/api/v1',
			timeout: 120000,
			...idempotencyHeaders(body.idempotencyKey),
		}
	);
}

export async function postImageEdit(
	formData: FormData,
	idempotencyKey?: string
) {
	return api.post<ImageStudioApiResponse>(
		'/image-studio/image-edit',
		formData,
		{
			baseURL: '/api/v1',
			timeout: 320000,
			...idempotencyHeaders(idempotencyKey),
		}
	);
}

export async function postImageRotate(
	formData: FormData,
	idempotencyKey?: string
) {
	return api.post<ImageStudioApiResponse>(
		'/image-studio/image-rotate',
		formData,
		{
			baseURL: '/api/v1',
			timeout: 320000,
			...idempotencyHeaders(idempotencyKey),
		}
	);
}

export function downloadImage(
	img: ImageStudioResult,
	prefix: string,
	opts?: { skipConfirm?: boolean }
): void {
	if (!opts?.skipConfirm && !confirmCreativeNonCommercialDownload()) return;
	if (!img?.data) return;
	const a = document.createElement('a');
	a.href = `data:image/png;base64,${img.data}`;
	a.download = img.filename || `${prefix}.png`;
	a.click();
}

/** Convert base64 image payload to a File for edit/rotate handoff. */
export function base64ToFile(
	base64: string,
	filename = 'image-studio.png',
	mime = 'image/png'
): File {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new File([bytes], filename, { type: mime });
}

export function randomSeed(): number {
	return Math.floor(Math.random() * 2_147_483_647);
}
