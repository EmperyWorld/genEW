/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Subtle first-visit banner inviting users to the desktop spotlight tour.
 *
 * Invariants:
 * - Non-blocking; does not trap focus or open modal automatically.
 *
 * Related:
 * - hooks/useDesktopWelcomeNudge.ts, Taskbar.tsx
 */

import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_INTERACTIVE, DESKTOP_TYPOGRAPHY } from '../constants';
import { DesktopAppButton } from './DesktopAppChrome';

export type DesktopWelcomeNudgeBannerProps = {
	onStartTour: () => void;
	onDismiss: () => void;
	/** Kept for caller API compat; unused (plain mount). */
	reduceMotion?: boolean | null;
};

export function DesktopWelcomeNudgeBanner({
	onStartTour,
	onDismiss,
}: DesktopWelcomeNudgeBannerProps): React.JSX.Element {
	const { t } = useTranslation('desktopUi');

	return (
		<section
			aria-label={t('welcomeOnboarding.nudge.ariaLabel')}
			className={cn(
				'pointer-events-auto mx-2 mb-2 flex max-w-md items-start gap-3 rounded-xl border border-(--desktop-border-subtle)',
				'bg-[color-mix(in_srgb,var(--desktop-surface-panel-strong)_94%,var(--desktop-menu-tint)_6%)] px-3 py-2.5 shadow-lg shadow-black/25'
			)}
			data-testid="desktop-welcome-nudge-banner"
		>
			<div className="min-w-0 flex-1">
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.small,
						'font-semibold text-(--desktop-text-primary)'
					)}
				>
					{t('welcomeOnboarding.nudge.title')}
				</p>
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'mt-0.5 text-(--desktop-text-muted)'
					)}
				>
					{t('welcomeOnboarding.nudge.body')}
				</p>
				<div className="mt-2 flex flex-wrap gap-2">
					<DesktopAppButton
						type="button"
						variant="primary"
						size="sm"
						onClick={onStartTour}
					>
						{t('welcomeOnboarding.nudge.cta')}
					</DesktopAppButton>
					<DesktopAppButton
						type="button"
						variant="ghost"
						size="sm"
						onClick={onDismiss}
					>
						{t('welcomeOnboarding.nudge.dismiss')}
					</DesktopAppButton>
				</div>
			</div>
			<button
				type="button"
				onClick={onDismiss}
				className={cn(
					'shrink-0 rounded-md p-1 text-(--desktop-text-muted) hover:text-(--desktop-text-primary)',
					DESKTOP_INTERACTIVE.focusRing
				)}
				aria-label={t('welcomeOnboarding.nudge.closeAria')}
			>
				<XMarkIcon className="size-4" aria-hidden />
			</button>
		</section>
	);
}
