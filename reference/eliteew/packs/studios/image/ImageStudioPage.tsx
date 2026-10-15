/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Image Studio desktop app orchestrator: text-to-image, edit, camera angle, history.
 *
 * Invariants:
 * - Single scroll region via studioPageScrollRegionClass when embedded in desktop shell.
 * - Gen/suggest POSTs always send Idempotency-Key; workspaces stay presentational.
 *
 * Related:
 * - workspaces/*, imageStudioApi.ts, documentation/product/IMAGE-STUDIO.md
 * - api/routers/image_studio.py
 */

import * as React from 'react';
import {
	useState,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useId,
} from 'react';
import { useTranslation } from 'react-i18next';
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
	ImageStudioTextToImageWorkspace,
	ImageStudioEditWorkspace,
	ImageStudioRotateWorkspace,
	ImageStudioHistoryWorkspace,
	STYLE_PRESETS,
	STYLE_PRESET_STORAGE_KEY,
	type HistoryFilterTag,
	type ImageStudioResult,
	type ImageStudioTab,
	type VariantCount,
} from './workspaces';
import {
	base64ToFile,
	downloadImage,
	mapApiError,
	postImageEdit,
	postImageRotate,
	postSuggestPrompt,
	postTextToImage,
	randomSeed,
	resizeImageForUpload,
} from './imageStudioApi';
import {
	fetchContentBlob,
	fetchImageStudioHistory,
	filterHistoryByTag,
} from './imageStudioHistory';
import {
	getImageStudioGuideSteps,
	IMAGE_STUDIO_GUIDE_AUDIO_LS_KEY,
	IMAGE_STUDIO_GUIDE_ROOT_ID,
	IMAGE_STUDIO_GUIDE_TOUR_FOLDER,
} from './imageStudioGuideData';
import { useCreativeStudioUgsCosts } from '@/hooks/useCreativeStudioUgsCosts';
import {
	ClockIcon,
	ExclamationCircleIcon,
	PaintBrushIcon,
	PhotoIcon,
	SparklesIcon,
	Squares2X2Icon,
} from '@heroicons/react/24/outline';

export interface ImageStudioPageProps {
	embedded?: boolean;
	onWindowPayloadChange?: (patch: WindowInitialPayload) => void;
}

function readStoredStylePreset(): string {
	try {
		const raw = localStorage.getItem(STYLE_PRESET_STORAGE_KEY)?.trim();
		if (raw && STYLE_PRESETS.some((p) => p.id === raw)) return raw;
	} catch {
		/* ignore */
	}
	return 'none';
}

function resolvePromptWithStyle(prompt: string, stylePresetId: string): string {
	const base = prompt.trim();
	const preset = STYLE_PRESETS.find((p) => p.id === stylePresetId);
	const suffix = preset?.promptSuffix?.trim() ?? '';
	if (!suffix) return base;
	const bare = suffix.replace(/^,\s*/, '').toLowerCase();
	if (bare && base.toLowerCase().includes(bare)) return base;
	return `${base}${suffix.startsWith(',') ? suffix : `, ${suffix}`}`;
}

export const ImageStudioPage: React.FC<ImageStudioPageProps> = ({
	embedded = false,
	onWindowPayloadChange,
}) => {
	const { t } = useTranslation('imageStudio');
	const { t: tDesktop } = useTranslation('desktopUi');
	const { studioTabRailClass, studioTabButtonClass, studioAlertClass } =
		useCreativeStudioShellClasses();
	const { energyLine } = useCreativeStudioUgsCosts();
	const t2iEnergy = energyLine('image_studio_text_to_image');
	const promptAiEnergy = energyLine('image_studio_image_prompt');
	const editEnergy = energyLine('image_studio_image_edit');
	const rotateEnergy = energyLine('image_studio_image_rotate');
	const editFileInputId = useId();
	const rotateFileInputId = useId();

	const [activeTab, setActiveTab] = useState<ImageStudioTab>('text-to-image');
	const [imageGuideOpen, setImageGuideOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [historyWarning, setHistoryWarning] = useState<string | null>(null);

	const [prompt, setPrompt] = useState('');
	const [width, setWidth] = useState(1024);
	const [height, setHeight] = useState(1024);
	const [seedT2I, setSeedT2I] = useState('');
	const [t2iLoading, setT2iLoading] = useState(false);
	const [t2iLoadingProgress, setT2iLoadingProgress] = useState<{
		current: number;
		total: number;
	} | null>(null);
	const [t2iResult, setT2iResult] = useState<ImageStudioResult | null>(null);
	const [t2iResults, setT2iResults] = useState<ImageStudioResult[]>([]);
	const [showT2IAdvanced, setShowT2IAdvanced] = useState(false);
	const [promptIdea, setPromptIdea] = useState('');
	const [promptPromptLang, setPromptPromptLang] = useState<'en' | 'ru'>('en');
	const [promptAiLoading, setPromptAiLoading] = useState(false);
	const [showPromptHelper, setShowPromptHelper] = useState(true);
	const [stylePresetId, setStylePresetId] = useState(readStoredStylePreset);
	const [variantCount, setVariantCount] = useState<1 | VariantCount>(1);

	const [editPrompt, setEditPrompt] = useState('');
	const [editNegative, setEditNegative] = useState('');
	const [editSeed, setEditSeed] = useState('');
	const [editFile, setEditFile] = useState<File | null>(null);
	const [editFilePreviewUrl, setEditFilePreviewUrl] = useState<string | null>(
		null
	);
	const [editLoading, setEditLoading] = useState(false);
	const [editResult, setEditResult] = useState<ImageStudioResult | null>(null);
	const [showEditAdvanced, setShowEditAdvanced] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [rotateFile, setRotateFile] = useState<File | null>(null);
	const [rotateFilePreviewUrl, setRotateFilePreviewUrl] = useState<
		string | null
	>(null);
	const [rotateMode, setRotateMode] = useState('angle90_right');
	const [rotateLoading, setRotateLoading] = useState(false);
	const [rotateResults, setRotateResults] = useState<ImageStudioResult[]>([]);
	const rotateFileInputRef = useRef<HTMLInputElement>(null);

	const [historyList, setHistoryList] = useState<
		Awaited<ReturnType<typeof fetchImageStudioHistory>>
	>([]);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
	const [historyFilterTag, setHistoryFilterTag] =
		useState<HistoryFilterTag>('all');
	const [previewId, setPreviewId] = useState<string | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [studioOutputContentId, setStudioOutputContentId] = useState<
		string | null
	>(null);

	const clearMessages = useCallback(() => {
		setError(null);
		setHistoryWarning(null);
	}, []);

	const applyMappedError = useCallback(
		(err: unknown) => {
			const mapped = mapApiError(err);
			if (mapped.code === 'insufficient_credits') {
				setError(t('errors.insufficientCredits'));
				return;
			}
			if (mapped.code === 'payload_too_large') {
				setError(t('errors.payloadTooLarge'));
				return;
			}
			setError(mapped.message || t('errors.generic'));
		},
		[t]
	);

	const onStylePresetChange = useCallback((id: string) => {
		setStylePresetId(id);
		try {
			localStorage.setItem(STYLE_PRESET_STORAGE_KEY, id);
		} catch {
			/* ignore */
		}
	}, []);

	const imageGuideSteps = useMemo(
		() => getImageStudioGuideSteps(activeTab),
		[activeTab]
	);

	useEffect(() => {
		setImageGuideOpen(false);
	}, []);

	const openImageGuideTour = useCallback(() => setImageGuideOpen(true), []);
	useDesktopGuideTourOpener(openImageGuideTour);

	useEffect(() => {
		if (!embedded || !onWindowPayloadChange) return;
		const tabLabel = tDesktop(`assistantCtxImageTab.${activeTab}`, {
			defaultValue: activeTab,
		});
		const uid = (previewId || studioOutputContentId || '').trim();
		const appLabel = tDesktop('assistantCtxApps.imageStudio');
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

	useEffect(() => {
		if (activeTab !== 'history') return;
		setHistoryLoading(true);
		fetchImageStudioHistory(historyRefreshKey)
			.then(setHistoryList)
			.catch(() => setHistoryList([]))
			.finally(() => setHistoryLoading(false));
	}, [activeTab, historyRefreshKey]);

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
	}, [previewId]);

	useEffect(() => {
		if (!editFile) {
			setEditFilePreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(editFile);
		setEditFilePreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [editFile]);

	useEffect(() => {
		if (!rotateFile) {
			setRotateFilePreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(rotateFile);
		setRotateFilePreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [rotateFile]);

	const filteredHistory = useMemo(
		() => filterHistoryByTag(historyList, historyFilterTag),
		[historyList, historyFilterTag]
	);

	const onSendToEdit = useCallback(
		(result: ImageStudioResult) => {
			const file = base64ToFile(
				result.data,
				result.filename || 'image-studio-edit.png'
			);
			setEditFile(file);
			setEditResult(null);
			setActiveTab('image-edit');
			clearMessages();
		},
		[clearMessages]
	);

	const onSendToRotate = useCallback(
		(result: ImageStudioResult) => {
			const file = base64ToFile(
				result.data,
				result.filename || 'image-studio-rotate.png'
			);
			setRotateFile(file);
			setRotateResults([]);
			setActiveTab('rotate-image');
			clearMessages();
		},
		[clearMessages]
	);

	const handleTextToImage = useCallback(async () => {
		const p = prompt.trim();
		if (!p) {
			setError(t('errors.promptRequired'));
			return;
		}
		const finalPrompt = resolvePromptWithStyle(p, stylePresetId);
		setError(null);
		setHistoryWarning(null);
		setT2iResult(null);
		setT2iResults([]);
		setStudioOutputContentId(null);
		setT2iLoading(true);
		const total = variantCount;
		setT2iLoadingProgress(total > 1 ? { current: 1, total } : null);
		const collected: ImageStudioResult[] = [];
		try {
			const w = Math.max(256, Math.min(2048, width));
			const h = Math.max(256, Math.min(2048, height));
			for (let i = 0; i < total; i += 1) {
				if (total > 1) setT2iLoadingProgress({ current: i + 1, total });
				let seed: number | undefined;
				if (seedT2I.trim() !== '' && total === 1) {
					const s = parseInt(seedT2I.trim(), 10);
					if (!Number.isNaN(s)) seed = s;
				} else if (total > 1) {
					seed = randomSeed();
				}
				const result = await postTextToImage({
					prompt: finalPrompt,
					width: w,
					height: h,
					seed,
				});
				const images = result?.images ?? [];
				if (result?.history_saved === false) {
					setHistoryWarning(
						result.history_error || t('errors.historySaveFailed')
					);
				}
				if (images.length > 0) {
					collected.push(images[0]);
					if (result?.content_id?.trim()) {
						setStudioOutputContentId(result.content_id.trim());
					}
				}
			}
			if (collected.length === 0) {
				setError(t('errors.noImageInResponse'));
			} else {
				setT2iResults(collected);
				setT2iResult(collected[0]);
				setHistoryRefreshKey((k) => k + 1);
			}
		} catch (err) {
			applyMappedError(err);
		} finally {
			setT2iLoading(false);
			setT2iLoadingProgress(null);
		}
	}, [
		prompt,
		width,
		height,
		seedT2I,
		stylePresetId,
		variantCount,
		t,
		applyMappedError,
	]);

	const handleSuggestPrompt = useCallback(async () => {
		const idea = promptIdea.trim();
		if (!idea) {
			setError(t('errors.ideaRequired'));
			return;
		}
		setError(null);
		setHistoryWarning(null);
		setPromptAiLoading(true);
		try {
			const result = await postSuggestPrompt({
				idea,
				language: promptPromptLang,
			});
			const text = (result?.prompt ?? '').trim();
			if (text) setPrompt(text);
			else setError(t('errors.emptyPromptAi'));
		} catch (err) {
			applyMappedError(err);
		} finally {
			setPromptAiLoading(false);
		}
	}, [promptIdea, promptPromptLang, t, applyMappedError]);

	const handleImageEdit = useCallback(async () => {
		const p = editPrompt.trim();
		if (!p) {
			setError(t('errors.editPromptRequired'));
			return;
		}
		if (!editFile) {
			setError(t('errors.editFileRequired'));
			return;
		}
		setError(null);
		setHistoryWarning(null);
		setEditResult(null);
		setStudioOutputContentId(null);
		setEditLoading(true);
		try {
			const imageToSend = await resizeImageForUpload(
				editFile,
				900 * 1024,
				1280
			);
			const formData = new FormData();
			formData.append('prompt', p);
			formData.append('image', imageToSend);
			formData.append('negative_prompt', editNegative.trim());
			if (editSeed.trim() !== '') {
				const s = parseInt(editSeed.trim(), 10);
				if (!Number.isNaN(s)) formData.append('seed', String(s));
			}
			const result = await postImageEdit(formData);
			const images = result?.images ?? [];
			setHistoryWarning(
				result?.history_saved === false
					? result.history_error || t('errors.historySaveFailed')
					: null
			);
			if (images.length > 0) {
				setEditResult(images[0]);
				setStudioOutputContentId(result?.content_id?.trim() || null);
				setHistoryRefreshKey((k) => k + 1);
			} else setError(t('errors.noImageInResponse'));
		} catch (err) {
			applyMappedError(err);
		} finally {
			setEditLoading(false);
		}
	}, [editPrompt, editNegative, editSeed, editFile, t, applyMappedError]);

	const onDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const file = e.dataTransfer.files?.[0];
		if (file?.type.startsWith('image/')) setEditFile(file);
	}, []);
	const onDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(true);
	}, []);
	const onDragLeave = useCallback(() => setDragOver(false), []);

	const handleImageRotate = useCallback(async () => {
		if (!rotateFile) {
			setError(t('errors.rotateFileRequired'));
			return;
		}
		setError(null);
		setHistoryWarning(null);
		setRotateResults([]);
		setStudioOutputContentId(null);
		setRotateLoading(true);
		try {
			const imageToSend = await resizeImageForUpload(
				rotateFile,
				900 * 1024,
				1280
			);
			const formData = new FormData();
			formData.append('image', imageToSend);
			formData.append('mode', rotateMode);
			const result = await postImageRotate(formData);
			const images = result?.images ?? [];
			setHistoryWarning(
				result?.history_saved === false
					? result.history_error || t('errors.historySaveFailed')
					: null
			);
			if (images.length > 0) {
				setRotateResults(images);
				setStudioOutputContentId(result?.content_id?.trim() || null);
				setHistoryRefreshKey((k) => k + 1);
			} else setError(t('errors.noImageInResponse'));
		} catch (err) {
			applyMappedError(err);
		} finally {
			setRotateLoading(false);
		}
	}, [rotateFile, rotateMode, t, applyMappedError]);

	const openHistoryInEditor = useCallback(
		(item: { id: string; name?: string }) => {
			void fetchContentBlob(item.id)
				.then(async (blob) => {
					const file = new File(
						[blob],
						`${(item.name || `image-${item.id}`).replace(/\s+/g, '_')}.png`,
						{ type: blob.type || 'image/png' }
					);
					setEditFile(file);
					setEditResult(null);
					setActiveTab('image-edit');
					clearMessages();
				})
				.catch((err) => applyMappedError(err));
		},
		[clearMessages, applyMappedError]
	);

	return (
		<div
			id={IMAGE_STUDIO_GUIDE_ROOT_ID}
			className={cn(studioPageEmbeddedShellClass, 'relative')}
		>
			<div className={studioPageChromeInsetClass}>
				<StudioHeroHeader
					kicker={t('hero.kicker')}
					title={t('hero.title')}
					subtitle={t('hero.subtitle')}
					icon={<PhotoIcon className="h-5 w-5 shrink-0" aria-hidden />}
				/>

				<fieldset
					className={cn(studioTabRailClass, 'm-0 min-w-0 border-0 p-0')}
					aria-label={t('tabs.aria')}
					data-img-guide="tab-rail"
				>
					<button
						type="button"
						onClick={() => {
							setActiveTab('text-to-image');
							clearMessages();
						}}
						className={studioTabButtonClass(activeTab === 'text-to-image')}
					>
						<SparklesIcon className="h-4 w-4 shrink-0" aria-hidden />
						<span className={studioTabLabelClass}>{t('tabs.create')}</span>
					</button>
					<button
						type="button"
						onClick={() => {
							setActiveTab('image-edit');
							clearMessages();
						}}
						className={studioTabButtonClass(
							activeTab === 'image-edit',
							'fuchsia'
						)}
					>
						<PaintBrushIcon className="h-4 w-4 shrink-0" aria-hidden />
						<span className={studioTabLabelClass}>{t('tabs.edit')}</span>
					</button>
					<button
						type="button"
						onClick={() => {
							setActiveTab('rotate-image');
							clearMessages();
						}}
						className={studioTabButtonClass(
							activeTab === 'rotate-image',
							'emerald'
						)}
					>
						<Squares2X2Icon className="h-4 w-4 shrink-0" aria-hidden />
						<span className={studioTabLabelClass}>{t('tabs.rotate')}</span>
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
						<span className={studioTabLabelClass}>{t('tabs.history')}</span>
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
						<button
							type="button"
							className="ml-auto text-sm underline"
							onClick={() => {
								setError(null);
								if (activeTab === 'text-to-image') void handleTextToImage();
								else if (activeTab === 'image-edit') void handleImageEdit();
								else if (activeTab === 'rotate-image') void handleImageRotate();
							}}
						>
							{t('errors.retry')}
						</button>
					</div>
				)}

				{activeTab === 'text-to-image' && (
					<ImageStudioTextToImageWorkspace
						prompt={prompt}
						onPromptChange={setPrompt}
						promptIdea={promptIdea}
						onPromptIdeaChange={setPromptIdea}
						promptLang={promptPromptLang}
						onPromptLangChange={setPromptPromptLang}
						showPromptHelper={showPromptHelper}
						onTogglePromptHelper={() => setShowPromptHelper((v) => !v)}
						promptAiLoading={promptAiLoading}
						promptAiEnergy={promptAiEnergy}
						onSuggestPrompt={() => void handleSuggestPrompt()}
						stylePresetId={stylePresetId}
						onStylePresetChange={onStylePresetChange}
						variantCount={variantCount}
						onVariantCountChange={setVariantCount}
						showAdvanced={showT2IAdvanced}
						onToggleAdvanced={() => setShowT2IAdvanced((v) => !v)}
						width={width}
						height={height}
						onWidthChange={setWidth}
						onHeightChange={setHeight}
						seed={seedT2I}
						onSeedChange={setSeedT2I}
						loading={t2iLoading}
						loadingProgress={t2iLoadingProgress}
						canGenerate={Boolean(prompt.trim() && !t2iLoading)}
						t2iEnergy={t2iEnergy}
						onGenerate={() => void handleTextToImage()}
						result={t2iResult}
						results={t2iResults}
						onSelectResult={setT2iResult}
						onClearResult={() => {
							setT2iResult(null);
							setT2iResults([]);
						}}
						onDownload={() =>
							t2iResult && downloadImage(t2iResult, 'generated')
						}
						onSendToEdit={onSendToEdit}
						onSendToRotate={onSendToRotate}
					/>
				)}

				{activeTab === 'image-edit' && (
					<ImageStudioEditWorkspace
						dragOver={dragOver}
						onDrop={onDrop}
						onDragOver={onDragOver}
						onDragLeave={onDragLeave}
						editFile={editFile}
						editFilePreviewUrl={editFilePreviewUrl}
						fileInputId={editFileInputId}
						fileInputRef={fileInputRef}
						onFileChange={setEditFile}
						instruction={editPrompt}
						onInstructionChange={setEditPrompt}
						showAdvanced={showEditAdvanced}
						onToggleAdvanced={() => setShowEditAdvanced((v) => !v)}
						negative={editNegative}
						onNegativeChange={setEditNegative}
						seed={editSeed}
						onSeedChange={setEditSeed}
						loading={editLoading}
						canApply={Boolean(editPrompt.trim() && editFile && !editLoading)}
						editEnergy={editEnergy}
						onApply={() => void handleImageEdit()}
						result={editResult}
						onClearResult={() => setEditResult(null)}
						onDownload={() => editResult && downloadImage(editResult, 'edited')}
					/>
				)}

				{activeTab === 'rotate-image' && (
					<ImageStudioRotateWorkspace
						rotateFile={rotateFile}
						rotateFilePreviewUrl={rotateFilePreviewUrl}
						fileInputId={rotateFileInputId}
						fileInputRef={rotateFileInputRef}
						onFileChange={setRotateFile}
						rotateMode={rotateMode}
						onRotateModeChange={setRotateMode}
						loading={rotateLoading}
						canGenerate={Boolean(rotateFile && !rotateLoading)}
						rotateEnergy={rotateEnergy}
						onGenerate={() => void handleImageRotate()}
						results={rotateResults}
						onClearResults={() => setRotateResults([])}
						onDownload={(img, idx) => downloadImage(img, `rotated-${idx + 1}`)}
					/>
				)}

				{activeTab === 'history' && (
					<ImageStudioHistoryWorkspace
						loading={historyLoading}
						items={filteredHistory}
						filterTag={historyFilterTag}
						onFilterTagChange={setHistoryFilterTag}
						previewId={previewId}
						previewUrl={previewUrl}
						onTogglePreview={(id) => setPreviewId(previewId === id ? null : id)}
						onDownload={(item) => {
							void fetchContentBlob(item.id).then((blob) => {
								const url = URL.createObjectURL(blob);
								const a = document.createElement('a');
								a.href = url;
								a.download = `${(item.name || `image-${item.id}`).replace(/\s+/g, '_')}.png`;
								a.click();
								URL.revokeObjectURL(url);
							});
						}}
						onOpenInEditor={openHistoryInEditor}
					/>
				)}
			</div>

			<CreativeStudioGuideTourModal
				open={imageGuideOpen}
				onClose={() => setImageGuideOpen(false)}
				rootId={IMAGE_STUDIO_GUIDE_ROOT_ID}
				steps={imageGuideSteps}
				audioLocalStorageKey={IMAGE_STUDIO_GUIDE_AUDIO_LS_KEY}
				tourAudioFolder={IMAGE_STUDIO_GUIDE_TOUR_FOLDER}
				spotlightLayoutKey={activeTab}
			/>
		</div>
	);
};
