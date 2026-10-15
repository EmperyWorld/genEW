/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Modal to preview a content file (image, video, audio, pdf, text) without opening Content Manager.
 *
 * Invariants:
 * - Uses ModalAdvanced for focus trap and Escape; blob URLs revoked on unmount.
 *
 * Related:
 * - DesktopChromeTooltip.tsx, Content Manager download API
 */

import { ModalAdvanced } from '@/components/ui/ModalAdvanced';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	MusicalNoteIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api/client';
import { contentApi } from '@/services/contentApi';
import { triggerBrowserDownloadFromBlob } from '@/utils/browserDownload';
import { DesktopAppButton } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

type PreviewType = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other';

/**
 * Same logic as Content Manager: use mime_type for PDF and text, content_type for media.
 * Document (docx, xlsx, etc.) without text/pdf mime → 'other' (download only).
 */
function getPreviewType(
	contentType: string,
	mimeType?: string | null
): PreviewType {
	const mime = (mimeType || '').toLowerCase();
	const t = (contentType || '').toLowerCase();
	if (mime === 'application/pdf') return 'pdf';
	if (
		mime.startsWith('text/') ||
		['application/json', 'application/xml', 'application/javascript'].includes(
			mime
		)
	)
		return 'text';
	if (t.includes('image') || t === 'image') return 'image';
	if (t.includes('video') || t === 'video') return 'video';
	if (t.includes('audio') || t === 'audio') return 'audio';
	if (t === 'pdf' || t.includes('pdf')) return 'pdf';
	if (t.includes('text')) return 'text';
	return 'other';
}

export interface FilePreviewModalProps {
	contentId: string;
	name: string;
	content_type: string;
	mime_type?: string | null;
	onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
	contentId,
	name,
	content_type,
	mime_type,
	onClose,
}) => {
	const { t } = useTranslation('desktopUi', { keyPrefix: 'filePreview' });
	const [blobUrl, setBlobUrl] = useState<string | null>(null);
	const [textContent, setTextContent] = useState<string>('');
	const [loading, setLoading] = useState(true);
	const [downloadBusy, setDownloadBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const blobUrlRef = useRef<string | null>(null);
	const previewBlobRef = useRef<Blob | null>(null);

	const previewType = getPreviewType(content_type, mime_type);

	useEffect(() => {
		if (previewType === 'other') {
			setLoading(false);
			return;
		}
		let cancelled = false;
		const fetchContent = async () => {
			try {
				if (previewType === 'text') {
					const response = await api.get<string>(
						`/content/${contentId}/download`,
						{
							baseURL: '/api/v1',
							responseType: 'text' as const,
						}
					);
					if (!cancelled) setTextContent(String(response).slice(0, 50000));
				} else {
					const response = await api.get(`/content/${contentId}/download`, {
						baseURL: '/api/v1',
						responseType: 'blob' as const,
					});
					const blob = response as unknown as Blob;
					const url = URL.createObjectURL(blob);
					if (cancelled) {
						URL.revokeObjectURL(url);
						return;
					}
					previewBlobRef.current = blob;
					blobUrlRef.current = url;
					setBlobUrl(url);
				}
			} catch (err: unknown) {
				if (!cancelled) {
					const status = (err as { response?: { status?: number } })?.response
						?.status;
					setError(status === 404 ? t('notFound') : t('loadFailed'));
					if (status === 404) {
						console.warn('[FilePreviewModal] Content not found (404)', {
							contentId,
						});
					}
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		fetchContent();
		return () => {
			cancelled = true;
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
			previewBlobRef.current = null;
		};
	}, [contentId, previewType, t]);

	const handleDownload = async () => {
		if (downloadBusy) return;
		setDownloadBusy(true);
		try {
			const cachedBlob = previewBlobRef.current;
			if (cachedBlob) {
				triggerBrowserDownloadFromBlob(cachedBlob, name || 'file');
				return;
			}
			await contentApi.downloadContentToBrowser({
				contentId,
				preferredFilename: name || 'file',
			});
		} catch (err) {
			console.error('[FilePreviewModal] ArrowDownTrayIcon failed', err);
		} finally {
			setDownloadBusy(false);
		}
	};

	const footer =
		!loading && !error && previewType !== 'other' ? (
			<div className="flex justify-end">
				<DesktopChromeTooltip
					content={t('download')}
					placement="top"
					offsetExtra={4}
				>
					<DesktopAppButton
						type="button"
						variant="neutral"
						size="sm"
						className="gap-2"
						onClick={handleDownload}
						disabled={downloadBusy}
						aria-busy={downloadBusy}
						aria-label={t('downloadAria')}
					>
						<ArrowDownTrayIcon className="h-4 w-4 shrink-0" />
						{downloadBusy ? t('preparingDownload') : t('download')}
					</DesktopAppButton>
				</DesktopChromeTooltip>
			</div>
		) : undefined;

	return (
		<ModalAdvanced
			isOpen={true}
			onClose={onClose}
			title={name || t('defaultTitle')}
			size="xl"
			variant="desktop"
			showCloseButton
			footer={footer}
		>
			<div className="p-2 overflow-auto min-h-0 flex items-center justify-center max-h-[75vh]">
				{loading && (
					<div className="flex items-center justify-center py-12">
						<ArrowPathIcon className="w-8 h-8 animate-spin motion-reduce:animate-none text-[rgb(var(--desktop-accent-rgb))]" />
					</div>
				)}
				{error && <div className="text-center py-12 text-red-600">{error}</div>}
				{!loading && !error && previewType === 'image' && blobUrl && (
					<img
						src={blobUrl}
						alt={name}
						className="max-w-full max-h-[70vh] object-contain rounded-lg"
					/>
				)}
				{!loading && !error && previewType === 'video' && blobUrl && (
					<video
						src={blobUrl}
						controls
						className="max-w-full max-h-[70vh] rounded-lg"
						title={name}
					>
						<track
							kind="captions"
							srcLang="ru"
							label={name || t('previewTrackLabel')}
						/>
					</video>
				)}
				{!loading && !error && previewType === 'audio' && blobUrl && (
					<div className="flex flex-col items-center gap-4 py-8">
						<div className="flex h-20 w-20 items-center justify-center rounded-xl bg-[rgb(var(--desktop-accent-rgb)/0.18)] text-[rgb(var(--desktop-accent-rgb))]">
							<MusicalNoteIcon className="w-10 h-10" />
						</div>
						<audio
							src={blobUrl}
							controls
							className="w-full max-w-md"
							title={name}
						>
							<track
								kind="captions"
								srcLang="ru"
								label={name || t('previewTrackLabel')}
							/>
						</audio>
					</div>
				)}
				{!loading && !error && previewType === 'pdf' && blobUrl && (
					<iframe
						src={blobUrl}
						className="min-h-[70vh] w-full rounded-lg border border-(--desktop-border-strong)"
						title={name}
					/>
				)}
				{!loading && !error && previewType === 'text' && (
					<pre className="max-h-[70vh] w-full max-w-3xl overflow-auto rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-4 text-left font-mono text-sm text-(--desktop-text-secondary) whitespace-pre-wrap">
						{textContent || t('emptyText')}
					</pre>
				)}
				{!loading && !error && previewType === 'other' && (
					<div className="py-8 text-center text-(--desktop-text-muted)">
						<p className="mb-4">{t('previewUnavailable')}</p>
						<DesktopChromeTooltip
							content={t('download')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="neutral"
								size="sm"
								className="gap-2"
								onClick={handleDownload}
								aria-label={t('downloadAria')}
							>
								<ArrowDownTrayIcon className="h-4 w-4 shrink-0" />
								{t('download')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					</div>
				)}
			</div>
		</ModalAdvanced>
	);
};
