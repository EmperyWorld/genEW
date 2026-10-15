/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Video Studio desktop app: animate a still image into a short clip with optional AI prompt helper.
 *
 * Invariants:
 * - Source image must be raster PNG/JPEG/WebP under 10 MB before upload.
 *
 * Related:
 * - api/routers/video_studio.py
 */

import * as React from 'react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api/client';
import { getApiErrorMessage } from '../../utils/apiError';
import { resizeImageForUpload } from '../../utils/imageResize';
import { cn } from '../../lib/utils';
import { CreativeStudioGuideTourModal } from '@/components/guided-tour/CreativeStudioGuideTourModal';
import { useDesktopGuideTourOpener } from '@/pages/Desktop/hooks/useDesktopGuideTourOpener';
import type { WindowInitialPayload } from '@/pages/Desktop/types/desktop.types';
import {
	StudioHeroHeader,
	useCreativeStudioShellClasses,
	studioPageEmbeddedShellClass,
	studioPageScrollRegionClass,
	studioPageChromeInsetClass,
	studioPageBodyInsetClass,
	studioTabLabelClass,
} from '../CreativeStudio/studioChrome';
import {
	VideoStudioCreateWorkspace,
	VideoStudioHistoryWorkspace,
} from './videoStudioWorkspace';
import {
	getVideoStudioGuideSteps,
	VIDEO_STUDIO_GUIDE_AUDIO_LS_KEY,
	VIDEO_STUDIO_GUIDE_ROOT_ID,
	VIDEO_STUDIO_GUIDE_TOUR_FOLDER,
} from './videoStudioGuideData';
import { useCreativeStudioUgsCosts } from '@/hooks/useCreativeStudioUgsCosts';
import type { Content } from '@/components/UnifiedContent/types';
import { UnifiedContentPickerModal } from '@/components/UnifiedContent/picker/UnifiedContentPickerModal';
import { ContentType } from '@/types/fileExchange';
import {
	ClockIcon,
	ExclamationCircleIcon,
	FilmIcon,
	SparklesIcon,
} from '@heroicons/react/24/outline';
import { confirmCreativeNonCommercialDownload } from '@/constants/creativeOutputNonCommercial';

type Tab = 'image-to-video' | 'history';

interface HistoryItem {
	id: string;
	name?: string;
	created_at?: string;
	content_type?: string;
}

interface VideoResult {
	data?: string;
	filename: string;
}

interface VideoStudioResponse {
	videos: VideoResult[];
	content_id?: string;
	name?: string;
	history_saved?: boolean;
	history_error?: string;
}

export interface VideoStudioPageProps {
	embedded?: boolean;
	onWindowPayloadChange?: (patch: WindowInitialPayload) => void;
}

export const VideoStudioPage: React.FC<VideoStudioPageProps> = ({
	embedded = false,
	onWindowPayloadChange,
}) => {
	const { t: tDesktop } = useTranslation('desktopUi');
	const { studioTabRailClass, studioTabButtonClass, studioAlertClass } =
		useCreativeStudioShellClasses();
	const { energyLine } = useCreativeStudioUgsCosts();
	const i2vEnergy = energyLine('video_studio_image_to_video');
	const promptAiEnergy = energyLine('video_studio_image_prompt');
	const [activeTab, setActiveTab] = useState<Tab>('image-to-video');
	const [videoGuideOpen, setVideoGuideOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [historyWarning, setHistoryWarning] = useState<string | null>(null);

	const [prompt, setPrompt] = useState('');
	const [promptIdea, setPromptIdea] = useState('');
	const [promptPromptLang, setPromptPromptLang] = useState<'en' | 'ru'>('ru');
	const [promptAiLoading, setPromptAiLoading] = useState(false);
	const [showPromptHelper, setShowPromptHelper] = useState(true);
	const [negativePrompt, setNegativePrompt] = useState('');
	const [showAdvancedPrompting, setShowAdvancedPrompting] = useState(false);
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [imageSourceLabel, setImageSourceLabel] = useState<string | null>(null);
	const [contentPickerOpen, setContentPickerOpen] = useState(false);
	const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<VideoResult | null>(null);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [previewId, setPreviewId] = useState<string | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [studioOutputContentId, setStudioOutputContentId] = useState<
		string | null
	>(null);

	const clearMessages = useCallback(() => {
		setError(null);
		setHistoryWarning(null);
	}, []);

	const clearImage = useCallback(() => {
		setImageFile(null);
		setImageSourceLabel(null);
		if (fileInputRef.current) fileInputRef.current.value = '';
	}, []);

	const videoGuideSteps = useMemo(
		() => getVideoStudioGuideSteps(activeTab),
		[activeTab]
	);

	useEffect(() => {
		setVideoGuideOpen(false);
	}, []);

	const openVideoGuideTour = useCallback(() => setVideoGuideOpen(true), []);
	useDesktopGuideTourOpener(openVideoGuideTour);

	useEffect(() => {
		if (!embedded || !onWindowPayloadChange) return;
		const tabLabel = tDesktop(`assistantCtxVideoTab.${activeTab}`, {
			defaultValue: activeTab,
		});
		const uid = (previewId || studioOutputContentId || '').trim();
		const appLabel = tDesktop('assistantCtxApps.videoStudio');
		onWindowPayloadChange({
			assistantSurfaceContext: {
				label: `${appLabel} · ${tabLabel}`,
				...(uid ? { unifiedContentIds: [uid] } : {}),
			},
			...(uid ? { unifiedContentId: uid } : { unifiedContentId: undefined }),
		});
	}, [
		embedded,
		onWindowPayloadChange,
		activeTab,
		previewId,
		studioOutputContentId,
		tDesktop,
	]);

	const fetchContentBlob = useCallback(async (id: string): Promise<Blob> => {
		const blob = await api.get(`/content/${id}/download`, {
			baseURL: '/api/v1',
			responseType: 'blob',
		});
		return blob as unknown as Blob;
	}, []);

	useEffect(() => {
		if (activeTab !== 'history') return;
		setHistoryLoading(true);
		const params = new URLSearchParams({
			source_service: 'video_studio',
			sort_field: 'date',
			sort_order: 'desc',
			limit: '50',
		});
		api
			.get<{ items: HistoryItem[]; total: number }>(
				`/content?${params.toString()}`,
				{ baseURL: '/api/v1' }
			)
			.then((res: unknown) => {
				const r = res as {
					items?: HistoryItem[];
					data?: { items?: HistoryItem[] };
				};
				const items = r?.items ?? r?.data?.items ?? [];
				setHistoryList(Array.isArray(items) ? items : []);
			})
			.catch(() => setHistoryList([]))
			.finally(() => setHistoryLoading(false));
	}, [activeTab]);

	useEffect(() => {
		if (!previewId) {
			setPreviewUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return null;
			});
			return;
		}
		let revoked = false;
		fetchContentBlob(previewId)
			.then((blob) => {
				if (!revoked) setPreviewUrl(URL.createObjectURL(blob));
			})
			.catch(() => setPreviewUrl(null));
		return () => {
			revoked = true;
			setPreviewUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return null;
			});
		};
	}, [previewId, fetchContentBlob]);

	const handleSuggestPrompt = useCallback(async () => {
		const idea = promptIdea.trim();
		if (idea.length < 2) {
			setError('Напишите хотя бы пару слов — что вы хотите увидеть в движении');
			return;
		}
		setError(null);
		setPromptAiLoading(true);
		try {
			const result = await api.post<{ prompt: string }>(
				'/video-studio/suggest-prompt',
				{ idea, language: promptPromptLang },
				{ baseURL: '/api/v1' }
			);
			const text = (result?.prompt ?? '').trim();
			if (text) setPrompt(text);
			else
				setError(
					'Не удалось составить описание — попробуйте переформулировать'
				);
		} catch (err) {
			setError(getApiErrorMessage(err));
		} finally {
			setPromptAiLoading(false);
		}
	}, [promptIdea, promptPromptLang]);

	const loadContentAsImageFile = useCallback(
		async (content: Content) => {
			const blob = await fetchContentBlob(String(content.id));
			const mime = content.mime_type ?? 'image/png';
			const name =
				content.original_filename?.trim() ||
				content.name?.trim() ||
				`content-${String(content.id).slice(0, 8)}.png`;
			const fileFromContent = new File([blob], name, { type: mime });
			setImageFile(fileFromContent);
			setImageSourceLabel(content.name?.trim() || name);
			setContentPickerOpen(false);
		},
		[fetchContentBlob]
	);

	useEffect(() => {
		return () => {
			if (resultUrl) URL.revokeObjectURL(resultUrl);
		};
	}, [resultUrl]);

	useEffect(() => {
		if (!imageFile) {
			setImagePreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(imageFile);
		setImagePreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [imageFile]);

	const handleImageToVideo = useCallback(async () => {
		const p = prompt.trim();
		if (!p) {
			setError('Расскажите, что должно происходить в кадре');
			return;
		}
		if (!imageFile) {
			setError('Сначала выберите картинку');
			return;
		}
		setError(null);
		setHistoryWarning(null);
		setResult(null);
		setStudioOutputContentId(null);
		setResultUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return null;
		});
		setLoading(true);
		try {
			const imageToSend = await resizeImageForUpload(
				imageFile,
				900 * 1024,
				1280
			);
			const formData = new FormData();
			formData.append('prompt', p);
			formData.append('image', imageToSend);
			formData.append('negative_prompt', negativePrompt.trim());
			const res = await api.post<VideoStudioResponse>(
				'/video-studio/image-to-video',
				formData,
				{ baseURL: '/api/v1', timeout: 620000 }
			);
			const videos = res?.videos ?? [];
			setHistoryWarning(
				res?.history_saved === false
					? res.history_error ||
							'Видео готово, но сохранить его в «Мои видео» не удалось'
					: null
			);
			if (res?.content_id) {
				const blob = await fetchContentBlob(res.content_id);
				const url = URL.createObjectURL(blob);
				setResult(videos[0] ?? { filename: 'video.mp4' });
				setStudioOutputContentId(res.content_id.trim());
				setResultUrl(url);
			} else if (videos.length > 0 && videos[0]?.data) {
				setResult(videos[0]);
				setStudioOutputContentId(null);
			} else {
				setError('Видео не получилось — попробуйте ещё раз');
			}
		} catch (err) {
			setError(getApiErrorMessage(err));
		} finally {
			setLoading(false);
		}
	}, [prompt, negativePrompt, imageFile, fetchContentBlob]);

	const downloadVideo = useCallback(
		(v: VideoResult, prefix: string) => {
			if (!confirmCreativeNonCommercialDownload()) return;
			const a = document.createElement('a');
			if (resultUrl) {
				a.href = resultUrl;
			} else if (v?.data) {
				a.href = `data:video/mp4;base64,${v.data}`;
			} else {
				return;
			}
			a.download = v.filename || `${prefix}.mp4`;
			a.click();
		},
		[resultUrl]
	);

	const canGenerate = Boolean(prompt.trim() && imageFile && !loading);

	return (
		<div
			id={VIDEO_STUDIO_GUIDE_ROOT_ID}
			className={cn(studioPageEmbeddedShellClass, 'relative')}
		>
			<div className={studioPageChromeInsetClass}>
				<StudioHeroHeader
					kicker="Творческая студия"
					title="Оживите картинку"
					subtitle="Загрузите фото, опишите движение — и через несколько минут получите короткий ролик."
					icon={<FilmIcon className="h-5 w-5 shrink-0" aria-hidden />}
				/>

				<fieldset
					className={cn(studioTabRailClass, 'm-0 min-w-0 border-0 p-0')}
					aria-label="Разделы студии видео"
					data-video-guide="tab-rail"
				>
					<button
						type="button"
						onClick={() => {
							setActiveTab('image-to-video');
							clearMessages();
						}}
						className={studioTabButtonClass(activeTab === 'image-to-video')}
					>
						<SparklesIcon className="h-4 w-4 shrink-0" aria-hidden />
						<span className={studioTabLabelClass}>Создать</span>
					</button>
					<button
						type="button"
						onClick={() => {
							setActiveTab('history');
							clearMessages();
							setPreviewId(null);
						}}
						className={studioTabButtonClass(activeTab === 'history', 'emerald')}
					>
						<ClockIcon className="h-4 w-4 shrink-0" aria-hidden />
						<span className={studioTabLabelClass}>Мои видео</span>
					</button>
				</fieldset>

				{historyWarning && (
					<div
						className={cn(
							studioAlertClass,
							'border-amber-500/30 bg-amber-500/10 text-amber-100'
						)}
						role="status"
					>
						<ExclamationCircleIcon className="w-5 h-5 shrink-0 text-amber-400" />
						<span>{historyWarning}</span>
					</div>
				)}
			</div>

			<div
				className={cn(studioPageScrollRegionClass, studioPageBodyInsetClass)}
			>
				{error && (
					<div
						className={cn(
							studioAlertClass,
							'mb-4 border-red-500/30 bg-red-500/10 text-red-200'
						)}
						role="alert"
					>
						<ExclamationCircleIcon className="w-5 h-5 shrink-0 text-red-400" />
						<span>{error}</span>
					</div>
				)}

				{activeTab === 'image-to-video' && (
					<VideoStudioCreateWorkspace
						fileInputRef={fileInputRef}
						imageFile={imageFile}
						imageSourceLabel={imageSourceLabel}
						imagePreviewUrl={imagePreviewUrl}
						onImageFileChange={(file, label) => {
							setImageFile(file);
							setImageSourceLabel(label);
						}}
						onClearImage={clearImage}
						onOpenContentPicker={() => setContentPickerOpen(true)}
						prompt={prompt}
						onPromptChange={setPrompt}
						promptIdea={promptIdea}
						onPromptIdeaChange={setPromptIdea}
						promptPromptLang={promptPromptLang}
						onPromptLangChange={setPromptPromptLang}
						showPromptHelper={showPromptHelper}
						onTogglePromptHelper={() => setShowPromptHelper((v) => !v)}
						promptAiLoading={promptAiLoading}
						promptAiEnergy={promptAiEnergy}
						onSuggestPrompt={() => void handleSuggestPrompt()}
						showAdvancedPrompting={showAdvancedPrompting}
						onToggleAdvanced={() => setShowAdvancedPrompting((v) => !v)}
						negativePrompt={negativePrompt}
						onNegativePromptChange={setNegativePrompt}
						loading={loading}
						canGenerate={canGenerate}
						i2vEnergy={i2vEnergy}
						onGenerate={handleImageToVideo}
						result={result}
						resultUrl={resultUrl}
						onClearResult={() => {
							setResult(null);
							setResultUrl((prev) => {
								if (prev) URL.revokeObjectURL(prev);
								return null;
							});
						}}
						onDownload={() => result && downloadVideo(result, 'video')}
					/>
				)}

				{activeTab === 'history' && (
					<VideoStudioHistoryWorkspace
						loading={historyLoading}
						items={historyList}
						previewId={previewId}
						previewUrl={previewUrl}
						onTogglePreview={(id) => setPreviewId(previewId === id ? null : id)}
						onDownload={(item) => {
							void fetchContentBlob(item.id).then((blob) => {
								const url = URL.createObjectURL(blob);
								const a = document.createElement('a');
								a.href = url;
								a.download = `${(item.name || `video-${item.id}`).replace(/\s+/g, '_')}.mp4`;
								a.click();
								URL.revokeObjectURL(url);
							});
						}}
					/>
				)}
			</div>
			<UnifiedContentPickerModal
				open={contentPickerOpen}
				onClose={() => setContentPickerOpen(false)}
				mode="single"
				maxFiles={1}
				allowedContentTypes={[ContentType.IMAGE]}
				hideTypeFilter
				onConfirm={(items) => {
					const first = items[0];
					if (first) void loadContentAsImageFile(first);
				}}
			/>
			<CreativeStudioGuideTourModal
				open={videoGuideOpen}
				onClose={() => setVideoGuideOpen(false)}
				rootId={VIDEO_STUDIO_GUIDE_ROOT_ID}
				steps={videoGuideSteps}
				audioLocalStorageKey={VIDEO_STUDIO_GUIDE_AUDIO_LS_KEY}
				tourAudioFolder={VIDEO_STUDIO_GUIDE_TOUR_FOLDER}
				spotlightLayoutKey={activeTab}
			/>
		</div>
	);
};
