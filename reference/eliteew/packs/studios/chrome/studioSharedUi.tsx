/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared Creative Studio UI: flow cards, panels, desktop-bound skeletons.
 *
 * Invariants:
 * - Skeleton motion uses `DesktopAppSkeleton` + `ew-skeleton-pulse` (desktop shell tokens).
 *
 * Related:
 * - studioChrome.tsx, VideoStudio/, ImageStudio/
 */

import * as React from 'react';
import { api } from '@/services/api/client';
import { cn } from '@/lib/utils';
import { DesktopAppSkeleton } from '@/pages/Desktop/components/DesktopAppChrome';
import {
	useCreativeStudioShellClasses,
	studioFieldMetaClass,
} from './studioChrome';
import {
	ArrowPathIcon,
	FilmIcon,
	PhotoIcon,
} from '@heroicons/react/24/outline';

export const STUDIO_SKELETON_MOTION = cn(
	'ew-skeleton-pulse motion-reduce:animate-none motion-reduce:opacity-80'
);

export interface CreativeStudioFlowCardProps {
	step: number;
	title: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
}

export function CreativeStudioFlowCard({
	step,
	title,
	description,
	children,
	className,
}: CreativeStudioFlowCardProps) {
	const { studioPanelClass } = useCreativeStudioShellClasses();
	return (
		<article
			className={cn(
				studioPanelClass,
				'relative min-w-0 overflow-hidden shadow-(--desktop-shadow-soft)',
				className
			)}
		>
			<div
				className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,rgb(var(--desktop-accent-rgb)/0.85),rgb(var(--desktop-accent-rgb)/0.25))]"
				aria-hidden
			/>
			<div className="relative p-5 pl-6 sm:p-6 sm:pl-7">
				<header className="mb-4 flex items-start gap-3">
					<span
						className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-(--desktop-radius-lg) bg-[rgb(var(--desktop-accent-rgb)/0.14)] text-sm font-semibold text-[rgb(var(--desktop-accent-rgb)/0.95)] ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.22)]"
						aria-hidden
					>
						{step}
					</span>
					<div className="min-w-0">
						<h3 className="text-sm font-semibold tracking-[-0.01em] text-(--desktop-text-primary)">
							{title}
						</h3>
						{description ? (
							<p className={cn(studioFieldMetaClass, 'mt-1 leading-relaxed')}>
								{description}
							</p>
						) : null}
					</div>
				</header>
				{children}
			</div>
		</article>
	);
}

export interface CreativeStudioPanelCardProps {
	title: string;
	hint?: string;
	children: React.ReactNode;
	className?: string;
	accent?: boolean;
}

export function CreativeStudioPanelCard({
	title,
	hint,
	children,
	className,
	accent = false,
}: CreativeStudioPanelCardProps) {
	const { studioPanelClass } = useCreativeStudioShellClasses();
	return (
		<section
			className={cn(
				studioPanelClass,
				'min-h-0 min-w-0 overflow-hidden shadow-(--desktop-shadow-soft)',
				accent && 'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.18)]',
				className
			)}
		>
			<div className="border-b border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/50 px-5 py-3.5 sm:px-6">
				<h3 className="text-sm font-semibold text-(--desktop-text-primary)">
					{title}
				</h3>
				{hint ? (
					<p className="mt-0.5 text-xs text-(--desktop-text-dim)">{hint}</p>
				) : null}
			</div>
			<div className="p-4 sm:p-5">{children}</div>
		</section>
	);
}

export function CreativeStudioHistoryGridSkeleton({
	count = 6,
	thumbAspect = 'video',
	ariaLabel = 'Загрузка списка',
}: {
	count?: number;
	thumbAspect?: 'video' | 'square';
	ariaLabel?: string;
}) {
	const { studioHistoryCardClass } = useCreativeStudioShellClasses();
	const aspectClass =
		thumbAspect === 'square' ? 'aspect-square' : 'aspect-video';
	return (
		<ul
			className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3 2xl:grid-cols-4"
			aria-busy="true"
			aria-label={ariaLabel}
		>
			{(['a', 'b', 'c', 'd', 'e', 'f'] as const).slice(0, count).map((slot) => (
				<li
					key={`studio-history-skeleton-${slot}`}
					className={cn(studioHistoryCardClass, 'overflow-hidden')}
				>
					<DesktopAppSkeleton
						className={cn(
							aspectClass,
							'w-full rounded-none border-0',
							STUDIO_SKELETON_MOTION
						)}
					/>
					<div className="space-y-2 border-t border-(--desktop-border-subtle) p-3">
						<DesktopAppSkeleton
							className={cn('h-4 w-[78%] rounded-md', STUDIO_SKELETON_MOTION)}
						/>
						<DesktopAppSkeleton
							className={cn('h-3 w-[42%] rounded-md', STUDIO_SKELETON_MOTION)}
						/>
						<DesktopAppSkeleton
							className={cn(
								'mt-1 h-9 w-full rounded-xl',
								STUDIO_SKELETON_MOTION
							)}
						/>
					</div>
				</li>
			))}
		</ul>
	);
}

export function CreativeStudioHistoryThumbSkeleton() {
	return (
		<DesktopAppSkeleton
			className={cn(
				'absolute inset-0 rounded-none border-0',
				STUDIO_SKELETON_MOTION
			)}
		/>
	);
}

export function CreativeStudioGeneratingPreview({
	statusMessage,
	previewAspect = 'video',
	overlayImageUrl,
}: {
	statusMessage: string;
	previewAspect?: 'video' | 'square';
	overlayImageUrl?: string | null;
}) {
	const { studioPreviewWellClass } = useCreativeStudioShellClasses();
	const aspectClass =
		previewAspect === 'square'
			? 'aspect-square max-w-sm'
			: 'aspect-video max-w-md';
	return (
		<div
			className={cn(
				studioPreviewWellClass,
				'flex min-h-[260px] flex-col items-center justify-center gap-4 px-4 py-8 text-center sm:min-h-[300px]'
			)}
			role="status"
			aria-live="polite"
		>
			<div
				className={cn(
					'relative w-full overflow-hidden rounded-(--desktop-radius-xl) ring-1 ring-(--desktop-border-subtle)',
					aspectClass
				)}
			>
				{overlayImageUrl ? (
					<img
						src={overlayImageUrl}
						alt=""
						className="h-full w-full object-cover opacity-70"
					/>
				) : (
					<DesktopAppSkeleton
						className={cn(
							'h-full w-full rounded-none border-0',
							STUDIO_SKELETON_MOTION
						)}
					/>
				)}
				<div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.35))]" />
				<div className="absolute inset-x-0 bottom-0 space-y-2 p-4">
					<DesktopAppSkeleton
						className={cn('h-2 w-2/3 rounded-full', STUDIO_SKELETON_MOTION)}
					/>
					<DesktopAppSkeleton
						className={cn('h-2 w-1/2 rounded-full', STUDIO_SKELETON_MOTION)}
					/>
				</div>
			</div>
			<div className="flex items-center gap-2 text-sm text-(--desktop-text-secondary)">
				<ArrowPathIcon
					className="h-5 w-5 animate-spin text-[rgb(var(--desktop-accent-rgb)/0.9)] motion-reduce:animate-none"
					aria-hidden
				/>
				<span>{statusMessage}</span>
			</div>
		</div>
	);
}

export function CreativeStudioImageHistoryThumb({
	contentId,
}: {
	contentId: string;
}) {
	const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
	const frameRef = React.useRef<HTMLDivElement>(null);
	const [inView, setInView] = React.useState(false);
	const [failed, setFailed] = React.useState(false);
	const [loading, setLoading] = React.useState(false);

	React.useEffect(() => {
		const el = frameRef.current;
		if (!el) return undefined;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) setInView(true);
			},
			{ rootMargin: '160px', threshold: 0.01 }
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	React.useEffect(() => {
		if (!inView || !contentId) return undefined;
		let cancelled = false;
		setLoading(true);
		const load = async () => {
			try {
				const blob = await api.get(`/api/v1/content/${contentId}/download`, {
					baseURL: '',
					responseType: 'blob',
				});
				if (cancelled) return;
				const b = blob as unknown as Blob;
				if (!b?.size) {
					setFailed(true);
					return;
				}
				setBlobUrl(URL.createObjectURL(b));
			} catch {
				if (!cancelled) setFailed(true);
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
			setBlobUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return null;
			});
		};
	}, [inView, contentId]);

	return (
		<div
			ref={frameRef}
			className="absolute inset-0 flex items-center justify-center bg-(--desktop-surface-soft)"
		>
			{loading && !blobUrl ? <CreativeStudioHistoryThumbSkeleton /> : null}
			{blobUrl && !failed ? (
				<img
					src={blobUrl}
					alt=""
					className="absolute inset-0 h-full w-full object-contain"
				/>
			) : failed ? (
				<PhotoIcon className="h-10 w-10 text-(--desktop-text-muted)" />
			) : null}
		</div>
	);
}

export function CreativeStudioVideoHistoryThumb({
	contentId,
}: {
	contentId: string;
}) {
	const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
	const frameRef = React.useRef<HTMLDivElement>(null);
	const [inView, setInView] = React.useState(false);
	const [failed, setFailed] = React.useState(false);
	const [loading, setLoading] = React.useState(false);

	React.useEffect(() => {
		const el = frameRef.current;
		if (!el) return undefined;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) setInView(true);
			},
			{ rootMargin: '160px', threshold: 0.01 }
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	React.useEffect(() => {
		if (!inView || !contentId) return undefined;
		let cancelled = false;
		setLoading(true);
		const load = async () => {
			try {
				const blob = await api.get(`/content/${contentId}/download`, {
					baseURL: '/api/v1',
					responseType: 'blob',
				});
				if (cancelled) return;
				const b = blob as unknown as Blob;
				if (!b?.size) {
					setFailed(true);
					return;
				}
				setBlobUrl(URL.createObjectURL(b));
			} catch {
				if (!cancelled) setFailed(true);
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
			setBlobUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return null;
			});
		};
	}, [inView, contentId]);

	return (
		<div
			ref={frameRef}
			className="absolute inset-0 flex items-center justify-center bg-(--desktop-surface-soft)"
		>
			{loading && !blobUrl ? <CreativeStudioHistoryThumbSkeleton /> : null}
			{blobUrl && !failed ? (
				<video
					src={blobUrl}
					muted
					playsInline
					preload="metadata"
					className="absolute inset-0 h-full w-full object-cover"
				/>
			) : failed ? (
				<FilmIcon className="h-10 w-10 text-(--desktop-text-muted)" />
			) : null}
		</div>
	);
}
