/**
 * Detects unified-catalog audio files for desktop actions (e.g. «Включить в плеере»).
 */

export function isUnifiedContentAudioLike(input: {
	content_type?: string | null;
	mime_type?: string | null;
	name?: string | null;
	fileType?: string | null;
}): boolean {
	const ct = (input.content_type ?? input.fileType ?? '').toLowerCase().trim();
	if (ct === 'audio' || ct.includes('audio')) return true;
	const mt = (input.mime_type ?? '').toLowerCase().trim();
	if (mt.startsWith('audio/')) return true;
	const n = (input.name ?? '').toLowerCase();
	return /\.(mp3|wav|flac|m4a|aac|ogg|opus|wma|aif|aiff)$/.test(n);
}
