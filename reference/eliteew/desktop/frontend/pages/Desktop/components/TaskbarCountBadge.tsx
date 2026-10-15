/**
 * Бейдж счётчика на кнопках таскбара (закреплённые, окна, GAF, трей).
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';

export type TaskbarCountBadgeVariant = 'default' | 'friends' | 'chat';

export type TaskbarCountBadgeProps = {
	count: number;
	variant?: TaskbarCountBadgeVariant;
	positionClassName?: string;
	/** GAF chat: пульс, пока запрос непрочитанных в полёте */
	fetchPulse?: boolean;
};

export function TaskbarCountBadge({
	count,
	variant = 'default',
	positionClassName = '-top-1 -right-1',
	fetchPulse = false,
}: TaskbarCountBadgeProps): ReactNode {
	const { t } = useTranslation('desktopUi');
	const chatFetchingDot = variant === 'chat' && fetchPulse && count <= 0;
	if (count <= 0 && !chatFetchingDot) {
		return null;
	}

	return (
		<span className={`pointer-events-none absolute ${positionClassName}`}>
			{variant !== 'default' ? (
				<span
					aria-hidden
					className={`absolute inset-0 rounded-full blur-[1px] ${
						variant === 'friends' ? 'bg-fuchsia-400/35' : 'bg-rose-400/35'
					}`}
				/>
			) : null}
			{!chatFetchingDot && count > 0 ? (
				<span className="sr-only">{t('taskbar.badgeCount', { count })}</span>
			) : null}
			<span
				className={`relative flex items-center justify-center rounded-full font-semibold text-white ${
					chatFetchingDot
						? 'min-w-[10px] h-[10px] border border-rose-200/60 bg-linear-to-br from-rose-500 via-red-500 to-orange-500 shadow-[0_0_14px_rgba(244,63,94,0.4)]'
						: `min-w-[14px] h-[14px] px-0.5 ${DESKTOP_TYPOGRAPHY.badgeCompact} ${
								variant === 'friends'
									? 'border border-fuchsia-200/70 bg-linear-to-br from-fuchsia-500 via-rose-500 to-orange-400 shadow-[0_0_18px_rgba(236,72,153,0.48)]'
									: variant === 'chat'
										? `border border-rose-200/60 bg-linear-to-br from-rose-500 via-red-500 to-orange-500 shadow-[0_0_18px_rgba(244,63,94,0.45)]${fetchPulse ? ' ring-2 ring-rose-300/55' : ''}`
										: 'bg-red-500 shadow-lg'
							}`
				}`}
			>
				{chatFetchingDot ? null : count > 99 ? '99+' : count}
			</span>
		</span>
	);
}
