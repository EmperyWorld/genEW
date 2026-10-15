/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Image Studio rotate / camera-angle workspace.
 *
 * Invariants:
 * - Presentational only; rotate mode values match API keys.
 *
 * Related:
 * - documentation/product/IMAGE-STUDIO.md
 * - workspaces/constants.ts ROTATE_MODES
 */

import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
	StudioEmptyState,
	useCreativeStudioShellClasses,
	studioFieldLabelClass,
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
	PhotoIcon,
	SparklesIcon,
	TrashIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';
import { ROTATE_MODES } from './constants';
import type { ImageStudioResult } from './types';

export interface ImageStudioRotateWorkspaceProps {
	rotateFile: File | null;
	rotateFilePreviewUrl: string | null;
	fileInputId: string;
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	onFileChange: (file: File | null) => void;
	rotateMode: string;
	onRotateModeChange: (mode: string) => void;
	loading: boolean;
	canGenerate: boolean;
	rotateEnergy: string | null;
	onGenerate: () => void;
	results: ImageStudioResult[];
	onClearResults: () => void;
	onDownload: (result: ImageStudioResult, index: number) => void;
}

export function ImageStudioRotateWorkspace({
	rotateFile,
	rotateFilePreviewUrl,
	fileInputId,
	fileInputRef,
	onFileChange,
	rotateMode,
	onRotateModeChange,
	loading,
	canGenerate,
	rotateEnergy,
	onGenerate,
	results,
	onClearResults,
	onDownload,
}: ImageStudioRotateWorkspaceProps) {
	const { t, i18n } = useTranslation('imageStudio');
	const isEn = i18n.language?.toLowerCase().startsWith('en');
	const {
		studioDropzoneClass,
		studioInputClass,
		studioPreviewWellClass,
		studioPrimaryButtonClass,
		studioSecondaryButtonClass,
		studioPanelClass,
	} = useCreativeStudioShellClasses();

	return (
		<div className="grid min-w-0 gap-5 xl:grid-cols-[24rem_1fr] xl:items-start xl:gap-6">
			<div className="space-y-4" data-img-guide="rotate-form">
				<CreativeStudioFlowCard
					step={1}
					title={t('rotate.step1Title')}
					description={t('rotate.step1Description')}
				>
					<input
						id={fileInputId}
						ref={fileInputRef}
						type="file"
						accept="image/png,image/jpeg,image/webp"
						onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
						className="sr-only"
						aria-label={t('rotate.step1Title')}
					/>
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						className={cn(studioDropzoneClass, 'min-h-[148px] w-full')}
					>
						<PhotoIcon className="mb-2 h-9 w-9 text-(--desktop-text-muted)" />
						<p className="text-sm font-medium text-(--desktop-text-primary)">
							{rotateFile
								? `${rotateFile.name} · ${(rotateFile.size / 1024).toFixed(1)} ${t('common.kb')}`
								: t('rotate.pickIdle')}
						</p>
					</button>
					{rotateFile ? (
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className={cn(
								studioSecondaryButtonClass,
								'mt-3 w-full justify-center text-xs'
							)}
						>
							<ArrowUpTrayIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
							{t('rotate.changeFile')}
						</button>
					) : null}
					{rotateFilePreviewUrl ? (
						<div className="mt-4 overflow-hidden rounded-(--desktop-radius-xl) ring-1 ring-(--desktop-border-subtle)">
							<img
								src={rotateFilePreviewUrl}
								alt={t('rotate.sourceAlt')}
								className="aspect-square w-full bg-(--desktop-surface-soft) object-contain"
							/>
						</div>
					) : null}
				</CreativeStudioFlowCard>

				<CreativeStudioFlowCard
					step={2}
					title={t('rotate.step2Title')}
					description={t('rotate.step2Description')}
				>
					<label className={studioFieldLabelClass} htmlFor="is-rotate-mode">
						{t('rotate.modeLabel')}
					</label>
					<select
						id="is-rotate-mode"
						value={rotateMode}
						onChange={(e) => onRotateModeChange(e.target.value)}
						className={cn(studioInputClass, 'max-w-full')}
					>
						{ROTATE_MODES.map((m) => (
							<option key={m.value} value={m.value}>
								{isEn ? m.labelEn : m.labelRu}
							</option>
						))}
					</select>
				</CreativeStudioFlowCard>

				<CreativeStudioFlowCard step={3} title={t('rotate.step3Title')}>
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
							{loading ? t('rotate.generating') : t('rotate.generate')}
						</span>
						{rotateEnergy ? (
							<span className="text-[11px] font-normal leading-tight opacity-90">
								{rotateEnergy}
							</span>
						) : null}
					</button>
				</CreativeStudioFlowCard>
			</div>

			<div
				className="min-w-0 xl:sticky xl:top-0"
				data-img-guide="rotate-preview"
			>
				<CreativeStudioPanelCard
					title={t('rotate.previewTitle')}
					hint={
						loading
							? t('loading.hintDuration')
							: results.length > 1
								? t('rotate.previewHintMulti', { count: results.length })
								: t('rotate.previewHintIdle')
					}
					accent
				>
					<section
						className={cn(studioPreviewWellClass, 'p-2 sm:p-3')}
						aria-label={t('rotate.previewTitle')}
					>
						{loading ? (
							<CreativeStudioGeneratingPreview
								statusMessage={t('loading.rotating')}
								previewAspect="square"
								overlayImageUrl={rotateFilePreviewUrl}
							/>
						) : results.length === 1 ? (
							<div className="space-y-4">
								<div className="relative mx-auto aspect-square w-full max-w-lg overflow-hidden rounded-(--desktop-radius-xl) bg-(--desktop-surface-soft) ring-1 ring-(--desktop-border-subtle)">
									<img
										src={`data:image/png;base64,${results[0].data}`}
										alt={t('rotate.resultAlt')}
										className="h-full w-full object-contain"
									/>
								</div>
								<div className="flex flex-wrap justify-end gap-2">
									<button
										type="button"
										onClick={onClearResults}
										className={cn(
											studioSecondaryButtonClass,
											'px-3 py-2 text-sm'
										)}
									>
										<TrashIcon className="h-4 w-4 shrink-0" aria-hidden />
										{t('common.clear')}
									</button>
									<button
										type="button"
										onClick={() => onDownload(results[0], 0)}
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
										{t('common.download')}
									</button>
								</div>
							</div>
						) : results.length > 1 ? (
							<div className="space-y-4">
								<p className="text-sm text-(--desktop-text-secondary)">
									{t('rotate.allAnglesHint', { count: results.length })}
								</p>
								<ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
									{results.map((img, idx) => (
										<li
											key={img.filename || `rotate-${idx}`}
											className={cn(studioPanelClass, 'overflow-hidden')}
										>
											<div className="border-b border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/50 px-3 py-2">
												<span className="text-xs font-medium text-(--desktop-text-secondary)">
													{t('rotate.angleLabel', { index: idx + 1 })}
												</span>
											</div>
											<div className="p-2">
												<img
													src={`data:image/png;base64,${img.data}`}
													alt={t('rotate.angleLabel', { index: idx + 1 })}
													className="aspect-square w-full rounded-(--desktop-radius-lg) bg-(--desktop-surface-soft) object-contain ring-1 ring-(--desktop-border-subtle)"
												/>
												<button
													type="button"
													onClick={() => onDownload(img, idx)}
													title={CREATIVE_NON_COMMERCIAL_DOWNLOAD_HINT}
													className={cn(
														studioPrimaryButtonClass,
														'mt-2 w-full justify-center px-3 py-2 text-xs'
													)}
												>
													<ArrowDownTrayIcon
														className="h-3.5 w-3.5 shrink-0"
														aria-hidden
													/>
													{t('common.download')}
												</button>
											</div>
										</li>
									))}
								</ul>
								<div className="flex justify-end">
									<button
										type="button"
										onClick={onClearResults}
										className={cn(
											studioSecondaryButtonClass,
											'px-3 py-2 text-sm'
										)}
									>
										<XMarkIcon className="h-4 w-4 shrink-0" aria-hidden />
										{t('rotate.clearAll')}
									</button>
								</div>
							</div>
						) : (
							<StudioEmptyState
								icon={<PhotoIcon aria-hidden />}
								title={t('empty.rotateTitle')}
								hint={t('empty.rotateHint')}
								description={t('empty.rotateDescription')}
								className="min-h-[280px] w-full border-0 bg-transparent p-4 shadow-none ring-0"
							/>
						)}
					</section>
				</CreativeStudioPanelCard>
			</div>
		</div>
	);
}
