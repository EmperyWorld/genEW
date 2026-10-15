/**
 * Пример регистрации слота (только dev-сборка). В проде модуль не подключается.
 */

import { cn } from '@/utils/cn';

import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { registerNotificationHubExtension } from './notificationHubExtensionRegistry';
import { PuzzlePieceIcon } from '@heroicons/react/24/outline';

if (import.meta.env.DEV) {
	registerNotificationHubExtension({
		id: 'dev:notification-hub-extension-sample',
		slot: 'hubSettingsAfter',
		order: 9999,
		render: (ctx) => (
			<div
				className={cn(
					'mt-3 rounded-(--desktop-radius-lg) border border-dashed border-(--desktop-border-subtle)',
					'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_92%,rgb(var(--desktop-accent-rgb))_8%)] p-3'
				)}
			>
				<div className="flex items-start gap-2">
					<PuzzlePieceIcon
						className={cn(
							DESKTOP_LUCIDE.md,
							'mt-0.5 shrink-0 text-[rgb(var(--desktop-accent-rgb)/0.85)]'
						)}
						strokeWidth={DESKTOP_LUCIDE.stroke}
						aria-hidden
					/>
					<div className="min-w-0 space-y-1">
						<p
							className={cn(
								'font-medium text-(--desktop-text-primary)',
								DESKTOP_TYPOGRAPHY.small
							)}
						>
							Notification hub extension (dev)
						</p>
						<p className={cn('leading-snug', DESKTOP_TYPOGRAPHY.shellMeta10)}>
							Шаблонный слот: зарегистрируйте виджеты через{' '}
							<code
								className={cn(
									'rounded bg-(--desktop-surface-soft) px-1 py-0.5 font-mono',
									DESKTOP_TYPOGRAPHY.shellMeta10
								)}
							>
								registerNotificationHubExtension
							</code>
							. Плотность:{' '}
							<span className="font-medium text-(--desktop-text-primary)">
								{ctx.density}
							</span>
							, непрочитанных: {ctx.unreadCount}.
						</p>
					</div>
				</div>
			</div>
		),
	});
}
