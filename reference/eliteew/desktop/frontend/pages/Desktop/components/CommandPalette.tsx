/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * ⌘K command palette (cmdk): system/power actions without duplicating app catalog.
 *
 * Invariants:
 * - Hotkey Ctrl/Cmd+K; closes on Esc or repeat toggle.
 * - Palette kbd badges mirror `shortcuts.*.keys` i18n (platform-aware via `getCommandPaletteShortcutLabel`).
 * - Info rows (`calendar`, `time`) are read-only: Enter does not close the palette.
 * - Home/End jump to first/last visible cmdk item while palette is open.
 * - ArrowDown/ArrowUp from search input focus first/last visible cmdk item.
 * - Escape clears search first, then closes palette (`ModalAdvanced` search escape props).
 *
 * Related:
 * - utils/desktopShellKeyboardCapture.ts
 * - components/ui/ModalAdvanced.tsx
 * - DesktopChromeTooltip.tsx, QuickSearch.tsx
 */

import { ModalAdvanced } from '@/components/ui/ModalAdvanced';
import { cn } from '@/utils/cn';
import {
	DESKTOP_CMDK_INJECTED,
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
} from '../constants';
import { Command } from 'cmdk';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopIconStyle, DesktopWindowStyle } from '@/types/profile';
import type { DesktopItem } from '../types/desktop.types';
import {
	getDesktopShellHeaderStripClassName,
	getDesktopShellPanelClassName,
} from '../utils/desktopVisualSystem';
import { telemetryCommandPaletteOpen } from '../utils/desktopTelemetry';
import {
	formatShortcutKeysForPlatform,
	getCommandPaletteShortcutLabel,
} from '../hooks/useKeyboardShortcuts';
import { DesktopAppButton } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { DesktopAppBadge } from '../utils/desktopVisualSystem';
import {
	ArrowLeftIcon,
	ArrowPathIcon,
	ArrowRightIcon,
	ArrowsPointingOutIcon,
	BellIcon,
	CalendarIcon,
	ClipboardIcon,
	ClockIcon,
	Cog6ToothIcon,
	ComputerDesktopIcon,
	FolderIcon,
	FolderOpenIcon,
	MagnifyingGlassIcon,
	MicrophoneIcon,
	PhotoIcon,
	PlusIcon,
	Squares2X2Icon,
	SwatchIcon,
	UserIcon,
	MinusIcon,
	MinusSmallIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';

interface CommandPaletteProps {
	isOpen: boolean;
	onClose: () => void;
	items: DesktopItem[];
	onOpenItem: (item: DesktopItem) => void;
	onAction?: (action: string) => void;
	shellWindowStyle?: DesktopWindowStyle;
	iconStyle: DesktopIconStyle;
}

type CommandPaletteGroupKind =
	| 'apps'
	| 'actions'
	| 'system'
	| 'virtualDesktops'
	| 'tools'
	| 'info';

interface CommandItem {
	id: string;
	name: string;
	description?: string;
	/** Secondary line for read-only info rows (e.g. calendar honesty hint). */
	infoHint?: string;
	/** Extra cmdk filter tokens not shown in the row title. */
	searchExtra?: string;
	icon: React.ReactNode;
	shortcut?: string;
	action: () => void;
	groupKind: CommandPaletteGroupKind;
	/** Read-only info row — selectable for reading, does not run shell actions. */
	isInfo?: boolean;
}

// Стили cmdk — только токены темы рабочего стола (светлая / тёмная)
const commandStyles = `
  [cmdk-root] {
    max-width: 640px;
    width: 100%;
    background: transparent;
    border-radius: 0;
    overflow: hidden;
    border: none;
    box-shadow: none;
  }

  [cmdk-input] {
    width: 100%;
    padding: 16px 20px;
    font-size: ${DESKTOP_CMDK_INJECTED.fontSizeInput};
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--desktop-border-subtle);
    color: var(--desktop-text-primary);
    outline: none;
  }

  [cmdk-input]::placeholder {
    color: var(--desktop-text-muted);
  }

  [cmdk-list] {
    max-height: 400px;
    overflow-y: auto;
    padding: 8px;
  }

  [cmdk-empty] {
    padding: 32px;
    text-align: center;
    color: var(--desktop-text-muted);
    font-size: ${DESKTOP_CMDK_INJECTED.fontSizeEmpty};
  }

  [cmdk-group-heading] {
    padding: 8px 12px;
    font-size: ${DESKTOP_CMDK_INJECTED.fontSizeGroupHeading};
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--desktop-text-dim);
  }

  [cmdk-item] {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--desktop-text-secondary);
    font-size: ${DESKTOP_CMDK_INJECTED.fontSizeItem};
    transition: background 0.1s;
  }

  [cmdk-item][data-selected="true"] {
    background: rgb(var(--desktop-accent-rgb) / 0.2);
    color: var(--desktop-text-primary);
  }

  [cmdk-item]:hover {
    background: var(--desktop-surface-soft-hover);
  }

  [cmdk-item] svg {
    width: 18px;
    height: 18px;
    color: var(--desktop-text-muted);
  }

  [cmdk-item][data-selected="true"] svg {
    color: rgb(var(--desktop-accent-rgb));
  }

  [cmdk-item]:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px rgb(var(--desktop-accent-rgb) / 0.45);
  }

  [cmdk-item][data-info-row="true"] {
    cursor: default;
  }

  [cmdk-item][data-info-row="true"]:hover {
    background: var(--desktop-surface-soft);
  }

  @media (prefers-reduced-motion: reduce) {
    [cmdk-item] {
      transition: none;
    }
  }

  [cmdk-separator] {
    height: 1px;
    background: var(--desktop-border-subtle);
    margin: 4px 0;
  }
`;

export const CommandPalette: React.FC<CommandPaletteProps> = ({
	isOpen,
	onClose,
	items,
	onOpenItem,
	onAction,
	shellWindowStyle = 'glass',
	iconStyle,
}) => {
	const { t, i18n } = useTranslation('desktopUi');
	const [search, setSearch] = useState('');
	const previouslyFocusedRef = useRef<HTMLElement | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const togglePaletteShortcutLabel = useMemo(
		() =>
			formatShortcutKeysForPlatform(t('shortcuts.shell.commandPalette.keys')),
		[t]
	);
	const paletteShortcut = useCallback(
		(commandId: string) => getCommandPaletteShortcutLabel(t, commandId),
		[t]
	);

	// Save focus when opening; close handler that restores focus
	const handleClose = useCallback(() => {
		onClose();
		setTimeout(() => {
			previouslyFocusedRef.current?.focus?.();
			previouslyFocusedRef.current = null;
		}, 0);
	}, [onClose]);

	useEffect(() => {
		if (isOpen) {
			previouslyFocusedRef.current =
				document.activeElement as HTMLElement | null;
			telemetryCommandPaletteOpen();
			const focusTimer = window.setTimeout(() => {
				const first =
					containerRef.current?.querySelector<HTMLInputElement>('input');
				first?.focus();
			}, 50);
			return () => window.clearTimeout(focusTimer);
		}
	}, [isOpen]);

	// Focus trap: Tab / Shift+Tab cycle inside palette; Home/End jump cmdk list;
	// ArrowDown/ArrowUp from search input move into the visible cmdk list.
	const handleContainerKeyDown = useCallback((e: React.KeyboardEvent) => {
		const el = containerRef.current;
		if (!el) return;

		const visibleItems = Array.from(
			el.querySelectorAll<HTMLElement>('[cmdk-item]')
		).filter((node) => node.offsetParent !== null);

		if (e.key === 'Home' || e.key === 'End') {
			if (visibleItems.length === 0) return;
			e.preventDefault();
			const target =
				e.key === 'Home'
					? visibleItems[0]
					: visibleItems[visibleItems.length - 1];
			target?.scrollIntoView({ block: 'nearest' });
			target?.focus();
			return;
		}

		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			const active = document.activeElement as HTMLElement | null;
			if (!active?.matches('[cmdk-input]')) return;
			if (visibleItems.length === 0) return;
			e.preventDefault();
			const target =
				e.key === 'ArrowDown'
					? visibleItems[0]
					: visibleItems[visibleItems.length - 1];
			target?.scrollIntoView({ block: 'nearest' });
			target?.focus();
			return;
		}

		if (e.key !== 'Tab') return;
		const focusables = el.querySelectorAll<HTMLElement>(
			'input, button, a[href], [tabindex]:not([tabindex="-1"])'
		);
		const arr = Array.from(focusables);
		if (arr.length === 0) return;
		const currentIndex = arr.indexOf(document.activeElement as HTMLElement);
		if (currentIndex === -1) return;
		if (e.shiftKey) {
			if (currentIndex === 0) {
				e.preventDefault();
				arr[arr.length - 1].focus();
			}
		} else {
			if (currentIndex === arr.length - 1) {
				e.preventDefault();
				arr[0].focus();
			}
		}
	}, []);

	// Сброс поиска при открытии
	useEffect(() => {
		if (isOpen) {
			setSearch('');
		}
	}, [isOpen]);

	// Выполнить действие и закрыть (с восстановлением фокуса)
	const runAction = useCallback(
		(action: () => void) => {
			action();
			handleClose();
		},
		[handleClose]
	);

	const cmdLine = useCallback(
		(id: string) => ({
			name: t(`commandPalette.commandDefs.${id}.name`),
			description: t(`commandPalette.commandDefs.${id}.description`),
		}),
		[t]
	);

	const appCommands: CommandItem[] = useMemo(
		() =>
			items
				.filter((item) => item.type === 'app')
				.map((item) => ({
					id: `app-${item.id}`,
					name: t('commandPalette.openApp', { name: item.name }),
					description: item.description,
					icon: (
						<DesktopAppBadge
							appComponent={item.appComponent}
							icon={item.icon ?? undefined}
							variant="list"
							iconStyle={iconStyle}
							className="h-9 w-9 shrink-0"
						/>
					),
					action: () => onOpenItem(item),
					groupKind: 'apps',
				})),
		[iconStyle, items, onOpenItem, t]
	);

	const systemCommands: CommandItem[] = useMemo(
		() => [
			{
				id: 'new-folder',
				...cmdLine('newFolder'),
				icon: <FolderIcon />,
				shortcut: paletteShortcut('new-folder'),
				action: () => onAction?.('create_folder'),
				groupKind: 'actions',
			},
			{
				id: 'refresh',
				...cmdLine('refresh'),
				icon: <ArrowPathIcon />,
				shortcut: paletteShortcut('refresh'),
				action: () => onAction?.('refresh'),
				groupKind: 'actions',
			},
			{
				id: 'quick-search',
				...cmdLine('quickSearch'),
				icon: <MagnifyingGlassIcon />,
				shortcut: paletteShortcut('quick-search'),
				action: () => onAction?.('quick_search'),
				groupKind: 'actions',
			},
			{
				id: 'minimize-all',
				...cmdLine('minimizeAll'),
				icon: <ComputerDesktopIcon />,
				shortcut: paletteShortcut('minimize-all'),
				action: () => onAction?.('minimize_all'),
				groupKind: 'actions',
			},
			{
				id: 'task-switcher',
				...cmdLine('taskSwitcher'),
				icon: <Squares2X2Icon />,
				shortcut: paletteShortcut('task-switcher'),
				action: () => onAction?.('task_switcher'),
				groupKind: 'actions',
			},
			{
				id: 'snap-window-left',
				...cmdLine('snapWindowLeft'),
				icon: <ArrowLeftIcon />,
				shortcut: paletteShortcut('snap-window-left'),
				action: () => onAction?.('snap_window_left'),
				groupKind: 'actions',
			},
			{
				id: 'snap-window-right',
				...cmdLine('snapWindowRight'),
				icon: <ArrowRightIcon />,
				shortcut: paletteShortcut('snap-window-right'),
				action: () => onAction?.('snap_window_right'),
				groupKind: 'actions',
			},
			{
				id: 'maximize-active-window',
				...cmdLine('maximizeActiveWindow'),
				icon: <ArrowsPointingOutIcon />,
				shortcut: paletteShortcut('maximize-active-window'),
				action: () => onAction?.('maximize_active_window'),
				groupKind: 'actions',
			},
			{
				id: 'restore-active-window',
				...cmdLine('restoreActiveWindow'),
				icon: <MinusSmallIcon />,
				shortcut: paletteShortcut('restore-active-window'),
				action: () => onAction?.('restore_active_window'),
				groupKind: 'actions',
			},
			{
				id: 'settings',
				...cmdLine('settings'),
				icon: <Cog6ToothIcon />,
				shortcut: paletteShortcut('settings'),
				action: () => onAction?.('settings'),
				groupKind: 'system',
			},
			{
				id: 'open_profile',
				...cmdLine('openProfile'),
				icon: <UserIcon />,
				shortcut: paletteShortcut('open_profile'),
				action: () => onAction?.('open_profile'),
				groupKind: 'system',
			},
			{
				id: 'open_explorer',
				...cmdLine('openExplorer'),
				icon: <FolderOpenIcon />,
				shortcut: paletteShortcut('open_explorer'),
				action: () => onAction?.('open_explorer'),
				groupKind: 'system',
			},
			{
				id: 'theme',
				...cmdLine('theme'),
				icon: <SwatchIcon />,
				shortcut: paletteShortcut('theme'),
				action: () => onAction?.('toggle_theme'),
				groupKind: 'system',
			},
			{
				id: 'wallpaper',
				...cmdLine('wallpaper'),
				icon: <PhotoIcon />,
				action: () => onAction?.('wallpaper'),
				groupKind: 'system',
			},
			{
				id: 'notifications',
				...cmdLine('notifications'),
				icon: <BellIcon />,
				shortcut: paletteShortcut('notifications'),
				action: () => onAction?.('notifications'),
				groupKind: 'system',
			},
			{
				id: 'voice',
				...cmdLine('voice'),
				icon: <MicrophoneIcon />,
				action: () => onAction?.('voice'),
				groupKind: 'system',
			},
			{
				id: 'shortcuts-help',
				...cmdLine('shortcutsHelp'),
				icon: <ComputerDesktopIcon />,
				shortcut: paletteShortcut('shortcuts-help'),
				action: () => onAction?.('shortcuts_help'),
				groupKind: 'system',
			},
			{
				id: 'clipboard',
				...cmdLine('clipboard'),
				icon: <ClipboardIcon />,
				action: () => onAction?.('clipboard'),
				groupKind: 'tools',
				shortcut: paletteShortcut('clipboard'),
			},
			{
				id: 'create_virtual_desktop',
				...cmdLine('createVirtualDesktop'),
				icon: <PlusIcon />,
				shortcut: paletteShortcut('create_virtual_desktop'),
				action: () => onAction?.('create_virtual_desktop'),
				groupKind: 'virtualDesktops',
			},
			{
				id: 'next_virtual_desktop',
				...cmdLine('nextVirtualDesktop'),
				icon: <ArrowRightIcon />,
				shortcut: paletteShortcut('next_virtual_desktop'),
				action: () => onAction?.('next_virtual_desktop'),
				groupKind: 'virtualDesktops',
			},
			{
				id: 'prev_virtual_desktop',
				...cmdLine('prevVirtualDesktop'),
				icon: <ArrowLeftIcon />,
				shortcut: paletteShortcut('prev_virtual_desktop'),
				action: () => onAction?.('prev_virtual_desktop'),
				groupKind: 'virtualDesktops',
			},
		],
		[cmdLine, onAction, paletteShortcut]
	);

	const quickActions: CommandItem[] = useMemo(() => {
		const lang = i18n.language || 'en';
		return [
			{
				id: 'time',
				name: t('commandPalette.commandDefs.time.name'),
				description: new Date().toLocaleTimeString(lang),
				infoHint: t('commandPalette.commandDefs.time.infoHint'),
				icon: <ClockIcon />,
				action: () => {},
				groupKind: 'info',
				isInfo: true,
			},
			{
				id: 'calendar',
				name: t('commandPalette.commandDefs.calendar.name'),
				description: new Date().toLocaleDateString(lang, {
					weekday: 'long',
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				}),
				infoHint: t('commandPalette.commandDefs.calendar.infoHint'),
				searchExtra: t('commandPalette.commandDefs.calendar.searchHints'),
				icon: <CalendarIcon />,
				action: () => {},
				groupKind: 'info',
				isInfo: true,
			},
		];
	}, [i18n.language, t]);

	const _allCommands = [...appCommands, ...systemCommands, ...quickActions];

	return (
		<ModalAdvanced
			isOpen={isOpen}
			onClose={handleClose}
			searchEscapeValue={search}
			onSearchEscapeClear={() => setSearch('')}
			title=""
			size="md"
			variant="desktop"
			showCloseButton={false}
			trapFocus={false}
			className={cn(
				'max-w-[640px] w-full',
				getDesktopShellPanelClassName(shellWindowStyle, 'strong')
			)}
		>
			<style>{commandStyles}</style>
			<div
				ref={containerRef}
				role="application"
				data-desktop-shell-keyboard-surface=""
				aria-label={t('commandPalette.dialogLabel')}
				tabIndex={-1}
				onKeyDown={handleContainerKeyDown}
			>
				<div
					className={cn(
						'shrink-0 px-4 py-3 sm:px-5 sm:py-3.5',
						getDesktopShellHeaderStripClassName(shellWindowStyle)
					)}
				>
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className={DESKTOP_TYPOGRAPHY.sectionOverlineStrong}>
								{t('commandPalette.roleTitle')}
							</div>
							<p
								className={cn(DESKTOP_TYPOGRAPHY.meta, 'mt-1 leading-relaxed')}
							>
								{t('commandPalette.roleDescription')}
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<span
								className={cn(
									DESKTOP_TYPOGRAPHY.sectionPill,
									'rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-panel) px-2 py-1'
								)}
								aria-hidden
							>
								{t('commandPalette.roleBadge')}
							</span>
							<DesktopChromeTooltip
								content={`Esc · ${t('commandPalette.footerHintClose')}`}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="icon"
									onClick={handleClose}
									aria-label={t('commandPalette.closeAria')}
								>
									<XMarkIcon
										className={DESKTOP_LUCIDE.lg}
										strokeWidth={DESKTOP_LUCIDE.stroke}
										aria-hidden
									/>
								</DesktopAppButton>
							</DesktopChromeTooltip>
						</div>
					</div>
				</div>
				<Command
					value={search}
					onValueChange={setSearch}
					filter={(value, search) => {
						if (value.toLowerCase().includes(search.toLowerCase())) return 1;
						return 0;
					}}
				>
					<Command.Input
						placeholder={t('commandPalette.searchPlaceholder')}
						autoFocus
					/>

					<Command.List>
						<Command.Empty>
							<div className="flex flex-col items-center gap-2">
								<MagnifyingGlassIcon className="w-8 h-8 text-(--desktop-text-dim)" />
								<span>{t('commandPalette.emptyTitle')}</span>
								<span className={cn(DESKTOP_TYPOGRAPHY.meta)}>
									{t('commandPalette.emptyHint')}
								</span>
							</div>
						</Command.Empty>

						{/* Приложения */}
						{appCommands.length > 0 && (
							<Command.Group heading={t('commandPalette.groupApps')}>
								{appCommands.map((cmd) => (
									<Command.Item
										key={cmd.id}
										value={`${cmd.name} ${cmd.description ?? ''}`}
										onSelect={() => runAction(cmd.action)}
									>
										{cmd.icon}
										<div className="flex-1">
											<div>{cmd.name}</div>
											{cmd.description && (
												<div
													className={cn(
														DESKTOP_TYPOGRAPHY.meta,
														'text-(--desktop-text-dim)'
													)}
												>
													{cmd.description}
												</div>
											)}
										</div>
										{cmd.shortcut && (
											<kbd
												className={cn(
													DESKTOP_TYPOGRAPHY.kbd,
													'px-2 py-0.5 rounded border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-muted)'
												)}
											>
												{cmd.shortcut}
											</kbd>
										)}
									</Command.Item>
								))}
							</Command.Group>
						)}

						<Command.Separator />

						{/* Действия */}
						<Command.Group heading={t('commandPalette.groupActions')}>
							{systemCommands
								.filter((c) => c.groupKind === 'actions')
								.map((cmd) => (
									<Command.Item
										key={cmd.id}
										value={`${cmd.name} ${cmd.description ?? ''}`}
										onSelect={() => runAction(cmd.action)}
									>
										{cmd.icon}
										<div className="flex-1">
											<div>{cmd.name}</div>
											{cmd.description && (
												<div
													className={cn(
														DESKTOP_TYPOGRAPHY.meta,
														'text-(--desktop-text-dim)'
													)}
												>
													{cmd.description}
												</div>
											)}
										</div>
										{cmd.shortcut && (
											<kbd
												className={cn(
													DESKTOP_TYPOGRAPHY.kbd,
													'px-2 py-0.5 rounded border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-muted)'
												)}
											>
												{cmd.shortcut}
											</kbd>
										)}
									</Command.Item>
								))}
						</Command.Group>

						<Command.Separator />

						{/* Система */}
						<Command.Group heading={t('commandPalette.groupSystem')}>
							{systemCommands
								.filter((c) => c.groupKind === 'system')
								.map((cmd) => (
									<Command.Item
										key={cmd.id}
										value={`${cmd.name} ${cmd.description ?? ''}`}
										onSelect={() => runAction(cmd.action)}
									>
										{cmd.icon}
										<div className="flex-1">
											<div>{cmd.name}</div>
											{cmd.description && (
												<div
													className={cn(
														DESKTOP_TYPOGRAPHY.meta,
														'text-(--desktop-text-dim)'
													)}
												>
													{cmd.description}
												</div>
											)}
										</div>
										{cmd.shortcut && (
											<kbd
												className={cn(
													DESKTOP_TYPOGRAPHY.kbd,
													'px-2 py-0.5 rounded border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-muted)'
												)}
											>
												{cmd.shortcut}
											</kbd>
										)}
									</Command.Item>
								))}
						</Command.Group>

						<Command.Separator />

						{/* Виртуальные столы */}
						<Command.Group heading={t('commandPalette.groupVirtualDesktops')}>
							{systemCommands
								.filter((c) => c.groupKind === 'virtualDesktops')
								.map((cmd) => (
									<Command.Item
										key={cmd.id}
										value={`${cmd.name} ${cmd.description ?? ''}`}
										onSelect={() => runAction(cmd.action)}
									>
										{cmd.icon}
										<div className="flex-1">
											<div>{cmd.name}</div>
											{cmd.description && (
												<div
													className={cn(
														DESKTOP_TYPOGRAPHY.meta,
														'text-(--desktop-text-dim)'
													)}
												>
													{cmd.description}
												</div>
											)}
										</div>
										{cmd.shortcut && (
											<kbd
												className={cn(
													DESKTOP_TYPOGRAPHY.kbd,
													'px-2 py-0.5 rounded border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-muted)'
												)}
											>
												{cmd.shortcut}
											</kbd>
										)}
									</Command.Item>
								))}
						</Command.Group>

						<Command.Separator />

						{/* Инструменты */}
						<Command.Group heading={t('commandPalette.groupTools')}>
							{systemCommands
								.filter((c) => c.groupKind === 'tools')
								.map((cmd) => (
									<Command.Item
										key={cmd.id}
										value={`${cmd.name} ${cmd.description ?? ''}`}
										onSelect={() => runAction(cmd.action)}
									>
										{cmd.icon}
										<div className="flex-1">
											<div>{cmd.name}</div>
											{cmd.description && (
												<div
													className={cn(
														DESKTOP_TYPOGRAPHY.meta,
														'text-(--desktop-text-dim)'
													)}
												>
													{cmd.description}
												</div>
											)}
										</div>
										{cmd.shortcut && (
											<kbd
												className={cn(
													DESKTOP_TYPOGRAPHY.kbd,
													'px-2 py-0.5 rounded border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-muted)'
												)}
											>
												{cmd.shortcut}
											</kbd>
										)}
									</Command.Item>
								))}
						</Command.Group>

						<Command.Separator />

						{/* Информация */}
						<Command.Group heading={t('commandPalette.groupInfo')}>
							{quickActions.map((cmd) => (
								<Command.Item
									key={cmd.id}
									value={`${cmd.name} ${cmd.searchExtra ?? ''} ${cmd.description ?? ''} ${cmd.infoHint ?? ''}`}
									data-info-row="true"
									aria-disabled
									onSelect={() => {
										/* info-only — keep palette open */
									}}
								>
									{cmd.icon}
									<div className="flex-1">
										<div>{cmd.name}</div>
										{cmd.description && (
											<div
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'text-(--desktop-text-dim)'
												)}
											>
												{cmd.description}
											</div>
										)}
										{cmd.infoHint && (
											<div
												className={cn(
													DESKTOP_TYPOGRAPHY.meta,
													'text-(--desktop-text-muted)'
												)}
											>
												{cmd.infoHint}
											</div>
										)}
									</div>
								</Command.Item>
							))}
						</Command.Group>
					</Command.List>

					{/* Footer */}
					<div
						className={cn(
							'flex items-center justify-between px-4 py-2 border-t border-(--desktop-border-subtle)',
							DESKTOP_TYPOGRAPHY.meta,
							'text-(--desktop-text-dim)'
						)}
					>
						<div className="flex items-center gap-4">
							<span className="flex items-center gap-1">
								<kbd className={DESKTOP_TYPOGRAPHY.shellKbdGlyph}>↑↓</kbd>
								{t('commandPalette.footerHintNav')}
							</span>
							<span className="flex items-center gap-1">
								<kbd className={DESKTOP_TYPOGRAPHY.shellKbdGlyph}>↵</kbd>
								{t('commandPalette.footerHintSelect')}
							</span>
							<span className="flex items-center gap-1">
								<kbd className={DESKTOP_TYPOGRAPHY.shellKbdGlyph}>Esc</kbd>
								{t('commandPalette.footerHintClose')}
							</span>
						</div>
						<span className={DESKTOP_TYPOGRAPHY.matchHighlight}>
							{togglePaletteShortcutLabel}
						</span>
					</div>
				</Command>
			</div>
		</ModalAdvanced>
	);
};

export default CommandPalette;
