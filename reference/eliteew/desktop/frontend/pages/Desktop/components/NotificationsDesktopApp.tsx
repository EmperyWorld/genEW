/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Full desktop window shell for the Notification Center app (NotificationsApp).
 *
 * Invariants:
 * - Delegates list/settings UI to NotificationHubBody with density="window".
 * - Escape closes the window when filters are idle (`onRequestClose` from window chrome).
 * - Guided tour open suspends hub window-close Escape until the tour closes.
 *
 * Related:
 * - NotificationHubBody.tsx, notificationHubLayoutTokens.ts
 * - documentation/product/desktop/DESKTOP-NOTIFICATIONS-APP.md
 */

import { guideTourLabelsFromI18n } from '@/components/guided-tour/guideTourLabelsFromI18n';
import { SpotlightGuideModal } from '@/components/guided-tour/SpotlightGuideModal';
import { useBuiltGuideSteps } from '@/components/guided-tour/useBuiltGuideSteps';
import { MOBILE_EMBEDDED_APP_ROOT_CLASS } from '@/components/mobileEmbedded/mobileEmbeddedLayoutTokens';
import { useNotifications } from '@/notifications';
import { useDesktopGuideTourOpener } from '@/pages/Desktop/hooks/useDesktopGuideTourOpener';
import { isMobileNotificationsEmbeddedRoute } from '@/utils/mobileEmbeddedSpaRoute';
import { cn } from '@/utils/cn';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DesktopProductWorkspace } from './DesktopAppChrome';
import { NotificationHubBody } from './NotificationHubBody';
import { NH_WINDOW_APP_SHELL_CLASS } from './notificationHub/notificationHubLayoutTokens';
import {
	NOTIFICATIONS_GUIDE_AUDIO_LS_KEY,
	NOTIFICATIONS_GUIDE_ROOT_ID,
	NOTIFICATIONS_GUIDE_STEP_DEFS,
	NOTIFICATIONS_GUIDE_TOUR_FOLDER,
} from './notificationsGuideConstants';

export type NotificationsDesktopAppProps = {
	/** MobileAndroid embedded WebView — compact shell, native toolbar owns title. */
	embeddedMobile?: boolean;
	/** Desktop window close from title bar / Escape when hub filters are idle. */
	onRequestClose?: () => void;
};

export default function NotificationsDesktopApp({
	embeddedMobile,
	onRequestClose,
}: NotificationsDesktopAppProps = {}) {
	const embeddedMobileLayout =
		embeddedMobile ?? isMobileNotificationsEmbeddedRoute();
	const { t } = useTranslation('desktopUi', { keyPrefix: 'notificationHub' });
	const guideLabels = useMemo(() => guideTourLabelsFromI18n(t, 'guide'), [t]);
	const guideSteps = useBuiltGuideSteps(
		t,
		'guide.steps',
		NOTIFICATIONS_GUIDE_STEP_DEFS
	);
	const [guideOpen, setGuideOpen] = useState(false);
	const openGuideTour = useCallback(() => setGuideOpen(true), []);
	useDesktopGuideTourOpener(openGuideTour, { enabled: !embeddedMobileLayout });
	const {
		notifications,
		markAsRead,
		markAllAsRead,
		markAsReadByType,
		markAsReadBySource,
		dismiss,
		clearAll,
	} = useNotifications();

	return (
		<main
			id={NOTIFICATIONS_GUIDE_ROOT_ID}
			data-notifications-hub-root={embeddedMobileLayout ? '1' : undefined}
			data-embedded-mobile={embeddedMobileLayout ? '1' : undefined}
			className={cn(
				`${NH_WINDOW_APP_SHELL_CLASS} relative`,
				embeddedMobileLayout && MOBILE_EMBEDDED_APP_ROOT_CLASS
			)}
			aria-label={t('title')}
		>
			{embeddedMobileLayout ? <h1 className="sr-only">{t('title')}</h1> : null}
			<DesktopProductWorkspace
				data-testid="notifications-product-workspace"
				className="min-h-0 flex-1"
				contentClassName="overflow-hidden !overflow-y-hidden flex min-h-0 flex-col"
			>
				<NotificationHubBody
					density="window"
					embeddedMobileLayout={embeddedMobileLayout}
					notifications={notifications}
					onMarkAsRead={markAsRead}
					onMarkAllAsRead={markAllAsRead}
					onMarkGroupAsRead={markAsReadByType}
					onMarkGroupAsReadBySource={markAsReadBySource}
					onDismiss={dismiss}
					onClearAll={clearAll}
					onRequestClose={guideOpen ? undefined : onRequestClose}
				/>
			</DesktopProductWorkspace>
			{!embeddedMobileLayout ? (
				<SpotlightGuideModal
					open={guideOpen}
					onClose={() => setGuideOpen(false)}
					rootId={NOTIFICATIONS_GUIDE_ROOT_ID}
					steps={guideSteps}
					audioLocalStorageKey={NOTIFICATIONS_GUIDE_AUDIO_LS_KEY}
					tourAudioFolder={NOTIFICATIONS_GUIDE_TOUR_FOLDER}
					labels={guideLabels}
					dialogTitleId="notifications-guide-title"
				/>
			) : null}
		</main>
	);
}
