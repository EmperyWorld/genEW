/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Inline banner when shell_state PATCH failed.
 *
 * Invariants:
 * - Renders nothing when `error` is empty.
 *
 * Related:
 * - `DesktopSettingsShellTab.tsx`, `desktopSettingsSharedUi.tsx`
 */

import { ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { SettingsInlineAlert } from '../desktopSettingsSharedUi';

export function DesktopSettingsExpansionSaveErrorBanner({
	error,
	prefix,
}: {
	error: string | null | undefined;
	prefix?: string;
}) {
	const detail = error?.trim();
	if (!detail) return null;
	const message = prefix ? `${prefix} — ${detail}` : detail;
	return (
		<SettingsInlineAlert
			tone="error"
			icon={<ExclamationCircleIcon className="size-4" aria-hidden />}
			data-testid="desktop-settings-shell-patch-error"
			role="alert"
		>
			{message}
		</SettingsInlineAlert>
	);
}
