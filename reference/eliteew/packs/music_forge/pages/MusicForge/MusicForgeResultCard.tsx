/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * MusicForge result surface: inline preview, desktop Now Playing handoff, and
 * like/dislike (forge feedback + Music Player «Любимые» on like).
 *
 * Invariants:
 * - Result links come from backend `result_payload`; the component does not construct storage paths.
 * - Feedback is sent only after a completed run with generated content exists.
 * - Global playback uses `content_id` via `requestPlayInMusicPlayer` (not the local blob URL).
 *
 * Related:
 * - src/pages/MusicForge/MusicForgeApp.tsx
 * - src/pages/MusicForge/musicForgeUiHelpers.ts
 * - documentation/product/MUSIC-FORGE-APP.md
 */

import {
	ArrowDownTrayIcon,
	FolderOpenIcon,
	HandThumbDownIcon,
	HandThumbUpIcon,
	PlayIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DesktopAppButton } from '@/pages/Desktop/components/DesktopAppChrome';
import { useMusicLibraryContext } from '@/pages/Desktop/context/MusicLibraryContext';
import {
	requestOpenDesktopApp,
	requestPlayInMusicPlayer,
} from '@/pages/Desktop/utils/desktopDeepLink';
import {
	fetchMusicForgeResultAudioBlob,
	normalizeMusicForgeDownloadPath,
	recordMusicForgeFeedback,
	resolveMusicForgeResultAudioStreamUrl,
	type MusicForgeRun,
} from '@/services/musicForge/musicForgeApi';
import { cn } from '@/utils/cn';
import {
	claimMusicForgeAutoPlay,
	MUSIC_FORGE_DISLIKE_REASON_CODES,
	type MusicForgeDislikeReasonCode,
	readMusicForgeFeedbackRating,
	resolveMusicForgeContentId,
	stringField,
	writeMusicForgeFeedbackRating,
} from './musicForgeUiHelpers';

const LYRICS_OPEN_KEY_PREFIX = 'musicForge.lyricsOpen.';

function playForgeTrackInDesktopPlayer(args: {
	contentId: string;
	name: string;
}): void {
	requestPlayInMusicPlayer({
		id: args.contentId,
		name: args.name,
		mime_type: 'audio/mpeg',
		source_surface: 'music-generator',
	});
}

export function MusicForgeResultCard({ run }: { run: MusicForgeRun | null }) {
	const { t } = useTranslation('desktopUi');
	const { favoriteIdsSet, toggleFavorite, upsertTrack } =
		useMusicLibraryContext();
	const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null);
	const [feedbackOk, setFeedbackOk] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [feedbackError, setFeedbackError] = useState<string | null>(null);
	const [selectedDislikeReason, setSelectedDislikeReason] =
		useState<MusicForgeDislikeReasonCode | null>(null);
	const [audioUrl, setAudioUrl] = useState<string | null>(null);
	const [audioError, setAudioError] = useState<string | null>(null);
	const [lyricsDefaultOpen, setLyricsDefaultOpen] = useState(false);
	const [playError, setPlayError] = useState<string | null>(null);

	const downloadUrl =
		run?.status === 'completed'
			? stringField(run.result_payload.download_url)
			: '';
	const normalizedDownloadPath = downloadUrl
		? normalizeMusicForgeDownloadPath(downloadUrl)
		: '';
	const name =
		run?.status === 'completed'
			? stringField(run.result_payload.name) ||
				t('musicForge.result.fallbackTitle')
			: t('musicForge.result.fallbackTitle');
	const style =
		run?.status === 'completed' ? stringField(run.style_capsule.caption) : '';
	const lyrics =
		run?.status === 'completed' ? stringField(run.lyrics_payload.lyrics) : '';
	const contentId =
		run?.status === 'completed' ? resolveMusicForgeContentId(run) : '';

	useEffect(() => {
		if (!run?.id || run.status !== 'completed') {
			setFeedback(null);
			setFeedbackOk(null);
			return;
		}
		setFeedback(readMusicForgeFeedbackRating(run.id));
		setFeedbackOk(null);
		setFeedbackError(null);
		setPlayError(null);
	}, [run?.id, run?.status]);

	useEffect(() => {
		if (run?.status !== 'completed') return;
		const key = `${LYRICS_OPEN_KEY_PREFIX}${run.id}`;
		if (sessionStorage.getItem(key) === '1') {
			setLyricsDefaultOpen(true);
			return;
		}
		sessionStorage.setItem(key, '1');
		setLyricsDefaultOpen(true);
	}, [run]);

	useEffect(() => {
		if (run?.status !== 'completed' || !contentId || !run.id) return;
		if (!claimMusicForgeAutoPlay(run.id)) return;
		upsertTrack({
			id: contentId,
			name,
			thumbnail_url: null,
			mime_type: 'audio/mpeg',
			source_surface: 'music-generator',
		});
		playForgeTrackInDesktopPlayer({ contentId, name });
	}, [contentId, name, run?.id, run?.status, upsertTrack]);

	useEffect(() => {
		let cancelled = false;
		let objectUrl: string | null = null;
		const controller = new AbortController();
		setAudioUrl(null);
		setAudioError(null);
		if (!downloadUrl) return undefined;

		void (async () => {
			try {
				const streamUrl = await resolveMusicForgeResultAudioStreamUrl(
					downloadUrl,
					{ signal: controller.signal }
				);
				if (cancelled) return;
				if (streamUrl) {
					setAudioUrl(streamUrl);
					return;
				}
				const blob = await fetchMusicForgeResultAudioBlob(downloadUrl, {
					signal: controller.signal,
				});
				if (cancelled) return;
				if (!(blob instanceof Blob) || blob.size <= 0) {
					throw new Error('MusicForge result audio is empty');
				}
				objectUrl = URL.createObjectURL(blob);
				setAudioUrl(objectUrl);
			} catch {
				if (!cancelled) {
					setAudioError(t('musicForge.result.audioLoadFailed'));
				}
			}
		})();

		return () => {
			cancelled = true;
			controller.abort();
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [downloadUrl, t]);

	if (run?.status !== 'completed') return null;

	const playInDesktopPlayer = () => {
		setPlayError(null);
		if (!contentId) {
			setPlayError(t('musicForge.result.playMissingContent'));
			return;
		}
		upsertTrack({
			id: contentId,
			name,
			thumbnail_url: null,
			mime_type: 'audio/mpeg',
			source_surface: 'music-generator',
		});
		playForgeTrackInDesktopPlayer({ contentId, name });
	};

	const sendFeedback = async (rating: 'like' | 'dislike') => {
		if (pending) return;
		if (!contentId) {
			setFeedbackError(t('musicForge.result.feedbackMissingContent'));
			setFeedbackOk(null);
			return;
		}
		if (rating === 'dislike' && !selectedDislikeReason) {
			setFeedbackError(t('musicForge.result.dislikeReasonRequired'));
			setFeedbackOk(null);
			return;
		}
		setPending(true);
		setFeedbackError(null);
		setFeedbackOk(null);
		try {
			await recordMusicForgeFeedback(run.id, {
				rating,
				...(rating === 'dislike'
					? { reason_code: selectedDislikeReason ?? 'other' }
					: {}),
			});
			setFeedback(rating);
			writeMusicForgeFeedbackRating(run.id, rating);
			if (rating === 'like') {
				upsertTrack({
					id: contentId,
					name,
					thumbnail_url: null,
					mime_type: 'audio/mpeg',
					source_surface: 'music-generator',
				});
				if (!favoriteIdsSet.has(contentId)) {
					toggleFavorite(contentId);
				}
				setFeedbackOk(t('musicForge.result.feedbackLikeSaved'));
			} else {
				setFeedbackOk(t('musicForge.result.feedbackDislikeSaved'));
			}
		} catch {
			setFeedbackError(t('musicForge.result.feedbackFailed'));
		} finally {
			setPending(false);
		}
	};

	const openLibrary = () => {
		requestOpenDesktopApp({
			appComponent: 'ContentManagerPro',
			contentManagerFolderItemId: 'music',
		});
	};

	const showNoPlaybackShell = !downloadUrl || (!audioUrl && audioError);

	return (
		<section className="overflow-hidden rounded-3xl border border-emerald-300/25 bg-linear-to-br from-emerald-500/12 via-black/20 to-fuchsia-500/10 p-5 shadow-2xl">
			<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
						{t('musicForge.result.readyLabel')}
					</p>
					<h3 className="text-2xl font-bold text-white">{name}</h3>
					<p className="mt-1 max-w-2xl text-sm text-(--desktop-text-secondary)">
						{style || t('musicForge.result.styleFallback')}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<DesktopAppButton
						type="button"
						variant="accent"
						onClick={playInDesktopPlayer}
					>
						<PlayIcon className="size-4" />
						{t('musicForge.result.playInPlayer')}
					</DesktopAppButton>
					<DesktopAppButton type="button" variant="ghost" onClick={openLibrary}>
						<FolderOpenIcon className="size-4" />
						{t('musicForge.result.openLibrary')}
					</DesktopAppButton>
				</div>
			</div>

			{playError ? (
				<p className="mb-3 text-sm text-rose-200" role="alert">
					{playError}
				</p>
			) : null}

			{showNoPlaybackShell ? (
				<div
					className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-50"
					role="status"
				>
					<p>
						{!downloadUrl
							? t('musicForge.result.noDownloadUrl')
							: (audioError ?? t('musicForge.result.audioLoadFailed'))}
					</p>
					<p className="mt-2 text-(--desktop-text-secondary)">
						{t('musicForge.result.libraryHint')}
					</p>
				</div>
			) : audioUrl ? (
				<div className="space-y-2">
					<audio className="w-full" controls preload="metadata" src={audioUrl}>
						<track kind="captions" />
					</audio>
					{normalizedDownloadPath ? (
						<a
							className="inline-flex items-center gap-1.5 text-sm text-amber-100 underline-offset-2 hover:underline"
							href={normalizedDownloadPath}
							download
						>
							<ArrowDownTrayIcon className="size-4" />
							{t('musicForge.result.download')}
						</a>
					) : null}
				</div>
			) : (
				<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-(--desktop-text-secondary)">
					{t('musicForge.result.audioLoading')}
				</div>
			)}

			<div className="mt-4 flex flex-wrap items-center gap-2">
				<DesktopAppButton
					type="button"
					variant={feedback === 'like' ? 'accent' : 'neutral'}
					disabled={pending}
					aria-pressed={feedback === 'like'}
					onClick={() => void sendFeedback('like')}
				>
					<HandThumbUpIcon className="size-4" />
					{t('musicForge.result.like')}
				</DesktopAppButton>
				<DesktopAppButton
					type="button"
					variant={feedback === 'dislike' ? 'danger' : 'neutral'}
					disabled={pending}
					aria-pressed={feedback === 'dislike'}
					onClick={() => void sendFeedback('dislike')}
				>
					<HandThumbDownIcon className="size-4" />
					{t('musicForge.result.dislike')}
				</DesktopAppButton>
			</div>

			<div className="mt-3 flex flex-wrap gap-2">
				{MUSIC_FORGE_DISLIKE_REASON_CODES.map((code) => (
					<button
						key={code}
						type="button"
						disabled={pending}
						aria-pressed={selectedDislikeReason === code}
						className={cn(
							'rounded-full border px-3 py-1 text-xs transition',
							selectedDislikeReason === code
								? 'border-rose-300/60 bg-rose-500/20 text-rose-50'
								: 'border-white/15 bg-black/20 text-(--desktop-text-secondary) hover:border-white/25'
						)}
						onClick={() =>
							setSelectedDislikeReason((prev) => (prev === code ? null : code))
						}
					>
						{t(`musicForge.result.dislikeReasons.${code}`)}
					</button>
				))}
			</div>

			{feedbackError ? (
				<p className="mt-2 text-sm text-rose-200" role="alert">
					{feedbackError}
				</p>
			) : null}
			{feedbackOk ? (
				<p className="mt-2 text-sm text-emerald-100" role="status">
					{feedbackOk}
				</p>
			) : null}

			{lyrics ? (
				<details
					className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"
					open={lyricsDefaultOpen}
				>
					<summary className="cursor-pointer text-sm font-semibold text-amber-100">
						{t('musicForge.result.lyricsTitle')}
					</summary>
					<pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-(--desktop-text-secondary)">
						{lyrics}
					</pre>
				</details>
			) : null}
		</section>
	);
}
