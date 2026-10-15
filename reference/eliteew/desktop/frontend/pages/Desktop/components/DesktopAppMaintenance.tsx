/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Единый technical state для приложений Безраздельного мира, временно отключённых через каталог.
 *
 * Invariants:
 * - Экран не должен раскрывать внутренние причины, если каталог передал только публичный maintenance payload.
 * - Окно остаётся внутри desktop shell и не перехватывает состояние других приложений.
 *
 * Related:
 * - `pages/Desktop/components/AppStoreCatalogCard.tsx`
 * - `components/ui/EliteTechnicalState.tsx`
 */

import * as React from 'react';
import { WrenchIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { EliteTechnicalState } from '@/components/ui/EliteTechnicalState';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import type { WindowInitialPayload } from '../types/desktop.types';

export type DesktopAppMaintenancePayload = {
	maintenanceAppName?: string;
	maintenanceAppId?: string;
	maintenance_title?: string | null;
	maintenance_reason?: string | null;
	maintenance_expected_outcome?: string | null;
	maintenance_eta_note?: string | null;
};

function pickPayload(
	p: WindowInitialPayload | undefined
): DesktopAppMaintenancePayload {
	if (!p) {
		return {};
	}
	return {
		maintenanceAppName: p.maintenanceAppName,
		maintenanceAppId: p.maintenanceAppId,
		maintenance_title: p.maintenance_title,
		maintenance_reason: p.maintenance_reason,
		maintenance_expected_outcome: p.maintenance_expected_outcome,
		maintenance_eta_note: p.maintenance_eta_note,
	};
}

export function DesktopAppMaintenance({
	initialPayload,
}: {
	initialPayload?: WindowInitialPayload;
}): React.ReactElement {
	const { t } = useTranslation('desktopUi', { keyPrefix: 'appMaintenance' });
	const {
		maintenanceAppName,
		maintenance_title,
		maintenance_reason,
		maintenance_expected_outcome,
		maintenance_eta_note,
	} = pickPayload(initialPayload);

	const appName = maintenanceAppName?.trim() || t('defaultAppName');
	const title =
		maintenance_title?.trim() || t('defaultTitle', { name: appName });

	return (
		<div className="h-full min-h-0 overflow-auto bg-transparent">
			<EliteTechnicalState
				className="min-h-full"
				cardClassName="max-w-lg"
				fullScreen={false}
				eyebrow={t('eyebrow')}
				title={title}
				icon={
					<div className="flex size-16 items-center justify-center rounded-3xl border border-white/14 bg-white/8">
						<WrenchIcon
							className="h-9 w-9 text-lime-100"
							strokeWidth={DESKTOP_LUCIDE.stroke}
							aria-hidden
						/>
					</div>
				}
				description={
					<div
						className={`${DESKTOP_TYPOGRAPHY.bodyMuted} space-y-3 text-left text-slate-200/80`}
					>
						{maintenance_reason?.trim() ? (
							<p>
								<span className="font-medium text-lime-100">
									{t('reasonLabel')}{' '}
								</span>
								{maintenance_reason.trim()}
							</p>
						) : null}
						{maintenance_expected_outcome?.trim() ? (
							<p>
								<span className="font-medium text-lime-100">
									{t('expectedOutcomeLabel')}{' '}
								</span>
								{maintenance_expected_outcome.trim()}
							</p>
						) : null}
						{maintenance_eta_note?.trim() ? (
							<p>
								<span className="font-medium text-lime-100">
									{t('etaLabel')}{' '}
								</span>
								{maintenance_eta_note.trim()}
							</p>
						) : null}
						{!maintenance_reason?.trim() &&
						!maintenance_expected_outcome?.trim() &&
						!maintenance_eta_note?.trim() ? (
							<p>{t('fallbackBody')}</p>
						) : null}
					</div>
				}
				footnote={t('footnote')}
				tone="acid"
			/>
		</div>
	);
}
