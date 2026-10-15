/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Expanded desktop window for dashboard favorites CRUD (widget shelf companion).
 *
 * Invariants:
 * - Shares data layer with panel via `useDashboardFavorites`.
 *
 * Related:
 * - `pages/Desktop/hooks/useDashboardFavorites.ts`
 */

import { cn } from '@/utils/cn';
import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core';
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bars2Icon, TrashIcon } from '@heroicons/react/24/outline';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '../constants';
import {
	openDashboardFavoriteUrl,
	useDashboardFavorites,
	type DashboardFavoriteItem,
} from '../hooks/useDashboardFavorites';
import {
	DesktopAppButton,
	DesktopAppContentWrapper,
	DesktopAppSkeleton,
	DesktopAppSurface,
	DESKTOP_CHROME_FOCUS_VISIBLE,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

function DashboardFavoritesLoadingState() {
	const { t } = useTranslation('desktopUi');
	const tw = (key: string) => t(`settingsPanel.widgetsPanel.${key}`);

	return (
		<div
			className="flex flex-col gap-2"
			role="status"
			aria-live="polite"
			aria-busy="true"
		>
			<p
				className={cn(DESKTOP_TYPOGRAPHY.caption, 'text-(--desktop-text-dim)')}
			>
				{tw('favoritesLoading')}
			</p>
			<div className="space-y-2" aria-hidden>
				{['a', 'b', 'c', 'd'].map((key) => (
					<DesktopAppSkeleton key={key} className="h-11" />
				))}
			</div>
		</div>
	);
}

function SortableFavoriteRow({
	item,
	disabled,
	onRemove,
	dragHandleLabel,
	removeLabel,
}: {
	item: DashboardFavoriteItem;
	disabled: boolean;
	onRemove: (id: string) => void;
	dragHandleLabel: string;
	removeLabel: string;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.id, disabled });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<li
			ref={setNodeRef}
			style={style}
			className={cn(
				'flex items-center gap-2 rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/80 px-2 py-2',
				isDragging &&
					'z-10 opacity-95 shadow-lg ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.35)]'
			)}
		>
			<DesktopChromeTooltip
				content={dragHandleLabel}
				placement="top"
				offsetExtra={4}
			>
				<button
					type="button"
					className={cn(
						'-m-0.5 shrink-0 cursor-grab touch-none rounded-lg p-1.5 text-(--desktop-text-muted) transition-colors hover:bg-(--desktop-surface-panel) hover:text-(--desktop-text-secondary)',
						DESKTOP_CHROME_FOCUS_VISIBLE,
						disabled && 'pointer-events-none opacity-45'
					)}
					aria-label={dragHandleLabel}
					disabled={disabled}
					{...attributes}
					{...listeners}
				>
					<Bars2Icon
						className="size-4"
						strokeWidth={DESKTOP_LUCIDE.stroke}
						aria-hidden
					/>
				</button>
			</DesktopChromeTooltip>
			<button
				type="button"
				onClick={() => openDashboardFavoriteUrl(item.url)}
				className={cn(
					DESKTOP_TYPOGRAPHY.caption,
					'min-w-0 flex-1 truncate text-left text-(--desktop-text-primary) hover:underline',
					'focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
				)}
			>
				<span aria-hidden className="mr-1.5">
					{item.icon}
				</span>
				{item.title}
			</button>
			<DesktopChromeTooltip
				content={removeLabel}
				placement="top"
				offsetExtra={4}
			>
				<DesktopAppButton
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8 shrink-0"
					disabled={disabled}
					onClick={() => onRemove(item.id)}
					aria-label={removeLabel}
				>
					<TrashIcon className="size-4" strokeWidth={2} aria-hidden />
				</DesktopAppButton>
			</DesktopChromeTooltip>
		</li>
	);
}

export default function DesktopDashboardFavoritesApp(): React.ReactElement {
	const { t } = useTranslation('desktopUi');
	const { t: tWorkspace } = useTranslation('desktopUi', {
		keyPrefix: 'workspace',
	});
	const tw = (key: string, opts?: Record<string, unknown>) =>
		t(`settingsPanel.widgetsPanel.${key}`, opts);
	const {
		favorites,
		isLoading,
		isLocalOnly,
		storageWriteFailed,
		error,
		addFavorite,
		removeFavorite,
		reorderFavorites,
		isMutating,
	} = useDashboardFavorites();
	const [draftTitle, setDraftTitle] = useState('');
	const [draftUrl, setDraftUrl] = useState('');
	const favoriteIds = useMemo(
		() => favorites.map((item) => item.id),
		[favorites]
	);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	const onSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const title = draftTitle.trim();
			if (!title) return;
			addFavorite({ title, url: draftUrl.trim() || '#' });
			setDraftTitle('');
			setDraftUrl('');
		},
		[addFavorite, draftTitle, draftUrl]
	);

	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;
			const oldIndex = favorites.findIndex((item) => item.id === active.id);
			const newIndex = favorites.findIndex((item) => item.id === over.id);
			if (oldIndex < 0 || newIndex < 0) return;
			reorderFavorites(oldIndex, newIndex);
		},
		[favorites, reorderFavorites]
	);

	return (
		<DesktopAppContentWrapper
			appComponent="DesktopDashboardFavoritesApp"
			mode="passthrough"
			className="relative h-full min-h-0 overflow-hidden"
		>
			<DesktopAppSurface className="flex h-full min-h-0 flex-col gap-3 p-4">
				{isLocalOnly ? (
					<p
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-dim)'
						)}
						data-local-only="true"
					>
						{tWorkspace('localOnlyHint')}
					</p>
				) : null}
				{storageWriteFailed ? (
					<p
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-dim)'
						)}
						role="alert"
					>
						{tWorkspace('localStorageWriteFailed')}
					</p>
				) : null}
				<form
					className="flex shrink-0 flex-col gap-2 sm:flex-row"
					onSubmit={onSubmit}
				>
					<input
						type="text"
						value={draftTitle}
						onChange={(e) => setDraftTitle(e.target.value)}
						placeholder={tw('favoritesTitlePlaceholder')}
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'min-w-0 flex-1 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/60 px-3 py-2 text-(--desktop-text-primary) placeholder:text-(--desktop-text-muted) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
						)}
					/>
					<input
						type="text"
						value={draftUrl}
						onChange={(e) => setDraftUrl(e.target.value)}
						placeholder={tw('favoritesUrlPlaceholder')}
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'min-w-0 flex-1 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/60 px-3 py-2 text-(--desktop-text-primary) placeholder:text-(--desktop-text-muted) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
						)}
					/>
					<DesktopAppButton type="submit" size="sm" disabled={isMutating}>
						{tw('favoritesAdd')}
					</DesktopAppButton>
				</form>
				{isLoading && favorites.length === 0 ? (
					<DashboardFavoritesLoadingState />
				) : null}
				{error && favorites.length === 0 && !isLocalOnly ? (
					<p className={DESKTOP_TYPOGRAPHY.caption} role="alert">
						{tw('favoritesLoadError')}
					</p>
				) : null}
				{favorites.length > 1 ? (
					<p
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-dim)'
						)}
					>
						{tw(
							isLocalOnly
								? 'favoritesReorderHintLocal'
								: 'favoritesReorderHintSync'
						)}
					</p>
				) : null}
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={onDragEnd}
				>
					<SortableContext
						items={favoriteIds}
						strategy={verticalListSortingStrategy}
					>
						<ul className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
							{favorites.map((item) => (
								<SortableFavoriteRow
									key={item.id}
									item={item}
									disabled={isMutating}
									onRemove={removeFavorite}
									dragHandleLabel={tw('favoritesDragHandleAria')}
									removeLabel={tw('favoritesRemove')}
								/>
							))}
						</ul>
					</SortableContext>
				</DndContext>
				{favorites.length === 0 && !isLoading ? (
					<p
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-dim)'
						)}
					>
						{tw('favoritesEmpty')}
					</p>
				) : null}
			</DesktopAppSurface>
		</DesktopAppContentWrapper>
	);
}
