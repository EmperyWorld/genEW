/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Image Studio text-to-image workspace — prompt, style presets, variants, canvas + handoff.
 *
 * Invariants:
 * - Presentational only; parent owns API and generation state.
 * - Advanced size/seed collapsed by default; one primary CTA.
 *
 * Related:
 * - documentation/product/IMAGE-STUDIO.md
 * - CreativeStudio/studioChrome.tsx, studioSharedUi.tsx
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
	StudioEmptyState,
	useCreativeStudioShellClasses,
	studioDisclosureHintClass,
	studioFieldLabelClass,
	studioFieldMetaClass,
} from '../../CreativeStudio/studioChrome';
import {
	CreativeStudioFlowCard,
	CreativeStudioPanelCard,
	CreativeStudioGeneratingPreview,
} from '../../CreativeStudio/studioSharedUi';
import { CREATIVE_NON_COMMERCIAL_DOWNLOAD_HINT } from '@/constants/creativeOutputNonCommercial';
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	PaintBrushIcon,
	PhotoIcon,
	SparklesIcon,
	Squares2X2Icon,
	XMarkIcon,
} from '@heroicons/react/24/outline';
import {
	SIZE_PRESETS,
	STYLE_PRESETS,
	T2I_EXAMPLES,
	VARIANT_COUNTS,
	type VariantCount,
} from './constants';
import type { ImageStudioResult } from './types';

export interface ImageStudioTextToImageWorkspaceProps {
	prompt: string;
	onPromptChange: (value: string) => void;
	promptIdea: string;
	onPromptIdeaChange: (value: string) => void;
	promptLang: 'en' | 'ru';
	onPromptLangChange: (lang: 'en' | 'ru') => void;
	showPromptHelper: boolean;
	onTogglePromptHelper: () => void;
	promptAiLoading: boolean;
	promptAiEnergy: string | null;
	onSuggestPrompt: () => void;
	stylePresetId: string;
	onStylePresetChange: (id: string) => void;
	variantCount: 1 | VariantCount;
	onVariantCountChange: (count: 1 | VariantCount) => void;
	showAdvanced: boolean;
	onToggleAdvanced: () => void;
	width: number;
	height: number;
	onWidthChange: (value: number) => void;
	onHeightChange: (value: number) => void;
	seed: string;
	onSeedChange: (value: string) => void;
	loading: boolean;
	loadingProgress?: { current: number; total: number } | null;
	canGenerate: boolean;
	t2iEnergy: string | null;
	onGenerate: () => void;
	result: ImageStudioResult | null;
	results?: ImageStudioResult[];
	onSelectResult?: (result: ImageStudioResult) => void;
	onClearResult: () => void;
	onDownload: () => void;
	onSendToEdit?: (result: ImageStudioResult) => void;
	onSendToRotate?: (result: ImageStudioResult) => void;
}

export function ImageStudioTextToImageWorkspace({
	prompt,
	onPromptChange,
	promptIdea,
	onPromptIdeaChange,
	promptLang,
	onPromptLangChange,
	showPromptHelper,
	onTogglePromptHelper,
	promptAiLoading,
	promptAiEnergy,
	onSuggestPrompt,
	stylePresetId,
	onStylePresetChange,
	variantCount,
	onVariantCountChange,
	showAdvanced,
	onToggleAdvanced,
	width,
	height,
	onWidthChange,
	onHeightChange,
	seed,
	onSeedChange,
	loading,
	loadingProgress,
	canGenerate,
	t2iEnergy,
	onGenerate,
	result,
	results = [],
	onSelectResult,
	onClearResult,
	onDownload,
	onSendToEdit,
	onSendToRotate,
}: ImageStudioTextToImageWorkspaceProps) {
	const { t, i18n } = useTranslation('imageStudio');
	const isEn = i18n.language?.toLowerCase().startsWith('en');
	const {
		studioInputClass,
		studioPreviewWellClass,
		studioPrimaryButtonClass,
		studioSecondaryButtonClass,
		studioGhostChipClass,
		studioDisclosureButtonClass,
		studioSoftPanelClass,
		studioPanelClass,
	} = useCreativeStudioShellClasses();

	const gallery = results.length > 1 ? results : result ? [result] : [];
	const loadingMessage =
		loadingProgress && loadingProgress.total > 1
			? t('loading.creatingVariants', {
					current: loadingProgress.current,
					total: loadingProgress.total,
				})
			: t('loading.creating');

	return (
		<div className="grid min-w-0 gap-5 xl:grid-cols-[24rem_1fr] xl:items-start xl:gap-6">
			<div className="space-y-4" data-img-guide="tti-params">
				<CreativeStudioFlowCard step={1} title={t('t2i.step1Title')}>
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
									{t('t2i.helperTitle')}
								</span>
								<span className={studioDisclosureHintClass}>
									{t('t2i.helperHint')}
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
							<label className={studioFieldLabelClass} htmlFor="is-t2i-idea">
								{t('t2i.ideaLabel')}
							</label>
							<textarea
								id="is-t2i-idea"
								value={promptIdea}
								onChange={(e) => onPromptIdeaChange(e.target.value)}
								placeholder={t('t2i.ideaPlaceholder')}
								rows={3}
								className={cn(studioInputClass, 'block min-h-[88px] resize-y')}
							/>
							<div className="flex flex-wrap items-center gap-2">
								<button
									type="button"
									onClick={() => onPromptLangChange('ru')}
									className={cn(
										studioGhostChipClass,
										promptLang === 'ru' &&
											'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] text-(--desktop-text-primary)'
									)}
								>
									{t('t2i.langRu')}
								</button>
								<button
									type="button"
									onClick={() => onPromptLangChange('en')}
									className={cn(
										studioGhostChipClass,
										promptLang === 'en' &&
											'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] text-(--desktop-text-primary)'
									)}
								>
									{t('t2i.langEn')}
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
										{t('t2i.suggest')}
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

					<label className={studioFieldLabelClass} htmlFor="is-t2i-description">
						{t('t2i.promptLabel')}
					</label>
					<textarea
						id="is-t2i-description"
						value={prompt}
						onChange={(e) => onPromptChange(e.target.value)}
						placeholder={t('t2i.promptPlaceholder')}
						rows={5}
						className={cn(studioInputClass, 'block min-h-[132px] resize-y')}
					/>
					<div className="mt-2 flex flex-wrap gap-2">
						{T2I_EXAMPLES.map((example) => (
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

					<div className="mt-4" data-img-guide="style-presets">
						<p className={cn(studioFieldMetaClass, 'mb-1 font-medium')}>
							{t('presets.railTitle')}
						</p>
						<p className={cn(studioFieldMetaClass, 'mb-2')}>
							{t('presets.railHint')}
						</p>
						<div className="flex flex-wrap gap-2">
							{STYLE_PRESETS.map((preset) => {
								const label =
									t(`presets.${preset.id}`, {
										defaultValue: isEn ? preset.labelEn : preset.labelRu,
									}) || (isEn ? preset.labelEn : preset.labelRu);
								return (
									<button
										key={preset.id}
										type="button"
										onClick={() => onStylePresetChange(preset.id)}
										className={cn(
											studioGhostChipClass,
											stylePresetId === preset.id &&
												'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] text-(--desktop-text-primary)'
										)}
									>
										{label}
									</button>
								);
							})}
						</div>
					</div>

					<div className="mt-4">
						<p className={cn(studioFieldMetaClass, 'mb-1 font-medium')}>
							{t('variants.label')}
						</p>
						<p className={cn(studioFieldMetaClass, 'mb-2')}>
							{t('variants.hint')}
						</p>
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								onClick={() => onVariantCountChange(1)}
								className={cn(
									studioGhostChipClass,
									variantCount === 1 &&
										'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] text-(--desktop-text-primary)'
								)}
							>
								{t('variants.one')}
							</button>
							{VARIANT_COUNTS.map((count) => (
								<button
									key={count}
									type="button"
									onClick={() => onVariantCountChange(count)}
									className={cn(
										studioGhostChipClass,
										variantCount === count &&
											'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] text-(--desktop-text-primary)'
									)}
								>
									{t('variants.count', { count })}
								</button>
							))}
						</div>
					</div>
				</CreativeStudioFlowCard>

				<CreativeStudioFlowCard step={2} title={t('t2i.step2Title')}>
					<button
						type="button"
						onClick={onToggleAdvanced}
						className={studioDisclosureButtonClass}
					>
						<span>
							<span className="block text-sm text-(--desktop-text-primary)">
								{t('t2i.advancedTitle')}
							</span>
							<span className={studioDisclosureHintClass}>
								{t('t2i.advancedHint')}
							</span>
						</span>
						{showAdvanced ? (
							<ChevronDownIcon className="h-4 w-4 text-(--desktop-text-muted)" />
						) : (
							<ChevronRightIcon className="h-4 w-4 text-(--desktop-text-muted)" />
						)}
					</button>
					{showAdvanced && (
						<div className="mt-3 space-y-4 rounded-(--desktop-radius-xl) border border-(--desktop-border-subtle) bg-(--desktop-surface-panel-strong) p-4">
							<fieldset className="m-0 min-w-0 border-0 p-0">
								<legend
									className={cn(studioFieldMetaClass, 'mb-2 block font-medium')}
								>
									{t('t2i.sizeLegend')}
								</legend>
								<div className="mb-3 flex flex-wrap gap-2">
									{SIZE_PRESETS.map(({ w, h, label }) => (
										<button
											key={label}
											type="button"
											onClick={() => {
												onWidthChange(w);
												onHeightChange(h);
											}}
											className={cn(
												studioGhostChipClass,
												width === w &&
													height === h &&
													'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] text-(--desktop-text-primary)'
											)}
										>
											{label}
										</button>
									))}
								</div>
								<div className="flex flex-wrap items-end gap-4">
									<div>
										<label
											className={studioFieldLabelClass}
											htmlFor="is-t2i-width"
										>
											{t('t2i.width')}
										</label>
										<input
											id="is-t2i-width"
											type="number"
											min={256}
											max={2048}
											step={64}
											value={width}
											onChange={(e) =>
												onWidthChange(Number(e.target.value) || 1024)
											}
											className={cn(studioInputClass, 'w-24')}
										/>
									</div>
									<div>
										<label
											className={studioFieldLabelClass}
											htmlFor="is-t2i-height"
										>
											{t('t2i.height')}
										</label>
										<input
											id="is-t2i-height"
											type="number"
											min={256}
											max={2048}
											step={64}
											value={height}
											onChange={(e) =>
												onHeightChange(Number(e.target.value) || 1024)
											}
											className={cn(studioInputClass, 'w-24')}
										/>
									</div>
									<div>
										<label
											className={studioFieldLabelClass}
											htmlFor="is-t2i-seed"
										>
											{t('t2i.seed')}
										</label>
										<input
											id="is-t2i-seed"
											type="text"
											value={seed}
											onChange={(e) => onSeedChange(e.target.value)}
											placeholder={t('t2i.seedPlaceholder')}
											className={cn(studioInputClass, 'w-28')}
										/>
									</div>
								</div>
							</fieldset>
						</div>
					)}
					{!showAdvanced && (
						<p className={cn(studioFieldMetaClass, 'mt-2')}>
							{width}×{height}
							{seed.trim()
								? ` · seed ${seed.trim()}`
								: ` · ${t('t2i.seedSummaryRandom')}`}
						</p>
					)}
				</CreativeStudioFlowCard>

				<CreativeStudioFlowCard step={3} title={t('t2i.step3Title')}>
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
								<SparklesIcon className="h-4 w-4 shrink-0" aria-hidden />
							)}
							{loading ? t('t2i.generating') : t('t2i.generate')}
						</span>
						{t2iEnergy ? (
							<span className="text-[11px] font-normal leading-tight opacity-90">
								{t2iEnergy}
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
							{t('t2i.clearResult')}
						</button>
					) : null}
				</CreativeStudioFlowCard>
			</div>

			<div className="min-w-0 xl:sticky xl:top-0" data-img-guide="tti-preview">
				<CreativeStudioPanelCard
					title={t('t2i.canvasTitle')}
					hint={loading ? t('loading.hintDuration') : t('t2i.canvasHintIdle')}
					accent
				>
					<section
						className={cn(studioPreviewWellClass, 'p-2 sm:p-3')}
						aria-label={t('t2i.previewAria')}
					>
						{loading ? (
							<CreativeStudioGeneratingPreview
								statusMessage={loadingMessage}
								previewAspect="square"
							/>
						) : gallery.length > 1 ? (
							<div className="space-y-4">
								<p className="text-sm text-(--desktop-text-secondary)">
									{t('t2i.galleryTitle')}
								</p>
								<ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
									{gallery.map((img, idx) => {
										const selected =
											result?.data === img.data &&
											result?.filename === img.filename;
										return (
											<li
												key={img.filename || `variant-${idx}`}
												className={cn(
													studioPanelClass,
													'overflow-hidden',
													selected &&
														'ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.55)]'
												)}
											>
												<button
													type="button"
													onClick={() => onSelectResult?.(img)}
													className="block w-full p-2 text-left"
												>
													<img
														src={`data:image/png;base64,${img.data}`}
														alt={t('t2i.resultAlt')}
														className="aspect-square w-full rounded-(--desktop-radius-lg) bg-(--desktop-surface-soft) object-contain"
													/>
													<span className="mt-2 block text-center text-xs text-(--desktop-text-secondary)">
														{t('t2i.galleryPick')} {idx + 1}
													</span>
												</button>
											</li>
										);
									})}
								</ul>
								{result ? (
									<div className="space-y-3">
										<div className="relative mx-auto aspect-square w-full max-w-lg overflow-hidden rounded-(--desktop-radius-xl) bg-(--desktop-surface-soft) ring-1 ring-(--desktop-border-subtle)">
											<img
												src={`data:image/png;base64,${result.data}`}
												alt={t('t2i.resultAlt')}
												className="h-full w-full object-contain"
											/>
										</div>
										<p className="text-sm font-medium text-(--desktop-text-primary)">
											{t('handoff.title')}
										</p>
										<div className="flex flex-wrap justify-end gap-2">
											{onSendToEdit ? (
												<button
													type="button"
													data-testid="handoff-edit"
													onClick={() => onSendToEdit(result)}
													className={cn(
														studioSecondaryButtonClass,
														'px-3 py-2 text-sm'
													)}
												>
													<PaintBrushIcon
														className="h-4 w-4 shrink-0"
														aria-hidden
													/>
													{t('handoff.edit')}
												</button>
											) : null}
											{onSendToRotate ? (
												<button
													type="button"
													data-testid="handoff-rotate"
													onClick={() => onSendToRotate(result)}
													className={cn(
														studioSecondaryButtonClass,
														'px-3 py-2 text-sm'
													)}
												>
													<Squares2X2Icon
														className="h-4 w-4 shrink-0"
														aria-hidden
													/>
													{t('handoff.rotate')}
												</button>
											) : null}
											<button
												type="button"
												onClick={onClearResult}
												className={cn(
													studioSecondaryButtonClass,
													'px-3 py-2 text-sm'
												)}
											>
												<XMarkIcon className="h-4 w-4 shrink-0" aria-hidden />
												{t('handoff.clear')}
											</button>
											<button
												type="button"
												onClick={onDownload}
												title={CREATIVE_NON_COMMERCIAL_DOWNLOAD_HINT}
												className={cn(
													studioPrimaryButtonClass,
													'justify-center px-4 py-2 text-sm'
												)}
											>
												<ArrowDownTrayIcon
													className="h-4 w-4 shrink-0"
													aria-hidden
												/>
												{t('handoff.download')}
											</button>
										</div>
									</div>
								) : null}
							</div>
						) : result ? (
							<div className="space-y-4">
								<div className="relative mx-auto aspect-square w-full max-w-lg overflow-hidden rounded-(--desktop-radius-xl) bg-(--desktop-surface-soft) ring-1 ring-(--desktop-border-subtle)">
									<img
										src={`data:image/png;base64,${result.data}`}
										alt={t('t2i.resultAlt')}
										className="h-full w-full object-contain"
									/>
								</div>
								<p className="text-sm font-medium text-(--desktop-text-primary)">
									{t('handoff.title')}
								</p>
								<div className="flex flex-wrap justify-end gap-2">
									{onSendToEdit ? (
										<button
											type="button"
											data-testid="handoff-edit"
											onClick={() => onSendToEdit(result)}
											className={cn(
												studioSecondaryButtonClass,
												'px-3 py-2 text-sm'
											)}
										>
											<PaintBrushIcon
												className="h-4 w-4 shrink-0"
												aria-hidden
											/>
											{t('handoff.edit')}
										</button>
									) : null}
									{onSendToRotate ? (
										<button
											type="button"
											data-testid="handoff-rotate"
											onClick={() => onSendToRotate(result)}
											className={cn(
												studioSecondaryButtonClass,
												'px-3 py-2 text-sm'
											)}
										>
											<Squares2X2Icon
												className="h-4 w-4 shrink-0"
												aria-hidden
											/>
											{t('handoff.rotate')}
										</button>
									) : null}
									<button
										type="button"
										onClick={onClearResult}
										className={cn(
											studioSecondaryButtonClass,
											'px-3 py-2 text-sm'
										)}
									>
										<XMarkIcon className="h-4 w-4 shrink-0" aria-hidden />
										{t('handoff.clear')}
									</button>
									<button
										type="button"
										onClick={onDownload}
										title={CREATIVE_NON_COMMERCIAL_DOWNLOAD_HINT}
										className={cn(
											studioPrimaryButtonClass,
											'justify-center px-4 py-2 text-sm'
										)}
									>
										<ArrowDownTrayIcon
											className="h-4 w-4 shrink-0"
											aria-hidden
										/>
										{t('handoff.download')}
									</button>
								</div>
							</div>
						) : (
							<StudioEmptyState
								icon={<PhotoIcon aria-hidden />}
								title={t('empty.canvasTitle')}
								hint={t('empty.canvasHint')}
								description={t('empty.canvasDescription')}
								className="min-h-[280px] w-full border-0 bg-transparent p-4 shadow-none ring-0"
							/>
						)}
					</section>
				</CreativeStudioPanelCard>
			</div>
		</div>
	);
}
