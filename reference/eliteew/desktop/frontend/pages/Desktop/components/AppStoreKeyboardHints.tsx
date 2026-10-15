/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Компактные подсказки горячих клавиш каталога App Store (sidebar desktop).
 *
 * Invariants:
 * - Только статический UI; без перехвата клавиатуры.
 *
 * Related:
 * - AppStore.tsx
 */

import type { ReactElement } from 'react';
import type { TFunction } from 'i18next';
import { AppStoreKbd } from './AppStoreKbd';
import {
	appStoreRailHintListClass,
	appStoreRailOverlineLabelBlockClass,
} from '../utils/appStoreCompactCardUi';

export type AppStoreKeyboardHintsProps = {
	t: TFunction<'appStore'>;
	variant: 'modal' | 'page';
};

export function AppStoreKeyboardHints({
	t,
	variant,
}: AppStoreKeyboardHintsProps): ReactElement {
	return (
		<section
			className="hidden shrink-0 border-t border-(--desktop-border-subtle)/55 px-4 py-3 lg:block"
			aria-label={t('shortcuts.aria')}
		>
			<p className={appStoreRailOverlineLabelBlockClass}>
				{t('shortcuts.title')}
			</p>
			<ul className={appStoreRailHintListClass}>
				<li className="flex items-center gap-2">
					<AppStoreKbd>/</AppStoreKbd>
					<span>{t('shortcuts.search')}</span>
				</li>
				<li className="flex items-center gap-2">
					<AppStoreKbd>Esc</AppStoreKbd>
					<span>
						{variant === 'modal'
							? t('shortcuts.closeModal')
							: t('shortcuts.clearSearch')}
					</span>
				</li>
			</ul>
		</section>
	);
}
