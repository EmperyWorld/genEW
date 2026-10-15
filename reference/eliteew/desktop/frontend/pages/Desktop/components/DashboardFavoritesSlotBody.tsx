/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Compact dashboard favorites slot body for `DesktopWidgetsPanel`.
 *
 * Invariants:
 * - Uses `useDashboardFavorites`; marks local-only fallback with data attribute.
 *
 * Related:
 * - `pages/Desktop/hooks/useDashboardFavorites.ts`
 */

import { cn } from '@/utils/cn';
import { TrashIcon } from '@heroicons/react/24/outline';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DESKTOP_TYPOGRAPHY } from '../constants';
import {
	openDashboardFavoriteUrl,
	useDashboardFavorites,
} from '../hooks/useDashboardFavorites';
import { DesktopAppButton, DesktopAppSkeleton } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

function DashboardFavoritesLoadingState({ compact }: { compact: boolean }) {
	const { t } = useTranslation('desktopUi');
	const rowCount = compact ? 2 : 3;

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
				{t('settingsPanel.widgetsPanel.favoritesLoading')}
			</p>
			<div className="space-y-1" aria-hidden>
				{['a', 'b', 'c'].slice(0, rowCount).map((key) => (
					<DesktopAppSkeleton key={key} className="h-8" />
				))}
			</div>
		</div>
	);
}

export function DashboardFavoritesSlotBody({ compact }: { compact: boolean }) {
	const { t } = useTranslation('desktopUi');
	const { t: tWorkspace } = useTranslation('desktopUi', {
		keyPrefix: 'workspace',
	});
	const {
		favorites,
		isLoading,
		isLocalOnly,
		storageWriteFailed,
		error,
		addFavorite,
		removeFavorite,
		isMutating,
	} = useDashboardFavorites();
	const [draftTitle, setDraftTitle] = useState('');
	const [draftUrl, setDraftUrl] = useState('');
	const [showForm, setShowForm] = useState(false);

	const onSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const title = draftTitle.trim();
			if (!title) return;
			addFavorite({ title, url: draftUrl.trim() || '#' });
			setDraftTitle('');
			setDraftUrl('');
			setShowForm(false);
		},
		[addFavorite, draftTitle, draftUrl]
	);

	if (isLoading && favorites.length === 0) {
		return <DashboardFavoritesLoadingState compact={compact} />;
	}

	if (error && favorites.length === 0 && !isLocalOnly) {
		return (
			<p
				className={cn(DESKTOP_TYPOGRAPHY.caption, 'text-(--desktop-text-dim)')}
				role="alert"
			>
				{t('settingsPanel.widgetsPanel.favoritesLoadError')}
			</p>
		);
	}

	const maxRows = compact ? 3 : 6;

	return (
		<div
			className="flex flex-col gap-2"
			data-local-only={isLocalOnly ? 'true' : undefined}
		>
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
			{favorites.length === 0 ? (
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'text-(--desktop-text-dim)'
					)}
				>
					{t('settingsPanel.widgetsPanel.favoritesEmpty')}
				</p>
			) : compact ? (
				<p className={DESKTOP_TYPOGRAPHY.caption}>
					{t('settingsPanel.widgetsPanel.favoritesSummary', {
						count: favorites.length,
						preview: favorites[0]?.title ?? '',
					})}
				</p>
			) : null}
			{favorites.length > 0 ? (
				<ul className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
					{favorites.slice(0, maxRows).map((item) => (
						<li
							key={item.id}
							className="flex items-center gap-1 rounded-md border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1"
						>
							<button
								type="button"
								onClick={() => openDashboardFavoriteUrl(item.url)}
								className={cn(
									DESKTOP_TYPOGRAPHY.caption,
									'min-w-0 flex-1 truncate text-left text-(--desktop-text-secondary) hover:text-(--desktop-text-primary)',
									'focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
								)}
							>
								<span aria-hidden className="mr-1">
									{item.icon}
								</span>
								{item.title}
							</button>
							<DesktopChromeTooltip
								content={t('settingsPanel.widgetsPanel.favoritesRemove')}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="icon"
									className="h-7 w-7 shrink-0"
									disabled={isMutating}
									onClick={() => removeFavorite(item.id)}
									aria-label={t('settingsPanel.widgetsPanel.favoritesRemove')}
								>
									<TrashIcon className="size-3.5" strokeWidth={2} aria-hidden />
								</DesktopAppButton>
							</DesktopChromeTooltip>
						</li>
					))}
				</ul>
			) : null}
			{showForm ? (
				<form className="flex flex-col gap-1.5" onSubmit={onSubmit}>
					<input
						type="text"
						value={draftTitle}
						onChange={(e) => setDraftTitle(e.target.value)}
						placeholder={t(
							'settingsPanel.widgetsPanel.favoritesTitlePlaceholder'
						)}
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'rounded-md border border-(--desktop-border-subtle) bg-transparent px-2 py-1 text-(--desktop-text-primary) placeholder:text-(--desktop-text-muted) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
						)}
					/>
					<input
						type="text"
						value={draftUrl}
						onChange={(e) => setDraftUrl(e.target.value)}
						placeholder={t(
							'settingsPanel.widgetsPanel.favoritesUrlPlaceholder'
						)}
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'rounded-md border border-(--desktop-border-subtle) bg-transparent px-2 py-1 text-(--desktop-text-primary) placeholder:text-(--desktop-text-muted) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
						)}
					/>
					<div className="flex gap-1.5">
						<DesktopAppButton type="submit" size="sm" disabled={isMutating}>
							{t('settingsPanel.widgetsPanel.favoritesAdd')}
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setShowForm(false)}
						>
							{t('settingsPanel.widgetsPanel.favoritesCancel')}
						</DesktopAppButton>
					</div>
				</form>
			) : (
				<DesktopAppButton
					type="button"
					size="sm"
					variant="neutral"
					disabled={isMutating}
					onClick={() => setShowForm(true)}
				>
					{t('settingsPanel.widgetsPanel.favoritesAdd')}
				</DesktopAppButton>
			)}
		</div>
	);
}
