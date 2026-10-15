/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Иконка приложения в каталоге магазина — remote URL или fallback (DesktopAppBadge / буква).
 *
 * Invariants:
 * - При ошибке загрузки remote — тот же fallback, что без URL.
 *
 * Related:
 * - storeAppMedia.tsx, AppStoreCatalogCard.tsx
 */

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';
import type { DesktopIconStyle } from '@/types/profile';
import { memo, useState, type ReactElement, type ReactNode } from 'react';
import type { StoreAppResponse } from '../services/desktopApi';
import { DesktopAppBadge } from '../utils/desktopVisualSystem';
import { storeIconUrls, StoreAppMediaImage } from '../utils/storeAppMedia';

export type AppStoreCatalogBadgeProps = {
	app: StoreAppResponse;
	/** Иконка из локального реестра (`DEFAULT_APPS`), если нет — первая буква названия */
	defaultIcon?: ReactNode;
	iconStyle: DesktopIconStyle;
	className?: string;
};

function catalogBadgePropsEqual(
	prev: Readonly<AppStoreCatalogBadgeProps>,
	next: Readonly<AppStoreCatalogBadgeProps>
): boolean {
	return (
		prev.className === next.className &&
		prev.iconStyle === next.iconStyle &&
		prev.defaultIcon === next.defaultIcon &&
		prev.app.app_id === next.app.app_id &&
		prev.app.app_component === next.app.app_component &&
		prev.app.name === next.app.name &&
		prev.app.icon_url === next.app.icon_url &&
		prev.app.icon_url_2x === next.app.icon_url_2x
	);
}

function AppStoreCatalogBadgeInner({
	app,
	defaultIcon,
	iconStyle,
	className,
}: AppStoreCatalogBadgeProps): ReactElement {
	const [remoteFailed, setRemoteFailed] = useState(false);
	const icons = storeIconUrls(app);
	const useRemote = Boolean(icons.url) && !remoteFailed;
	const fallback = defaultIcon ?? (
		<span
			className={cn(
				DESKTOP_TYPOGRAPHY.subtitle,
				'font-bold text-(--desktop-text-primary)'
			)}
		>
			{app.name.slice(0, 1)}
		</span>
	);

	return (
		<DesktopAppBadge
			appComponent={useRemote ? undefined : app.app_component || undefined}
			icon={
				useRemote && icons.url ? (
					<StoreAppMediaImage
						url={icons.url}
						url2x={icons.url2x}
						alt=""
						onError={() => setRemoteFailed(true)}
					/>
				) : (
					fallback
				)
			}
			variant="start"
			className={className}
			iconStyle={iconStyle}
		/>
	);
}

export const AppStoreCatalogBadge = memo(
	AppStoreCatalogBadgeInner,
	catalogBadgePropsEqual
);
AppStoreCatalogBadge.displayName = 'AppStoreCatalogBadge';
