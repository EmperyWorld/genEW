/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * In-app fullscreen PDF presentation viewer for completed EWRP jobs (iframe + page hash).
 *
 * Invariants:
 * - Loads PDF blob via authenticated API; revokes object URL on unmount.
 *
 * Related:
 * - `EWRPGeneratorMain.tsx`, `ewrpApi.downloadPdf`
 */
import { ewrpApi } from '@/services/ewrpApi';
import { notify } from '@/notifications';
import { cn } from '@/utils/cn';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DESKTOP_CHROME_FOCUS_VISIBLE } from '@/pages/Desktop/components/DesktopAppChrome';
import {
	DESKTOP_LUCIDE,
	DESKTOP_OVERLAY,
	DESKTOP_TYPOGRAPHY,
} from '@/pages/Desktop/constants';
import { useDesktopShellFrame } from '@/pages/Desktop/context/DesktopShellFrameContext';
import { getDesktopShellPanelClassName } from '@/pages/Desktop/utils/desktopVisualSystem';
import { ewrpZIndexClass } from './ewrpZIndex';
import { useEwrpDialogFocusTrap } from './useEwrpDialogFocusTrap';
import { EwrpExpandableClampedText } from './EwrpExpandableClampedText';
import {
	ArrowPathIcon,
	ArrowsPointingInIcon,
	ArrowsPointingOutIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	PresentationChartBarIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';

const SOFT_MAX_PAGE_STEP = 998;

export type EwrpPdfPresentationViewerProps = {
	open: boolean;
	onClose: () => void;
	jobId: string;
	presentationTitle: string;
};

export function EwrpPdfPresentationViewer({
	open,
	onClose,
	jobId,
	presentationTitle,
}: EwrpPdfPresentationViewerProps) {
	const { t } = useTranslation('ewrp');
	const stageRef = useRef<HTMLDivElement>(null);
	const [blobUrl, setBlobUrl] = useState<string | null>(null);
	const [loadingPdf, setLoadingPdf] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [pageNumber, setPageNumber] = useState(1);
	const [fullscreen, setFullscreen] = useState(false);
	const blobUrlRef = useRef<string | null>(null);
	const shellFrame = useDesktopShellFrame();
	const stagePanelClass = useMemo(
		() => getDesktopShellPanelClassName(shellFrame, 'strong'),
		[shellFrame]
	);

	useEwrpDialogFocusTrap(stageRef, open);

	const replaceBlobUrl = useCallback((next: string | null) => {
		if (blobUrlRef.current) {
			URL.revokeObjectURL(blobUrlRef.current);
			blobUrlRef.current = null;
		}
		if (next) {
			blobUrlRef.current = next;
		}
		setBlobUrl(next);
	}, []);

	useEffect(() => {
		if (!open || !jobId) {
			replaceBlobUrl(null);
			setLoadError(null);
			setPageNumber(1);
			setLoadingPdf(false);
			if (document.fullscreenElement && document.exitFullscreen) {
				void document.exitFullscreen().catch(() => {});
			}
			setFullscreen(false);
			return;
		}
		let cancelled = false;
		setLoadingPdf(true);
		setLoadError(null);
		setPageNumber(1);
		replaceBlobUrl(null);

		void ewrpApi
			.downloadPdf(jobId)
			.then((blob) => {
				if (cancelled) return;
				if (!blob || blob.size === 0) {
					setLoadError(t('presentation.loadErrorEmpty'));
					return;
				}
				replaceBlobUrl(URL.createObjectURL(blob));
			})
			.catch(() => {
				if (!cancelled) {
					setLoadError(t('presentation.loadError'));
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoadingPdf(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [open, jobId, replaceBlobUrl, t]);

	useEffect(() => {
		return () => {
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
				return;
			}
			if (e.key === 'ArrowRight' && blobUrl) {
				e.preventDefault();
				setPageNumber((p) => Math.min(SOFT_MAX_PAGE_STEP, p + 1));
			}
			if (e.key === 'ArrowLeft' && blobUrl) {
				e.preventDefault();
				setPageNumber((p) => Math.max(1, p - 1));
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, blobUrl, onClose]);

	const toggleFullscreen = useCallback(async () => {
		const el = stageRef.current;
		if (!el) return;
		try {
			if (!document.fullscreenElement) {
				await el.requestFullscreen();
			} else {
				await document.exitFullscreen();
			}
		} catch {
			notify.error(t('presentation.fullscreenFailed'));
		}
	}, [t]);

	useEffect(() => {
		const onFs = () => {
			setFullscreen(Boolean(document.fullscreenElement));
		};
		document.addEventListener('fullscreenchange', onFs);
		return () => document.removeEventListener('fullscreenchange', onFs);
	}, []);

	if (!open) {
		return null;
	}

	const iframeSrc = blobUrl ? `${blobUrl}#page=${pageNumber}` : null;

	const closeBtnClass = cn(
		'inline-flex shrink-0 items-center justify-center rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-2 text-(--desktop-text-secondary) transition-colors',
		'hover:border-[rgb(var(--desktop-accent-rgb)/0.35)] hover:bg-(--desktop-surface-soft-hover) hover:text-(--desktop-text-primary)',
		DESKTOP_CHROME_FOCUS_VISIBLE
	);

	const navBtnClass = cn(
		'inline-flex items-center justify-center rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-panel) px-4 py-3 text-(--desktop-text-primary) transition-colors',
		'enabled:hover:border-[rgb(var(--desktop-accent-rgb)/0.4)] enabled:hover:bg-(--desktop-surface-soft-hover)',
		'disabled:cursor-not-allowed disabled:opacity-40',
		DESKTOP_CHROME_FOCUS_VISIBLE
	);

	return (
		<div
			className={cn(
				'fixed inset-0 flex items-center justify-center p-3 sm:p-5',
				ewrpZIndexClass.pdfViewer,
				DESKTOP_OVERLAY.backdrop
			)}
			role="dialog"
			aria-modal="true"
			aria-labelledby="ewrp-pdf-viewer-title"
		>
			<button
				type="button"
				className="absolute inset-0 cursor-default"
				aria-label={t('presentation.closeBackdrop')}
				onClick={onClose}
			/>
			<div
				ref={stageRef}
				role="document"
				className={cn(
					'relative z-10 flex w-full max-w-5xl flex-col overflow-hidden shadow-2xl',
					stagePanelClass,
					fullscreen
						? 'box-border h-screen max-h-none min-h-0 w-screen max-w-none rounded-none border-0 p-0'
						: 'h-[min(92vh,56rem)] max-h-[94vh] min-h-[min(50vh,28rem)]'
				)}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<header className="flex shrink-0 items-center gap-3 border-b border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/80 px-4 py-3">
					<PresentationChartBarIcon
						className="h-5 w-5 shrink-0 text-[rgb(var(--desktop-accent-rgb)/0.95)]"
						strokeWidth={DESKTOP_LUCIDE.stroke}
						aria-hidden
					/>
					<div className="min-w-0 flex-1">
						<EwrpExpandableClampedText
							id="ewrp-pdf-viewer-title"
							embedded
							tone="secondary"
							text={presentationTitle || t('presentation.titleFallback')}
							textClassName="text-sm font-semibold text-(--desktop-text-primary)"
							expandLabelKey="presentation.titleExpand"
							collapseLabelKey="presentation.titleCollapse"
							maxLines={1}
						/>
						<p
							className={cn(
								'mt-0.5 text-[11px] text-(--desktop-text-dim)',
								DESKTOP_TYPOGRAPHY.meta
							)}
						>
							{t('presentation.hint')}
						</p>
					</div>
					<button
						type="button"
						className={closeBtnClass}
						onClick={() => void toggleFullscreen()}
						title={
							fullscreen
								? t('presentation.exitFullscreen')
								: t('presentation.fullscreen')
						}
						aria-label={
							fullscreen
								? t('presentation.exitFullscreen')
								: t('presentation.fullscreen')
						}
					>
						{fullscreen ? (
							<ArrowsPointingInIcon
								className="h-4 w-4"
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						) : (
							<ArrowsPointingOutIcon
								className="h-4 w-4"
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						)}
					</button>
					<button
						type="button"
						className={closeBtnClass}
						onClick={onClose}
						title={t('presentation.close')}
						aria-label={t('presentation.close')}
					>
						<XMarkIcon
							className="h-4 w-4"
							strokeWidth={DESKTOP_LUCIDE.stroke}
						/>
					</button>
				</header>

				<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--desktop-surface-void)_92%,black_8%)] px-1 py-1 sm:px-2 sm:py-2">
					{loadingPdf ? (
						<div
							className="flex min-h-56 flex-col items-center justify-center gap-3 text-(--desktop-text-secondary)"
							role="status"
						>
							<ArrowPathIcon
								className="h-8 w-8 animate-spin text-[rgb(var(--desktop-accent-rgb)/0.9)]"
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
							<span className={DESKTOP_TYPOGRAPHY.body}>
								{t('presentation.loading')}
							</span>
						</div>
					) : loadError ? (
						<div
							className={cn(
								'flex min-h-56 items-center justify-center p-4 text-center text-sm text-red-300/95',
								DESKTOP_TYPOGRAPHY.body
							)}
						>
							{loadError}
						</div>
					) : iframeSrc ? (
						<iframe
							key={`${iframeSrc}`}
							title={presentationTitle || t('presentation.titleFallback')}
							src={iframeSrc}
							className="h-full min-h-0 w-full flex-1 rounded-lg border-0 bg-black/10"
						/>
					) : null}
				</div>

				<footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/90 px-3 py-3 sm:gap-4">
					<button
						type="button"
						className={navBtnClass}
						disabled={pageNumber <= 1 || !blobUrl}
						onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
						aria-label={t('presentation.prev')}
					>
						<ChevronLeftIcon
							className="h-5 w-5"
							strokeWidth={DESKTOP_LUCIDE.stroke}
						/>
					</button>
					<span className="min-w-28 text-center text-xs tabular-nums text-(--desktop-text-secondary) sm:min-w-36">
						{blobUrl
							? t('presentation.pageOf', {
									current: pageNumber,
									count: '…',
								})
							: '—'}
					</span>
					<button
						type="button"
						className={navBtnClass}
						disabled={!blobUrl || pageNumber >= SOFT_MAX_PAGE_STEP}
						onClick={() =>
							setPageNumber((p) => Math.min(SOFT_MAX_PAGE_STEP, p + 1))
						}
						aria-label={t('presentation.next')}
					>
						<ChevronRightIcon
							className="h-5 w-5"
							strokeWidth={DESKTOP_LUCIDE.stroke}
						/>
					</button>
				</footer>
			</div>
		</div>
	);
}
