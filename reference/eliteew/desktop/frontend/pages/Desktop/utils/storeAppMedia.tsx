/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Общие URL и компоненты превью/иконок для витрины магазина приложений.
 *
 * Invariants:
 * - При ошибке загрузки preview_url карточка откатывается на градиент категории.
 *
 * Related:
 * - AppStoreCatalogCard.tsx, AppStoreCard.tsx, storeCatalogGradients.ts
 */

import { cn } from '@/utils/cn';
import { memo, useState, type ReactElement } from 'react';
import type { StoreAppResponse } from '../services/desktopApi';

export function normStoreMediaUrl(
	v: string | null | undefined
): string | undefined {
	const t = v?.trim();
	return t || undefined;
}

export function storeIconUrls(app: StoreAppResponse): {
	url?: string;
	url2x?: string;
} {
	return {
		url: normStoreMediaUrl(app.icon_url),
		url2x: normStoreMediaUrl(app.icon_url_2x),
	};
}

export function storePreviewUrls(app: StoreAppResponse): {
	url?: string;
	url2x?: string;
} {
	return {
		url: normStoreMediaUrl(app.preview_url),
		url2x: normStoreMediaUrl(app.preview_url_2x),
	};
}

export function StoreAppMediaImage({
	url,
	url2x,
	alt,
	className,
	loading = 'lazy',
	sizes,
	onError,
}: {
	url: string;
	url2x?: string;
	alt: string;
	className?: string;
	loading?: 'lazy' | 'eager';
	/** Подсказка браузеру для выбора плотности из srcSet (витрина). */
	sizes?: string;
	onError?: () => void;
}): ReactElement {
	const srcSet = url2x ? `${url} 1x, ${url2x} 2x` : undefined;
	return (
		<img
			src={url}
			srcSet={srcSet}
			sizes={sizes}
			alt={alt}
			className={cn('h-full w-full object-contain', className)}
			loading={loading}
			decoding="async"
			draggable={false}
			onError={onError}
		/>
	);
}

type PreviewStripProps = {
	app: StoreAppResponse;
	gradientBarClassName: string;
};

/** Сравнение по полям, влияющим на превью (без лишних ре-рендеров при новой ссылке на тот же объект store). */
function storeCatalogPreviewStripPropsEqual(
	prev: Readonly<PreviewStripProps>,
	next: Readonly<PreviewStripProps>
): boolean {
	return (
		prev.gradientBarClassName === next.gradientBarClassName &&
		prev.app.app_id === next.app.app_id &&
		prev.app.preview_url === next.app.preview_url &&
		prev.app.preview_url_2x === next.app.preview_url_2x
	);
}

/** Верх карточки в списке: компактное превью или тонкая accent-полоска. */
function StoreCatalogCardPreviewStripComponent({
	app,
	gradientBarClassName,
}: PreviewStripProps): ReactElement {
	const [previewFailed, setPreviewFailed] = useState(false);
	const previews = storePreviewUrls(app);
	if (previews.url && !previewFailed) {
		return (
			<div className="relative h-14 w-full shrink-0 overflow-hidden sm:h-16">
				<StoreAppMediaImage
					url={previews.url}
					url2x={previews.url2x}
					alt=""
					className="h-full w-full object-cover"
					sizes="(max-width: 768px) 100vw, 33vw"
					onError={() => setPreviewFailed(true)}
				/>
				<div
					className="pointer-events-none absolute inset-0 bg-linear-to-t from-[color-mix(in_srgb,var(--desktop-surface-soft)_92%,transparent)] via-transparent to-transparent"
					aria-hidden
				/>
			</div>
		);
	}
	return (
		<div
			className={cn('h-1 w-full shrink-0', gradientBarClassName)}
			aria-hidden
		/>
	);
}

export const StoreCatalogCardPreviewStrip = memo(
	StoreCatalogCardPreviewStripComponent,
	storeCatalogPreviewStripPropsEqual
);

type HeroBackdropProps = {
	app: StoreAppResponse;
	heroGradientClassName: string;
};

function appStoreHeroBackdropPropsEqual(
	prev: Readonly<HeroBackdropProps>,
	next: Readonly<HeroBackdropProps>
): boolean {
	return (
		prev.heroGradientClassName === next.heroGradientClassName &&
		prev.app.app_id === next.app.app_id &&
		prev.app.preview_url === next.app.preview_url &&
		prev.app.preview_url_2x === next.app.preview_url_2x
	);
}

/** Шапка детали приложения: превью или градиент; при ошибке превью — градиент как без URL. */
function AppStoreDetailHeroBackdropComponent({
	app,
	heroGradientClassName,
}: HeroBackdropProps): ReactElement {
	const [previewFailed, setPreviewFailed] = useState(false);
	const previews = storePreviewUrls(app);
	if (previews.url && !previewFailed) {
		return (
			<div className="relative h-36 w-full overflow-hidden md:h-44">
				<StoreAppMediaImage
					url={previews.url}
					url2x={previews.url2x}
					alt=""
					className="h-full w-full object-cover"
					loading="eager"
					onError={() => setPreviewFailed(true)}
				/>
				<div
					className="pointer-events-none absolute inset-0 bg-linear-to-t from-(--desktop-surface-panel-strong) via-(--desktop-surface-panel-strong)/45 to-transparent"
					aria-hidden
				/>
			</div>
		);
	}
	return (
		<div
			className={cn('relative h-32 w-full md:h-40', heroGradientClassName)}
			aria-hidden
		>
			<div className="pointer-events-none absolute inset-0 bg-linear-to-t from-(--desktop-surface-panel-strong) via-(--desktop-surface-panel-strong)/55 to-transparent" />
		</div>
	);
}

export const AppStoreDetailHeroBackdrop = memo(
	AppStoreDetailHeroBackdropComponent,
	appStoreHeroBackdropPropsEqual
);
