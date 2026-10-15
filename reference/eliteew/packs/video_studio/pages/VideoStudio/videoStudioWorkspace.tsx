/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Video Studio create/history tab layouts — flow cards, preview, history grid.
 *
 * Invariants:
 * - No nested scroll regions; parent owns studioPageScrollRegionClass.
 *
 * Related:
 * - VideoStudioPage.tsx, videoStudioUi.tsx
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
	StudioEmptyState,
	useCreativeStudioShellClasses,
	studioDisclosureHintClass,
	studioFieldLabelClass,
	studioFieldMetaClass,
} from '../CreativeStudio/studioChrome';
import {
	VideoStudioFlowCard,
	VideoStudioGeneratingPreview,
	VideoStudioHistoryGridSkeleton,
	VideoStudioHistoryThumb,
	VideoStudioPanelCard,
} from './videoStudioUi';
import {
	confirmCreativeNonCommercialDownload,
	CREATIVE_NON_COMMERCIAL_DOWNLOAD_HINT,
} from '@/constants/creativeOutputNonCommercial';
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ArrowUpTrayIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	FilmIcon,
	FolderOpenIcon,
	PhotoIcon,
	SparklesIcon,
	TrashIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';

const MOTION_EXAMPLES = [
	'Камера медленно приближается, волосы слегка развеваются на ветру',
	'Лёгкое покачивание кадра, облака плывут по небу',
	'Человек поворачивает голову и улыбается',
] as const;

export interface VideoStudioCreateWorkspaceProps {
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	imageFile: File | null;
	imageSourceLabel: string | null;
	imagePreviewUrl: string | null;
	onImageFileChange: (file: File | null, label: string | null) => void;
	onClearImage: () => void;
	onOpenContentPicker: () => void;
	prompt: string;
	onPromptChange: (value: string) => void;
	promptIdea: string;
	onPromptIdeaChange: (value: string) => void;
	promptPromptLang: 'en' | 'ru';
	onPromptLangChange: (lang: 'en' | 'ru') => void;
	showPromptHelper: boolean;
	onTogglePromptHelper: () => void;
	promptAiLoading: boolean;
	promptAiEnergy: string | null;
	onSuggestPrompt: () => void;
	showAdvancedPrompting: boolean;
	onToggleAdvanced: () => void;
	negativePrompt: string;
	onNegativePromptChange: (value: string) => void;
	loading: boolean;
	canGenerate: boolean;
	i2vEnergy: string | null;
	onGenerate: () => void;
	result: { data?: string; filename: string } | null;
	resultUrl: string | null;
	onClearResult: () => void;
	onDownload: () => void;
}

export function VideoStudioCreateWorkspace({
	fileInputRef,
	imageFile,
	imageSourceLabel,
	imagePreviewUrl,
	onImageFileChange,
	onClearImage,
	onOpenContentPicker,
	prompt,
	onPromptChange,
	promptIdea,
	onPromptIdeaChange,
	promptPromptLang,
	onPromptLangChange,
	showPromptHelper,
	onTogglePromptHelper,
	promptAiLoading,
	promptAiEnergy,
	onSuggestPrompt,
	showAdvancedPrompting,
	onToggleAdvanced,
	negativePrompt,
	onNegativePromptChange,
	loading,
	canGenerate,
	i2vEnergy,
	onGenerate,
	result,
	resultUrl,
	onClearResult,
	onDownload,
}: VideoStudioCreateWorkspaceProps) {
	const {
		studioDropzoneClass,
		studioInputClass,
		studioPreviewWellClass,
		studioPrimaryButtonClass,
		studioSecondaryButtonClass,
		studioGhostChipClass,
		studioDisclosureButtonClass,
		studioSoftPanelClass,
	} = useCreativeStudioShellClasses();

	return (
		<div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:items-start xl:gap-6">
			<div className="space-y-4" data-video-guide="i2v-form">
				<VideoStudioFlowCard
					step={1}
					title="Выберите картинку"
					description="Фото или иллюстрация PNG, JPEG, WebP — до 10 МБ."
				>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/png,image/jpeg,image/webp"
						onChange={(e) => {
							const file = e.target.files?.[0] ?? null;
							onImageFileChange(file, file?.name ?? null);
						}}
						className="hidden"
						aria-label="Загрузить картинку с компьютера"
					/>
					{imagePreviewUrl ? (
						<div
							className={cn(
								studioSoftPanelClass,
								'overflow-hidden rounded-(--desktop-radius-xl) ring-1 ring-(--desktop-border-subtle)'
							)}
						>
							<div className="relative aspect-[4/3] max-h-[200px] w-full overflow-hidden bg-(--desktop-surface-soft)">
								<img
									src={imagePreviewUrl}
									alt="Выбранная картинка"
									className="h-full w-full object-contain"
								/>
							</div>
							<div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--desktop-border-subtle) px-3 py-2.5">
								<p
									className="min-w-0 truncate text-xs text-(--desktop-text-secondary)"
									title={imageSourceLabel ?? imageFile?.name}
								>
									{imageSourceLabel ?? imageFile?.name}
								</p>
								<div className="flex shrink-0 gap-2">
									<button
										type="button"
										onClick={() => fileInputRef.current?.click()}
										className={cn(
											studioSecondaryButtonClass,
											'px-3 py-2 text-xs'
										)}
									>
										<ArrowUpTrayIcon
											className="h-3.5 w-3.5 shrink-0"
											aria-hidden
										/>
										Заменить
									</button>
									<button
										type="button"
										onClick={onClearImage}
										className={cn(
											studioSecondaryButtonClass,
											'px-3 py-2 text-xs'
										)}
										aria-label="Убрать выбранную картинку"
									>
										<TrashIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
										Убрать
									</button>
								</div>
							</div>
						</div>
					) : (
						<div className="grid gap-3 sm:grid-cols-2">
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className={cn(studioDropzoneClass, 'min-h-[148px]')}
							>
								<PhotoIcon className="mb-2 h-9 w-9 text-(--desktop-text-muted)" />
								<p className="text-sm font-medium text-(--desktop-text-primary)">
									С компьютера
								</p>
							</button>
							<button
								type="button"
								onClick={onOpenContentPicker}
								className={cn(
									studioDropzoneClass,
									'min-h-[148px] border-solid bg-(--desktop-surface-soft)/40'
								)}
							>
								<FolderOpenIcon className="mb-2 h-9 w-9 text-(--desktop-text-muted)" />
								<p className="text-sm font-medium text-(--desktop-text-primary)">
									Из моих файлов
								</p>
							</button>
						</div>
					)}
				</VideoStudioFlowCard>

				<VideoStudioFlowCard
					step={2}
					title="Опишите движение"
					description="Камера, объекты, атмосфера — чем конкретнее, тем живее ролик."
				>
					<button
						type="button"
						onClick={onTogglePromptHelper}
						className={cn(
							studioDisclosureButtonClass,
							'mb-3 border border-(--desktop-border-subtle)'
						)}
					>
						<span className="flex items-center gap-2">
							<span className="rounded-lg bg-[rgb(var(--desktop-accent-rgb)/0.14)] p-1.5">
								<SparklesIcon className="h-4 w-4 text-[rgb(var(--desktop-accent-rgb)/0.95)]" />
							</span>
							<span>
								<span className="block text-sm text-(--desktop-text-primary)">
									Помощник подсказок
								</span>
								<span className={studioDisclosureHintClass}>
									Сформулирует описание за вас
								</span>
							</span>
						</span>
						{showPromptHelper ? (
							<ChevronDownIcon className="h-4 w-4 text-(--desktop-text-muted)" />
						) : (
							<ChevronRightIcon className="h-4 w-4 text-(--desktop-text-muted)" />
						)}
					</button>

					{showPromptHelper && (
						<div
							className={cn(
								studioSoftPanelClass,
								'mb-4 space-y-3 rounded-(--desktop-radius-xl) p-4'
							)}
						>
							<label className={studioFieldLabelClass} htmlFor="vs-prompt-idea">
								Что вы хотите увидеть?
							</label>
							<textarea
								id="vs-prompt-idea"
								value={promptIdea}
								onChange={(e) => onPromptIdeaChange(e.target.value)}
								placeholder="Лёгкий ветер, камера отъезжает назад, закат на фоне…"
								rows={3}
								className={cn(studioInputClass, 'block min-h-[88px] resize-y')}
							/>
							<div className="flex flex-wrap items-center gap-2">
								<button
									type="button"
									onClick={() => onPromptLangChange('ru')}
									className={cn(
										studioGhostChipClass,
										promptPromptLang === 'ru' &&
											'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] text-(--desktop-text-primary)'
									)}
								>
									Русский
								</button>
								<button
									type="button"
									onClick={() => onPromptLangChange('en')}
									className={cn(
										studioGhostChipClass,
										promptPromptLang === 'en' &&
											'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] text-(--desktop-text-primary)'
									)}
								>
									English
								</button>
								<button
									type="button"
									onClick={onSuggestPrompt}
									disabled={promptAiLoading}
									className={cn(
										studioPrimaryButtonClass,
										'ml-auto flex min-h-[44px] flex-col justify-center gap-1 px-4 py-2.5'
									)}
								>
									<span className="flex items-center justify-center gap-2 text-sm">
										{promptAiLoading ? (
											<ArrowPathIcon
												className="h-4 w-4 animate-spin motion-reduce:animate-none"
												aria-hidden
											/>
										) : (
											<SparklesIcon className="h-4 w-4 shrink-0" aria-hidden />
										)}
										Составить описание
									</span>
									{promptAiEnergy ? (
										<span className="text-[11px] font-normal leading-tight opacity-90">
											{promptAiEnergy}
										</span>
									) : null}
								</button>
							</div>
						</div>
					)}

					<label className={studioFieldLabelClass} htmlFor="vs-prompt">
						Описание для генерации
					</label>
					<textarea
						id="vs-prompt"
						value={prompt}
						onChange={(e) => onPromptChange(e.target.value)}
						placeholder="Камера плавно приближается, волосы слегка развеваются…"
						rows={5}
						className={cn(studioInputClass, 'block min-h-[132px] resize-y')}
					/>
					<div className="mt-2 flex flex-wrap gap-2">
						{MOTION_EXAMPLES.map((example) => (
							<button
								key={example}
								type="button"
								onClick={() => onPromptChange(example)}
								className={cn(
									studioGhostChipClass,
									'max-w-full normal-case tracking-normal text-left text-[11px] leading-snug'
								)}
							>
								{example.length > 42 ? `${example.slice(0, 42)}…` : example}
							</button>
						))}
					</div>

					<button
						type="button"
						onClick={onToggleAdvanced}
						className={cn(studioDisclosureButtonClass, 'mt-4')}
					>
						<span>
							<span className="block text-sm text-(--desktop-text-primary)">
								Дополнительно
							</span>
							<span className={studioDisclosureHintClass}>
								Что не показывать в ролике
							</span>
						</span>
						{showAdvancedPrompting ? (
							<ChevronDownIcon className="h-4 w-4 text-(--desktop-text-muted)" />
						) : (
							<ChevronRightIcon className="h-4 w-4 text-(--desktop-text-muted)" />
						)}
					</button>
					{showAdvancedPrompting && (
						<div className="mt-3 rounded-(--desktop-radius-xl) border border-(--desktop-border-subtle) bg-(--desktop-surface-panel-strong) p-4">
							<label
								className={studioFieldLabelClass}
								htmlFor="vs-negative-prompt"
							>
								Исключить из ролика
							</label>
							<p className={cn(studioFieldMetaClass, 'mb-2')}>
								Необязательно: размытие, рывки, лишние объекты.
							</p>
							<textarea
								id="vs-negative-prompt"
								value={negativePrompt}
								onChange={(e) => onNegativePromptChange(e.target.value)}
								placeholder="размытие, рывки…"
								rows={2}
								className={cn(studioInputClass, 'block min-h-[72px] resize-y')}
							/>
						</div>
					)}
				</VideoStudioFlowCard>

				<VideoStudioFlowCard step={3} title="Создать ролик">
					<button
						type="button"
						onClick={onGenerate}
						disabled={!canGenerate}
						className={cn(
							studioPrimaryButtonClass,
							'flex w-full flex-col gap-1'
						)}
					>
						<span className="flex items-center justify-center gap-2">
							{loading ? (
								<ArrowPathIcon
									className="h-4 w-4 animate-spin motion-reduce:animate-none"
									aria-hidden
								/>
							) : (
								<FilmIcon className="h-4 w-4 shrink-0" aria-hidden />
							)}
							{loading ? 'Создаём видео…' : 'Создать видео'}
						</span>
						{i2vEnergy ? (
							<span className="text-[11px] font-normal leading-tight opacity-90">
								{i2vEnergy}
							</span>
						) : null}
					</button>
					{result && !loading ? (
						<button
							type="button"
							onClick={onClearResult}
							className={cn(
								studioSecondaryButtonClass,
								'mt-3 w-full justify-center text-sm'
							)}
						>
							<XMarkIcon className="h-4 w-4 shrink-0" aria-hidden />
							Очистить результат
						</button>
					) : null}
				</VideoStudioFlowCard>
			</div>

			<div
				className="min-w-0 xl:sticky xl:top-0"
				data-video-guide="i2v-preview"
			>
				<VideoStudioPanelCard
					title="Предпросмотр"
					hint={loading ? 'Обычно 2–5 минут' : 'Здесь появится ваш ролик'}
					accent
				>
					<section
						className={cn(studioPreviewWellClass, 'p-2 sm:p-3')}
						aria-label="Предпросмотр видео"
					>
						{loading ? (
							<VideoStudioGeneratingPreview imagePreviewUrl={imagePreviewUrl} />
						) : result ? (
							<div className="space-y-4">
								<div className="relative mx-auto aspect-video w-full overflow-hidden rounded-(--desktop-radius-xl) bg-black ring-1 ring-(--desktop-border-subtle)">
									{/* biome-ignore lint/a11y/useMediaCaption: generated preview */}
									<video
										src={
											resultUrl ||
											(result.data
												? `data:video/mp4;base64,${result.data}`
												: undefined)
										}
										controls
										autoPlay
										loop
										className="h-full w-full object-contain"
									/>
									{imagePreviewUrl ? (
										<div className="pointer-events-none absolute bottom-3 left-3 overflow-hidden rounded-lg ring-2 ring-white/25 shadow-lg">
											<img
												src={imagePreviewUrl}
												alt="Исходная картинка"
												className="h-12 w-[4.5rem] object-cover"
											/>
										</div>
									) : null}
								</div>
								<button
									type="button"
									onClick={onDownload}
									title={CREATIVE_NON_COMMERCIAL_DOWNLOAD_HINT}
									className={cn(
										studioPrimaryButtonClass,
										'w-full justify-center'
									)}
								>
									<ArrowDownTrayIcon className="h-4 w-4 shrink-0" aria-hidden />
									Скачать видео
								</button>
							</div>
						) : (
							<div className="flex flex-col items-center py-4">
								<StudioEmptyState
									icon={<FilmIcon aria-hidden />}
									title={
										imagePreviewUrl
											? 'Готово к созданию'
											: 'Здесь появится видео'
									}
									hint={
										imagePreviewUrl
											? 'Осталось описать движение'
											: 'Сначала выберите картинку'
									}
									description={
										imagePreviewUrl
											? 'Нажмите «Создать видео» — ролик появится здесь.'
											: 'Выберите картинку слева и опишите движение.'
									}
									className="min-h-0 w-full border-0 bg-transparent p-4 shadow-none ring-0"
								/>
								{imagePreviewUrl ? (
									<div className="mt-2 w-full max-w-sm overflow-hidden rounded-(--desktop-radius-xl) ring-1 ring-(--desktop-border-subtle)">
										<img
											src={imagePreviewUrl}
											alt="Выбранная картинка"
											className="aspect-video w-full object-contain bg-(--desktop-surface-soft)"
										/>
									</div>
								) : null}
							</div>
						)}
					</section>
				</VideoStudioPanelCard>
			</div>
		</div>
	);
}

export interface VideoStudioHistoryItem {
	id: string;
	name?: string;
	created_at?: string;
}

export interface VideoStudioHistoryWorkspaceProps {
	loading: boolean;
	items: VideoStudioHistoryItem[];
	previewId: string | null;
	previewUrl: string | null;
	onTogglePreview: (id: string) => void;
	onDownload: (item: VideoStudioHistoryItem) => void;
}

export function VideoStudioHistoryWorkspace({
	loading,
	items,
	previewId,
	previewUrl,
	onTogglePreview,
	onDownload,
}: VideoStudioHistoryWorkspaceProps) {
	const { studioPrimaryButtonClass, studioHistoryCardClass } =
		useCreativeStudioShellClasses();

	return (
		<VideoStudioPanelCard
			title="Мои видео"
			hint="Сохранённые ролики из этой студии"
		>
			{loading ? (
				<VideoStudioHistoryGridSkeleton />
			) : items.length === 0 ? (
				<StudioEmptyState
					icon={<FilmIcon aria-hidden />}
					title="Пока нет сохранённых роликов"
					hint="Создайте первое видео"
					description="После генерации ролики появятся здесь — их можно пересмотреть и скачать."
				/>
			) : (
				<ul
					className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3 2xl:grid-cols-4"
					aria-label="Список сохранённых видео"
					data-video-guide="history-grid"
				>
					{items.map((item) => (
						<li
							key={item.id}
							className={cn(
								studioHistoryCardClass,
								'group flex flex-col overflow-hidden transition-shadow hover:shadow-(--desktop-shadow-soft)'
							)}
						>
							<button
								type="button"
								onClick={() => onTogglePreview(item.id)}
								className="relative flex aspect-video items-center justify-center overflow-hidden bg-(--desktop-surface-soft) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)] ring-inset"
								aria-label={
									previewId === item.id
										? `Скрыть: ${item.name || 'видео'}`
										: `Смотреть: ${item.name || 'видео'}`
								}
							>
								{previewId === item.id && previewUrl ? (
									// biome-ignore lint/a11y/useMediaCaption: history preview
									<video
										src={previewUrl}
										controls
										autoPlay
										className="absolute inset-0 h-full w-full object-contain"
									/>
								) : (
									<VideoStudioHistoryThumb contentId={item.id} />
								)}
								<span className="absolute bottom-2 right-2 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-panel-strong)/95 px-2 py-0.5 text-xs font-medium text-(--desktop-text-secondary) backdrop-blur-sm">
									{previewId === item.id ? 'Скрыть' : 'Смотреть'}
								</span>
							</button>
							<div className="flex flex-1 flex-col border-t border-(--desktop-border-subtle) p-3">
								<p
									className="truncate text-sm font-medium text-(--desktop-text-primary)"
									title={item.name || item.id}
								>
									{item.name || 'Без названия'}
								</p>
								<p className="mt-0.5 text-xs text-(--desktop-text-dim)">
									{item.created_at
										? new Date(item.created_at).toLocaleString(undefined, {
												dateStyle: 'short',
												timeStyle: 'short',
											})
										: '—'}
								</p>
								<button
									type="button"
									onClick={() => {
										if (!confirmCreativeNonCommercialDownload()) return;
										onDownload(item);
									}}
									title={CREATIVE_NON_COMMERCIAL_DOWNLOAD_HINT}
									className={cn(
										studioPrimaryButtonClass,
										'mt-2.5 px-3 py-2 text-xs'
									)}
								>
									<ArrowDownTrayIcon
										className="h-3.5 w-3.5 shrink-0"
										aria-hidden
									/>
									Скачать
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</VideoStudioPanelCard>
	);
}
