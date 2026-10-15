/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Мини-иконка приложения в таблицах админки магазина (каталог, витрина, обслуживание).
 *
 * Invariants:
 * - При отсутствии icon_url — первая буква названия на фоне surface-soft.
 *
 * Related:
 * - DesktopAppStoreAdminPage.tsx
 */

import { cn } from '@/utils/cn';
import type { ReactElement } from 'react';
import type { CatalogAppResponse } from '../services/desktopAdminApi';
import { StoreAppMediaImage, storeIconUrls } from '../utils/storeAppMedia';

export type AdminCatalogAppIconProps = {
	app: Pick<CatalogAppResponse, 'name' | 'icon_url' | 'icon_url_2x'>;
	className?: string;
	size?: 'sm' | 'md';
};

const sizeClass = {
	sm: 'h-8 w-8 text-[10px] rounded-md',
	md: 'h-9 w-9 text-xs rounded-lg',
} as const;

export function AdminCatalogAppIcon({
	app,
	className,
	size = 'md',
}: AdminCatalogAppIconProps): ReactElement {
	const icons = storeIconUrls({
		icon_url: app.icon_url,
		icon_url_2x: app.icon_url_2x,
	} as CatalogAppResponse);
	const url = icons.url;
	const shell = cn(
		'object-cover shadow-[0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)_inset] ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.08)]',
		sizeClass[size],
		className
	);
	if (url) {
		return (
			<StoreAppMediaImage
				url={url}
				url2x={icons.url2x}
				alt=""
				className={cn(shell, 'bg-(--desktop-surface-soft)')}
				loading="lazy"
			/>
		);
	}
	return (
		<span
			className={cn(
				shell,
				'flex items-center justify-center bg-[color-mix(in_srgb,var(--desktop-surface-soft)_88%,transparent)] font-bold text-(--desktop-text-primary)'
			)}
		>
			{app.name.slice(0, 1)}
		</span>
	);
}
