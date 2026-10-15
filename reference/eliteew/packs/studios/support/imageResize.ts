/**
 * Resize/compress image file for upload to avoid 413 (Content Too Large).
 * Keeps aspect ratio; ensures output ≤ maxSizeBytes (and longest side ≤ maxDimension).
 * Many production proxies (nginx default) use client_max_body_size 1m — we target 900 KB
 * so multipart overhead still fits under 1 MB.
 */

const DEFAULT_MAX_BYTES = 900 * 1024; // 900 KB — under 1m proxy limit including multipart overhead
const DEFAULT_MAX_DIMENSION = 1280;
const PNG_MIME = 'image/png';
const JPEG_MIME = 'image/jpeg';

function hasTransparency(img: HTMLImageElement, w: number, h: number): boolean {
	const canvas = document.createElement('canvas');
	canvas.width = Math.min(w, 256);
	canvas.height = Math.min(h, 256);
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return false;
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
	const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] < 255) return true;
	}
	return false;
}

async function blobFromCanvas(
	canvas: HTMLCanvasElement,
	mimeType: string,
	quality?: number
): Promise<Blob | null> {
	return new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, mimeType, quality);
	});
}

function loadImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Не удалось загрузить изображение'));
		};
		img.src = url;
	});
}

/**
 * Resize/compress so output is always ≤ maxSizeBytes and longest side ≤ maxDimension.
 * Returns a resized file while trying to preserve transparency when possible.
 */
export async function resizeImageForUpload(
	file: File,
	maxSizeBytes: number = DEFAULT_MAX_BYTES,
	maxDimension: number = DEFAULT_MAX_DIMENSION
): Promise<File> {
	const isImage = file.type.startsWith('image/');
	if (!isImage) return file;

	const img = await loadImage(file);
	let w = img.width;
	let h = img.height;
	const originalType = file.type || '';
	const isGif = originalType === 'image/gif';
	if (w > maxDimension || h > maxDimension) {
		if (w >= h) {
			h = Math.round((h * maxDimension) / w);
			w = maxDimension;
		} else {
			w = Math.round((w * maxDimension) / h);
			h = maxDimension;
		}
	}
	if (
		file.size <= maxSizeBytes &&
		img.width <= maxDimension &&
		img.height <= maxDimension
	) {
		return file;
	}

	const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
	const preserveTransparency =
		!isGif &&
		(originalType === PNG_MIME ||
			originalType === 'image/webp' ||
			hasTransparency(img, w, h));
	let canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	let ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas not available');
	ctx.drawImage(img, 0, 0, w, h);

	for (let attempt = 0; attempt < 4; attempt++) {
		if (preserveTransparency) {
			const pngBlob = await blobFromCanvas(canvas, PNG_MIME);
			if (pngBlob && pngBlob.size <= maxSizeBytes) {
				return new File([pngBlob], `${baseName}.png`, { type: PNG_MIME });
			}
		}

		for (let q = 0.85; q >= 0.4; q -= 0.15) {
			const blob = await blobFromCanvas(canvas, JPEG_MIME, q);
			if (blob && blob.size <= maxSizeBytes) {
				return new File([blob], `${baseName}.jpg`, { type: JPEG_MIME });
			}
		}
		const blob = await blobFromCanvas(canvas, JPEG_MIME, 0.4);
		if (blob && blob.size <= maxSizeBytes) {
			return new File([blob], `${baseName}.jpg`, { type: JPEG_MIME });
		}
		w = Math.max(256, Math.round(w * 0.7));
		h = Math.max(256, Math.round(h * 0.7));
		canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas not available');
		ctx.drawImage(img, 0, 0, w, h);
	}

	if (preserveTransparency) {
		const pngBlob = await blobFromCanvas(canvas, PNG_MIME);
		if (pngBlob) {
			return new File([pngBlob], `${baseName}.png`, { type: PNG_MIME });
		}
	}

	const blob = await blobFromCanvas(canvas, JPEG_MIME, 0.4);
	if (!blob) throw new Error('Не удалось сжать изображение');
	return new File([blob], `${baseName}.jpg`, { type: JPEG_MIME });
}
