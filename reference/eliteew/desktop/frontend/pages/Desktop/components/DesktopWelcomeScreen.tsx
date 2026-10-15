/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * First-visit welcome onboarding as a non-blocking spotlight tour over the real desktop shell.
 *
 * Invariants:
 * - Does not hide taskbar or icons; dismissal/persist is handled by the parent callback.
 * - Finishing or skipping the tour dismisses permanently (same default as legacy checkbox).
 *
 * Related:
 * - desktopWelcomeGuideConstants.ts, useDesktopWelcomeGuideSteps.ts
 * - components/DesktopWorkspaceCanvas.tsx
 */

import { guideTourLabelsFromI18n } from '@/components/guided-tour/guideTourLabelsFromI18n';
import { SpotlightGuideModal } from '@/components/guided-tour/SpotlightGuideModal';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
	DESKTOP_WELCOME_GUIDE_AUDIO_LS_KEY,
	DESKTOP_WELCOME_GUIDE_AUDIO_STEP_IDS,
	DESKTOP_WELCOME_GUIDE_ROOT_ID,
	DESKTOP_WELCOME_GUIDE_TOUR_FOLDER,
} from './desktopWelcomeGuideConstants';
import {
	useDesktopWelcomeGuideStepResolver,
	useDesktopWelcomeGuideSteps,
} from './useDesktopWelcomeGuideSteps';

export type DesktopWelcomeCompleteOptions = {
	dismissPermanently: boolean;
};

export const DesktopWelcomeScreen: FC<{
	onComplete: (options: DesktopWelcomeCompleteOptions) => void;
}> = ({ onComplete }) => {
	const { t } = useTranslation('desktopUi', { keyPrefix: 'welcomeOnboarding' });
	const guideLabels = useMemo(() => guideTourLabelsFromI18n(t, 'guide'), [t]);
	const { resolveKey, onPrepareStep } = useDesktopWelcomeGuideStepResolver();
	const guideSteps = useDesktopWelcomeGuideSteps(t, resolveKey);

	const handleClose = useCallback(() => {
		onComplete({ dismissPermanently: true });
	}, [onComplete]);

	return (
		<SpotlightGuideModal
			open
			onClose={handleClose}
			rootId={DESKTOP_WELCOME_GUIDE_ROOT_ID}
			steps={guideSteps}
			audioLocalStorageKey={DESKTOP_WELCOME_GUIDE_AUDIO_LS_KEY}
			tourAudioFolder={DESKTOP_WELCOME_GUIDE_TOUR_FOLDER}
			audioPathForStep={(stepId) =>
				DESKTOP_WELCOME_GUIDE_AUDIO_STEP_IDS.has(stepId) ? undefined : ''
			}
			labels={guideLabels}
			onPrepareStep={onPrepareStep}
			spotlightLayoutKey={String(resolveKey)}
			dialogTitleId="desktop-welcome-guide-title"
		/>
	);
};
