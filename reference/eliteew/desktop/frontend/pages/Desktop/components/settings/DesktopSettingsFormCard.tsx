/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared form card shell for Desktop Settings Center sections (title + content).
 *
 * Invariants:
 * - No persistence badges and no card blurbs — see DESKTOP-CHROME-DECLUTTER-AND-SCROLL.md.
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`, tab modules under `settings/`
 * - documentation/product/desktop/DESKTOP-CHROME-DECLUTTER-AND-SCROLL.md
 */

import * as React from 'react';
import { cn } from '@/utils/cn';
import type { DesktopWindowStyle } from '@/types/profile';
import { DESKTOP_APP_STYLE_CONTRACT } from '../DesktopAppChrome';
import { getDesktopShellSettingsFormCardClassName } from '../../utils/desktopVisualSystem';

export function SettingsFormCard({
	title,
	children,
	windowStyle,
	id,
	titleAdornment,
}: {
	title: string;
	children: React.ReactNode;
	windowStyle: DesktopWindowStyle;
	id?: string;
	titleAdornment?: React.ReactNode;
}) {
	return (
		<div
			id={id}
			className={cn(
				getDesktopShellSettingsFormCardClassName(windowStyle),
				'p-5 space-y-5 shadow-(--desktop-shadow-soft)'
			)}
		>
			<div>
				<div className="flex flex-wrap items-center gap-2">
					<h4
						className={cn(
							'desktop-shell-display-text font-semibold',
							DESKTOP_APP_STYLE_CONTRACT.sectionLabel
						)}
					>
						{title}
					</h4>
					{titleAdornment}
				</div>
			</div>
			<div className="space-y-5">{children}</div>
		</div>
	);
}
