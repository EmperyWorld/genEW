/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Live-превью карточки каталога в формах админки (icon/preview URL, название, категория).
 *
 * Invariants:
 * - Read-only; не вызывает API. При ошибке preview_url — градиент категории.
 *
 * Related:
 * - DesktopAppStoreAdminPage.tsx (CatalogForm), storeCatalogGradients.ts
 */

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { getStoreAppGradientBarClass } from './storeCatalogGradients';
import { AdminCatalogAppIcon } from './AdminCatalogAppIcon';
import { StoreAppMediaImage } from '../utils/storeAppMedia';
import {
	appStoreAdminPreviewLabelClass,
	appStoreCompactCardTitleClass,
} from '../utils/appStoreCompactCardUi';

export type AppStoreAdminCatalogCardPreviewProps = {
	name: string;
	category: string;
	description?: string | null;
	iconUrl?: string | null;
	iconUrl2x?: string | null;
	previewUrl?: string | null;
	previewUrl2x?: string | null;
	gradient?: string | null;
};

export function AppStoreAdminCatalogCardPreview({
	name,
	category,
	description,
	iconUrl,
	iconUrl2x,
	previewUrl,
	previewUrl2x,
	gradient,
}: AppStoreAdminCatalogCardPreviewProps): ReactElement {
	const { t } = useTranslation('appStore');
	const [previewFailed, setPreviewFailed] = useState(false);
	const gradientBar = getStoreAppGradientBarClass(gradient, category);
	const displayName = name.trim() || t('admin.preview.placeholderName');
	const categoryLabel = t(`categories.${category}`, { defaultValue: category });
	const preview = previewUrl?.trim();

	return (
		<aside
			className="rounded-(--desktop-radius-frame) border border-(--desktop-border-subtle)/70 border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.4)] bg-[color-mix(in_srgb,var(--desktop-surface-soft)_72%,transparent)] p-3 ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.05)]"
			aria-label={t('admin.preview.cardAria')}
		>
			<p className={appStoreAdminPreviewLabelClass}>
				{t('admin.preview.title')}
			</p>
			<div className="overflow-hidden rounded-(--desktop-radius-lg) border border-(--desktop-border-subtle)/60 bg-[color-mix(in_srgb,var(--desktop-surface-soft)_90%,transparent)] shadow-sm">
				{preview && !previewFailed ? (
					<div className="relative h-20 w-full overflow-hidden">
						<StoreAppMediaImage
							url={preview}
							url2x={previewUrl2x?.trim() || undefined}
							alt=""
							className="h-full w-full object-cover"
							onError={() => setPreviewFailed(true)}
						/>
						<div
							className="pointer-events-none absolute inset-0 bg-linear-to-t from-[color-mix(in_srgb,var(--desktop-surface-soft)_92%,transparent)] via-transparent to-transparent"
							aria-hidden
						/>
					</div>
				) : (
					<div className={cn('h-16 w-full', gradientBar)} aria-hidden />
				)}
				<div className="relative px-3 pb-3 pt-0">
					<div className="-mt-5 mb-2 flex items-end gap-2.5">
						<AdminCatalogAppIcon
							app={{
								name: displayName,
								icon_url: iconUrl,
								icon_url_2x: iconUrl2x,
							}}
							size="sm"
							className="ring-2 ring-[rgb(var(--desktop-fg-primary-rgb)/0.1)]"
						/>
						<div className="min-w-0 flex-1 pb-0.5">
							<div className={appStoreCompactCardTitleClass}>{displayName}</div>
							<p className={cn(DESKTOP_TYPOGRAPHY.meta, 'truncate')}>
								{categoryLabel}
							</p>
						</div>
					</div>
					<p
						className={cn(
							'line-clamp-2 min-h-8 flex-1 leading-snug text-(--desktop-text-secondary)',
							DESKTOP_TYPOGRAPHY.caption
						)}
					>
						{description?.trim() || t('noDescription')}
					</p>
				</div>
			</div>
			<p
				className={cn(
					'mt-2 leading-snug text-(--desktop-text-dim)',
					DESKTOP_TYPOGRAPHY.captionInherit
				)}
			>
				{t('admin.preview.hint')}
			</p>
		</aside>
	);
}
