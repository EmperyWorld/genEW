/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Image Studio history gallery with tag filter chips and open-in-editor handoff.
 *
 * Invariants:
 * - Filtering is client-side on item.tags; parent owns fetch/preview blobs.
 *
 * Related:
 * - documentation/product/IMAGE-STUDIO.md
 * - imageStudioHistory.ts
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
	StudioEmptyState,
	useCreativeStudioShellClasses,
} from '../../CreativeStudio/studioChrome';
import {
	CreativeStudioPanelCard,
	CreativeStudioHistoryGridSkeleton,
	CreativeStudioImageHistoryThumb,
} from '../../CreativeStudio/studioSharedUi';
import {
	confirmCreativeNonCommercialDownload,
	CREATIVE_NON_COMMERCIAL_DOWNLOAD_HINT,
} from '@/constants/creativeOutputNonCommercial';
import {
	ArrowDownTrayIcon,
	PaintBrushIcon,
	PhotoIcon,
} from '@heroicons/react/24/outline';
import { HISTORY_FILTER_TAGS, type HistoryFilterTag } from './constants';
import type { ImageStudioHistoryItem } from './types';

export interface ImageStudioHistoryWorkspaceProps {
	loading: boolean;
	items: ImageStudioHistoryItem[];
	filterTag: HistoryFilterTag;
	onFilterTagChange: (tag: HistoryFilterTag) => void;
	previewId: string | null;
	previewUrl: string | null;
	onTogglePreview: (id: string) => void;
	onDownload: (item: ImageStudioHistoryItem) => void;
	onOpenInEditor?: (item: ImageStudioHistoryItem) => void;
}

export function ImageStudioHistoryWorkspace({
	loading,
	items,
	filterTag,
	onFilterTagChange,
	previewId,
	previewUrl,
	onTogglePreview,
	onDownload,
	onOpenInEditor,
}: ImageStudioHistoryWorkspaceProps) {
	const { t } = useTranslation('imageStudio');
	const {
		studioPrimaryButtonClass,
		studioSecondaryButtonClass,
		studioGhostChipClass,
		studioHistoryCardClass,
	} = useCreativeStudioShellClasses();

	return (
		<CreativeStudioPanelCard
			title={t('history.title')}
			hint={t('history.hint')}
		>
			<fieldset
				className="m-0 mb-4 flex min-w-0 flex-wrap gap-2 border-0 p-0"
				aria-label={t('historyFilters.aria')}
				data-img-guide="history-filters"
			>
				{HISTORY_FILTER_TAGS.map((tag) => (
					<button
						key={tag}
						type="button"
						onClick={() => onFilterTagChange(tag)}
						className={cn(
							studioGhostChipClass,
							filterTag === tag &&
								'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] text-(--desktop-text-primary)'
						)}
					>
						{t(`historyFilters.${tag}`)}
					</button>
				))}
			</fieldset>

			{loading ? (
				<CreativeStudioHistoryGridSkeleton thumbAspect="square" />
			) : items.length === 0 ? (
				<StudioEmptyState
					icon={<PhotoIcon aria-hidden />}
					title={t('empty.historyTitle')}
					hint={t('empty.historyHint')}
					description={t('empty.historyDescription')}
				/>
			) : (
				<ul
					className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3 2xl:grid-cols-4"
					aria-label={t('history.listAria')}
					data-img-guide="history-grid"
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
								className="relative flex aspect-square items-center justify-center overflow-hidden bg-(--desktop-surface-soft) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)] ring-inset"
								aria-label={
									previewId === item.id
										? `${t('history.hide')}: ${item.name || t('history.untitled')}`
										: `${t('history.view')}: ${item.name || t('history.untitled')}`
								}
							>
								{previewId === item.id && previewUrl ? (
									<img
										src={previewUrl}
										alt=""
										className="absolute inset-0 h-full w-full object-contain"
									/>
								) : (
									<CreativeStudioImageHistoryThumb contentId={item.id} />
								)}
								<span className="absolute bottom-2 right-2 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-panel-strong)/95 px-2 py-0.5 text-xs font-medium text-(--desktop-text-secondary) backdrop-blur-sm">
									{previewId === item.id
										? t('history.hide')
										: t('history.view')}
								</span>
							</button>
							<div className="flex flex-1 flex-col border-t border-(--desktop-border-subtle) p-3">
								<p
									className="truncate text-sm font-medium text-(--desktop-text-primary)"
									title={item.name || item.id}
								>
									{item.name || t('history.untitled')}
								</p>
								<p className="mt-0.5 text-xs text-(--desktop-text-dim)">
									{item.created_at
										? new Date(item.created_at).toLocaleString(undefined, {
												dateStyle: 'short',
												timeStyle: 'short',
											})
										: '—'}
								</p>
								<div className="mt-2.5 flex flex-col gap-2">
									{onOpenInEditor ? (
										<button
											type="button"
											onClick={() => onOpenInEditor(item)}
											className={cn(
												studioSecondaryButtonClass,
												'px-3 py-2 text-xs'
											)}
										>
											<PaintBrushIcon
												className="h-3.5 w-3.5 shrink-0"
												aria-hidden
											/>
											{t('historyFilters.openInEditor')}
										</button>
									) : null}
									<button
										type="button"
										onClick={() => {
											if (!confirmCreativeNonCommercialDownload()) return;
											onDownload(item);
										}}
										title={CREATIVE_NON_COMMERCIAL_DOWNLOAD_HINT}
										className={cn(
											studioPrimaryButtonClass,
											'px-3 py-2 text-xs'
										)}
									>
										<ArrowDownTrayIcon
											className="h-3.5 w-3.5 shrink-0"
											aria-hidden
										/>
										{t('history.download')}
									</button>
								</div>
							</div>
						</li>
					))}
				</ul>
			)}
		</CreativeStudioPanelCard>
	);
}
