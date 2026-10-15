/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Кнопка «наверх» в прокручиваемом каталоге магазина.
 *
 * Invariants:
 * - Привязана к ref scroll-контейнера main; скрыта у верхней границы.
 *
 * Related:
 * - AppStore.tsx
 */

import { cn } from '@/utils/cn';
import {
	useCallback,
	useLayoutEffect,
	useState,
	type ReactElement,
	type RefObject,
} from 'react';
import type { TFunction } from 'i18next';
import { ArrowUpIcon } from '@heroicons/react/24/outline';
import { DesktopAppButton } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

const SCROLL_SHOW_THRESHOLD_PX = 360;

export type AppStoreScrollToTopFabProps = {
	scrollRef: RefObject<HTMLElement | null>;
	t: TFunction<'appStore'>;
	reduceMotion: boolean;
	/** When false, listener is detached (e.g. catalog loading). */
	active?: boolean;
};

export function AppStoreScrollToTopFab({
	scrollRef,
	t,
	reduceMotion,
	active = true,
}: AppStoreScrollToTopFabProps): ReactElement | null {
	const [visible, setVisible] = useState(false);

	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (!active || !el) {
			setVisible(false);
			return;
		}

		const onScroll = () => {
			setVisible(el.scrollTop > SCROLL_SHOW_THRESHOLD_PX);
		};
		onScroll();
		el.addEventListener('scroll', onScroll, { passive: true });
		return () => el.removeEventListener('scroll', onScroll);
	}, [scrollRef, active]);

	const scrollToTop = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTo({
			top: 0,
			behavior: reduceMotion ? 'auto' : 'smooth',
		});
	}, [scrollRef, reduceMotion]);

	if (!visible) {
		return null;
	}

	return (
		<div className="pointer-events-none absolute bottom-5 right-4 z-20 md:bottom-6 md:right-6">
			<DesktopChromeTooltip
				content={t('scrollToTop.label')}
				placement="left"
				offsetExtra={8}
			>
				<span className="pointer-events-auto inline-flex">
					<DesktopAppButton
						type="button"
						variant="accent"
						size="icon"
						className={cn(
							'h-11 w-11 min-h-11 min-w-11 rounded-full shadow-lg shadow-[rgb(var(--desktop-bg-primary-rgb)/0.25)] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.12)]',
							'backdrop-blur-md'
						)}
						aria-label={t('scrollToTop.aria')}
						onClick={scrollToTop}
					>
						<ArrowUpIcon className="h-5 w-5" aria-hidden />
					</DesktopAppButton>
				</span>
			</DesktopChromeTooltip>
		</div>
	);
}
