/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Image Studio edit workspace — upload, instruction, before/after canvas.
 *
 * Invariants:
 * - Presentational only; advanced negative/seed collapsed by default.
 *
 * Related:
 * - documentation/product/IMAGE-STUDIO.md
 */

import type * as React from 'react';
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
	ArrowUpTrayIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	PhotoIcon,
	SparklesIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';
import type { ImageStudioResult } from './types';

export interface ImageStudioEditWorkspaceProps {
	dragOver: boolean;
	onDrop: (e: React.DragEvent) => void;
	onDragOver: (e: React.DragEvent) => void;
	onDragLeave: () => void;
	editFile: File | null;
	editFilePreviewUrl: string | null;
	fileInputId: string;
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	onFileChange: (file: File | null) => void;
	instruction: string;
	onInstructionChange: (value: string) => void;
	showAdvanced: boolean;
	onToggleAdvanced: () => void;
	negative: string;
	onNegativeChange: (value: string) => void;
	seed: string;
	onSeedChange: (value: string) => void;
	loading: boolean;
	canApply: boolean;
	editEnergy: string | null;
	onApply: () => void;
	result: ImageStudioResult | null;
	onClearResult: () => void;
	onDownload: () => void;
}

export function ImageStudioEditWorkspace({
	dragOver,
	onDrop,
	onDragOver,
	onDragLeave,
	editFile,
	editFilePreviewUrl,
	fileInputId,
	fileInputRef,
	onFileChange,
	instruction,
	onInstructionChange,
	showAdvanced,
	onToggleAdvanced,
	negative,
	onNegativeChange,
	seed,
	onSeedChange,
	loading,
	canApply,
	editEnergy,
	onApply,
	result,
	onClearResult,
	onDownload,
}: ImageStudioEditWorkspaceProps) {
	const { t } = useTranslation('imageStudio');
	const {
		studioDropzoneClass,
		studioInputClass,
		studioPreviewWellClass,
		studioPrimaryButtonClass,
		studioSecondaryButtonClass,
		studioDisclosureButtonClass,
		studioSoftPanelClass,
	} = useCreativeStudioShellClasses();

	return (
		<div className="grid min-w-0 gap-5 xl:grid-cols-[24rem_1fr] xl:items-start xl:gap-6">
			<div className="space-y-4">
				<div data-img-guide="edit-source">
					<CreativeStudioFlowCard
						step={1}
						title={t('edit.step1Title')}
						description={t('edit.step1Description')}
					>
						<input
							id={fileInputId}
							ref={fileInputRef}
							type="file"
							accept="image/png,image/jpeg,image/webp"
							onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
							className="sr-only"
							aria-label={t('edit.step1Title')}
						/>
						<label
							htmlFor={fileInputId}
							aria-label={t('edit.dropIdle')}
							onDrop={onDrop}
							onDragOver={onDragOver}
							onDragLeave={onDragLeave}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									fileInputRef.current?.click();
								}
							}}
							// biome-ignore lint/a11y/noNoninteractiveTabindex: dropzone needs keyboard focus for Enter/Space alongside drag-and-drop
							tabIndex={0}
							className={cn(
								studioDropzoneClass,
								'block min-h-[148px]',
								dragOver &&
									'scale-[1.01] border-[rgb(var(--desktop-accent-rgb)/0.55)] bg-(--desktop-surface-accent)',
								editFile &&
									!dragOver &&
									'border-solid bg-(--desktop-surface-soft)/40'
							)}
						>
							<PhotoIcon
								className={cn(
									'mb-2 h-9 w-9',
									dragOver
										? 'text-[rgb(var(--desktop-accent-rgb)/0.9)]'
										: 'text-(--desktop-text-muted)'
								)}
							/>
							<p className="text-sm font-medium text-(--desktop-text-primary)">
								{editFile
									? `${editFile.name} · ${(editFile.size / 1024).toFixed(1)} ${t('common.kb')}`
									: t('edit.dropIdle')}
							</p>
						</label>
						{editFile ? (
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className={cn(
									studioSecondaryButtonClass,
									'mt-3 w-full justify-center text-xs'
								)}
							>
								<ArrowUpTrayIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
								{t('edit.changeFile')}
							</button>
						) : null}
					</CreativeStudioFlowCard>
				</div>

				<div data-img-guide="edit-form">
					<CreativeStudioFlowCard
						step={2}
						title={t('edit.step2Title')}
						description={t('edit.step2Description')}
					>
						<label
							className={studioFieldLabelClass}
							htmlFor="is-edit-instruction"
						>
							{t('edit.instructionLabel')}
						</label>
						<textarea
							id="is-edit-instruction"
							value={instruction}
							onChange={(e) => onInstructionChange(e.target.value)}
							placeholder={t('edit.instructionPlaceholder')}
							rows={5}
							className={cn(studioInputClass, 'block min-h-[132px] resize-y')}
						/>
					</CreativeStudioFlowCard>
				</div>

				<CreativeStudioFlowCard step={3} title={t('edit.step3Title')}>
					<button
						type="button"
						onClick={onApply}
						disabled={!canApply}
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
							{loading ? t('edit.applying') : t('edit.apply')}
						</span>
						{editEnergy ? (
							<span className="text-[11px] font-normal leading-tight opacity-90">
								{editEnergy}
							</span>
						) : null}
					</button>

					<button
						type="button"
						onClick={onToggleAdvanced}
						className={cn(studioDisclosureButtonClass, 'mt-4')}
					>
						<span>
							<span className="block text-sm text-(--desktop-text-primary)">
								{t('edit.advancedTitle')}
							</span>
							<span className={studioDisclosureHintClass}>
								{t('edit.advancedHint')}
							</span>
						</span>
						{showAdvanced ? (
							<ChevronDownIcon className="h-4 w-4 text-(--desktop-text-muted)" />
						) : (
							<ChevronRightIcon className="h-4 w-4 text-(--desktop-text-muted)" />
						)}
					</button>
					{showAdvanced && (
						<div
							className={cn(
								studioSoftPanelClass,
								'mt-3 space-y-4 rounded-(--desktop-radius-xl) p-4'
							)}
						>
							<div>
								<label
									className={studioFieldLabelClass}
									htmlFor="is-edit-negative"
								>
									{t('edit.negativeLabel')}
								</label>
								<p className={cn(studioFieldMetaClass, 'mb-2')}>
									{t('edit.negativeHint')}
								</p>
								<textarea
									id="is-edit-negative"
									value={negative}
									onChange={(e) => onNegativeChange(e.target.value)}
									placeholder={t('edit.negativePlaceholder')}
									rows={2}
									className={cn(
										studioInputClass,
										'block min-h-[72px] resize-y'
									)}
								/>
							</div>
							<div>
								<label className={studioFieldLabelClass} htmlFor="is-edit-seed">
									{t('t2i.seed')}
								</label>
								<input
									id="is-edit-seed"
									type="text"
									value={seed}
									onChange={(e) => onSeedChange(e.target.value)}
									placeholder={t('t2i.seedPlaceholder')}
									className={cn(studioInputClass, 'w-28')}
								/>
							</div>
						</div>
					)}
				</CreativeStudioFlowCard>
			</div>

			<div className="min-w-0 xl:sticky xl:top-0" data-img-guide="edit-preview">
				<CreativeStudioPanelCard
					title={t('edit.canvasTitle')}
					hint={loading ? t('loading.hintDuration') : t('edit.canvasHintIdle')}
					accent
				>
					<section
						className={cn(studioPreviewWellClass, 'p-2 sm:p-3')}
						aria-label={t('edit.canvasTitle')}
					>
						{loading ? (
							<div
								className={cn(
									editFilePreviewUrl
										? 'grid gap-4 lg:grid-cols-2'
										: 'grid grid-cols-1'
								)}
							>
								{editFilePreviewUrl ? (
									<div className="space-y-2">
										<p className="text-xs font-medium text-(--desktop-text-dim)">
											{t('edit.before')}
										</p>
										<img
											src={editFilePreviewUrl}
											alt={t('edit.sourceAlt')}
											className="aspect-square w-full rounded-(--desktop-radius-xl) bg-(--desktop-surface-soft) object-contain ring-1 ring-(--desktop-border-subtle)"
										/>
									</div>
								) : null}
								<div className="space-y-2">
									<p className="text-xs font-medium text-(--desktop-text-dim)">
										{t('edit.after')}
									</p>
									<CreativeStudioGeneratingPreview
										statusMessage={t('loading.applying')}
										previewAspect="square"
										overlayImageUrl={editFilePreviewUrl}
									/>
								</div>
							</div>
						) : result || editFilePreviewUrl ? (
							<div
								className={cn(
									'grid gap-4',
									editFilePreviewUrl && result
										? 'lg:grid-cols-2'
										: 'grid-cols-1'
								)}
							>
								{editFilePreviewUrl ? (
									<div className="space-y-2">
										<p className="text-xs font-medium text-(--desktop-text-dim)">
											{t('edit.before')}
										</p>
										<img
											src={editFilePreviewUrl}
											alt={t('edit.sourceAlt')}
											className="aspect-square w-full rounded-(--desktop-radius-xl) bg-(--desktop-surface-soft) object-contain ring-1 ring-(--desktop-border-subtle)"
										/>
									</div>
								) : null}
								{result ? (
									<div className="space-y-3">
										<p className="text-xs font-medium text-(--desktop-text-dim)">
											{t('edit.after')}
										</p>
										<img
											src={`data:image/png;base64,${result.data}`}
											alt={t('edit.resultAlt')}
											className="aspect-square w-full rounded-(--desktop-radius-xl) bg-(--desktop-surface-soft) object-contain ring-1 ring-(--desktop-border-subtle)"
										/>
										<div className="flex flex-wrap justify-end gap-2">
											<button
												type="button"
												onClick={onClearResult}
												className={cn(
													studioSecondaryButtonClass,
													'px-3 py-2 text-sm'
												)}
											>
												<XMarkIcon className="h-4 w-4 shrink-0" aria-hidden />
												{t('common.clear')}
											</button>
											<button
												type="button"
												onClick={onDownload}
												title={CREATIVE_NON_COMMERCIAL_DOWNLOAD_HINT}
												className={cn(
													studioPrimaryButtonClass,
													'px-4 py-2 text-sm'
												)}
											>
												<ArrowDownTrayIcon
													className="h-4 w-4 shrink-0"
													aria-hidden
												/>
												{t('common.download')}
											</button>
										</div>
									</div>
								) : (
									<StudioEmptyState
										icon={<PhotoIcon aria-hidden />}
										title={t('empty.editReadyTitle')}
										hint={t('empty.editReadyHint')}
										description={t('empty.editReadyDescription')}
										className="min-h-[200px] border-0 bg-transparent p-4 shadow-none ring-0"
									/>
								)}
							</div>
						) : (
							<StudioEmptyState
								icon={<PhotoIcon aria-hidden />}
								title={t('empty.editMissingTitle')}
								hint={t('empty.editMissingHint')}
								description={t('empty.editMissingDescription')}
								className="min-h-[280px] w-full border-0 bg-transparent p-4 shadow-none ring-0"
							/>
						)}
					</section>
				</CreativeStudioPanelCard>
			</div>
		</div>
	);
}
