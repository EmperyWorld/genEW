/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Start Menu shortcuts disclosure block and footer chrome (profile + quick actions).
 *
 * Invariants:
 * - Shortcuts expand/collapse state remains controlled by the Start Menu orchestrator.
 * - Command palette kbd label is platform-aware (passed in from parent).
 *
 * Related:
 * - ../StartMenu.tsx
 * - ../StartMenuMaintenanceRecoveryRow.tsx
 */

import type { TFunction } from 'i18next';
import { cn } from '@/utils/cn';
import {
	BuildingStorefrontIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	Cog6ToothIcon,
	ComputerDesktopIcon,
	PowerIcon,
	Squares2X2Icon,
	UserCircleIcon,
} from '@heroicons/react/24/outline';
import AuthStatusIndicator from '../../../../components/ui/AuthStatusIndicator';
import { SecureAvatar } from '../../../../components/profile/SecureAvatar';
import { getUserDisplayName } from '../../../../utils/userDisplayName';
import type { DesktopWindowStyle } from '../../../../types/profile';
import type { User } from '@/services';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
} from '../../constants';
import { getDesktopShellFooterStripClassName } from '../../utils/desktopVisualSystem';
import { DesktopAppButton } from '../DesktopAppChrome';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';
import { StartMenuMaintenanceRecoveryRow } from '../StartMenuMaintenanceRecoveryRow';

export const START_MENU_KBD_CLASS = cn(
	DESKTOP_TYPOGRAPHY.kbd,
	'shrink-0 px-2 py-1 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-panel)'
);

export const START_MENU_MOUSE_HINT_CLASS = cn(
	DESKTOP_TYPOGRAPHY.kbd,
	'shrink-0 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-panel) px-2 py-1'
);

type Props = {
	shellWindowStyle: DesktopWindowStyle;
	showShortcuts: boolean;
	setShowShortcuts: (show: boolean | ((current: boolean) => boolean)) => void;
	commandPaletteShortcutLabel: string;
	t: TFunction<'desktopUi'>;
	user: User | null | undefined;
	onClose: () => void;
	onOpenProfile?: () => void;
	onOpenAdmin?: () => void;
	onAppStore?: () => void;
	onWallpaper: () => void;
	onPowerOff?: () => void;
};

export function StartMenuFooterChrome({
	shellWindowStyle,
	showShortcuts,
	setShowShortcuts,
	commandPaletteShortcutLabel,
	t,
	user,
	onClose,
	onOpenProfile,
	onOpenAdmin,
	onAppStore,
	onWallpaper,
	onPowerOff,
}: Props) {
	return (
		<>
			<StartMenuMaintenanceRecoveryRow />
			<div
				className={cn(
					'relative z-1',
					getDesktopShellFooterStripClassName(shellWindowStyle)
				)}
			>
				<button
					type="button"
					onClick={() => setShowShortcuts((s) => !s)}
					className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-(--desktop-text-muted) hover:text-(--desktop-text-secondary) hover:bg-(--desktop-surface-soft) transition-colors rounded-b-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb))] focus-visible:ring-inset"
					aria-expanded={showShortcuts}
				>
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.sectionPill,
							'flex items-center gap-2 font-medium tracking-wider'
						)}
					>
						<ComputerDesktopIcon
							className={DESKTOP_LUCIDE.md}
							strokeWidth={DESKTOP_LUCIDE.stroke}
						/>
						{t('startMenu.shortcutsHeading')}
					</span>
					{showShortcuts ? (
						<ChevronDownIcon
							className={DESKTOP_LUCIDE.md}
							strokeWidth={DESKTOP_LUCIDE.stroke}
						/>
					) : (
						<ChevronUpIcon
							className={DESKTOP_LUCIDE.md}
							strokeWidth={DESKTOP_LUCIDE.stroke}
						/>
					)}
				</button>
				{showShortcuts && (
					<div
						className={cn(
							DESKTOP_TYPOGRAPHY.meta,
							'px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2'
						)}
					>
						<div className="flex items-center gap-2">
							<kbd className={START_MENU_KBD_CLASS}>
								{commandPaletteShortcutLabel}
							</kbd>
							<span>{t('startMenu.shortcutsInline.commandPalette')}</span>
						</div>
						<div className="flex items-center gap-2">
							<kbd className={START_MENU_KBD_CLASS}>Win+D</kbd>
							<span>{t('startMenu.shortcutsInline.minimizeAll')}</span>
						</div>
						<div className="flex items-center gap-2">
							<kbd className={START_MENU_KBD_CLASS}>F5</kbd>
							<span>{t('startMenu.shortcutsInline.refresh')}</span>
						</div>
						<div className="flex items-center gap-2">
							<kbd className={START_MENU_KBD_CLASS}>Ctrl+Shift+N</kbd>
							<span>{t('startMenu.shortcutsInline.newFolder')}</span>
						</div>
						<div className="flex items-center gap-2">
							<kbd className={START_MENU_KBD_CLASS}>Win+↑</kbd>
							<span>{t('startMenu.shortcutsInline.maximizeWindow')}</span>
						</div>
						<div className="flex items-center gap-2">
							<kbd className={START_MENU_KBD_CLASS}>Win+↓</kbd>
							<span>{t('startMenu.shortcutsInline.minimizeWindow')}</span>
						</div>
						<div className="flex items-center gap-2">
							<kbd className={START_MENU_KBD_CLASS}>Win+←/→</kbd>
							<span>{t('startMenu.shortcutsInline.snapWindow')}</span>
						</div>
						<div className="flex items-center gap-2">
							<kbd className={START_MENU_KBD_CLASS}>Alt+Tab</kbd>
							<span>{t('startMenu.shortcutsInline.altTab')}</span>
						</div>
						<div className="flex items-center gap-2 sm:col-span-2">
							<span className={START_MENU_MOUSE_HINT_CLASS}>
								{t('startMenu.shortcutsInline.rightClickBadge')}
							</span>
							<span>{t('startMenu.shortcutsInline.rightClickHint')}</span>
						</div>
					</div>
				)}
			</div>

			<div
				className={cn(
					'relative z-1 flex shrink-0 items-center justify-between gap-2 max-sm:gap-1.5 px-4 max-sm:px-3 py-3 max-sm:py-2',
					getDesktopShellFooterStripClassName(shellWindowStyle)
				)}
			>
				<div className="relative flex min-w-0 flex-1 items-center gap-2">
					{onOpenProfile && user ? (
						<DesktopChromeTooltip
							content={t('startMenu.accountProfileTitle')}
							placement="top"
							offsetExtra={8}
						>
							<button
								type="button"
								onClick={() => {
									onOpenProfile();
									onClose();
								}}
								className={cn(
									'flex min-w-0 max-w-[min(220px,42vw)] items-center gap-2 rounded-2xl border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--glass-bg-strong)_38%,transparent)] px-2 py-1.5 text-left transition-colors hover:bg-(--desktop-surface-soft)',
									DESKTOP_INTERACTIVE.focusRing
								)}
								aria-label={t('startMenu.accountProfileAria')}
							>
								<SecureAvatar
									useProfileApi
									className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.28)]"
									alt={t('sessionPanel.avatarAlt')}
								/>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-medium text-(--desktop-text-primary)">
										{getUserDisplayName(user)}
									</span>
									<span
										className={cn(
											DESKTOP_TYPOGRAPHY.small,
											'block truncate text-(--desktop-text-muted)'
										)}
									>
										{t('startMenu.accountProfileHint')}
									</span>
								</span>
								<UserCircleIcon
									className={cn(
										DESKTOP_LUCIDE.md,
										'shrink-0 text-(--desktop-text-muted)'
									)}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							</button>
						</DesktopChromeTooltip>
					) : null}
					<AuthStatusIndicator
						mode="nav"
						isCollapsed={false}
						panelPlacement="top"
						className="shrink-0"
						onOpenProfile={onOpenProfile}
					/>
				</div>
				<div className="flex items-center gap-0.5">
					{onOpenAdmin ? (
						<DesktopChromeTooltip
							content={t('startMenu.adminTitle')}
							placement="top"
							offsetExtra={8}
						>
							<span className="inline-flex">
								<DesktopAppButton
									type="button"
									onClick={() => {
										onOpenAdmin();
										onClose();
									}}
									variant="ghost"
									size="icon"
									className="text-(--desktop-text-muted) hover:bg-(--desktop-surface-soft) hover:text-(--desktop-text-secondary)"
									aria-label={t('startMenu.adminAria')}
								>
									<Squares2X2Icon
										className={DESKTOP_LUCIDE.lg}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								</DesktopAppButton>
							</span>
						</DesktopChromeTooltip>
					) : null}
					{onAppStore ? (
						<DesktopChromeTooltip
							content={t('startMenu.appStoreTitle')}
							placement="top"
							offsetExtra={8}
						>
							<span className="inline-flex">
								<DesktopAppButton
									type="button"
									onClick={() => {
										onAppStore();
										onClose();
									}}
									variant="ghost"
									size="icon"
									aria-label={t('startMenu.appStoreAria')}
								>
									<BuildingStorefrontIcon
										className={DESKTOP_LUCIDE.lg}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								</DesktopAppButton>
							</span>
						</DesktopChromeTooltip>
					) : null}
					<DesktopChromeTooltip
						content={t('startMenu.settingsTitle')}
						placement="top"
						offsetExtra={8}
					>
						<span className="inline-flex">
							<DesktopAppButton
								type="button"
								onClick={() => {
									onWallpaper();
									onClose();
								}}
								variant="ghost"
								size="icon"
								aria-label={t('startMenu.settingsAria')}
							>
								<Cog6ToothIcon
									className={DESKTOP_LUCIDE.lg}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							</DesktopAppButton>
						</span>
					</DesktopChromeTooltip>
					<DesktopChromeTooltip
						content={t('startMenu.signOutTitle')}
						placement="top"
						offsetExtra={8}
					>
						<span className="inline-flex">
							<DesktopAppButton
								type="button"
								onClick={() => {
									onPowerOff?.();
									onClose();
								}}
								variant="ghost"
								size="icon"
								aria-label={t('startMenu.signOutAria')}
							>
								<PowerIcon
									className={DESKTOP_LUCIDE.lg}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							</DesktopAppButton>
						</span>
					</DesktopChromeTooltip>
				</div>
			</div>
		</>
	);
}
