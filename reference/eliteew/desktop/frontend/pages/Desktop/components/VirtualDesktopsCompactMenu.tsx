/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Compact-layout overflow for virtual desktops when the strip is hidden (mobile/narrow).
 *
 * Related:
 * - DesktopWorkspaceTaskbar.tsx, VirtualDesktops.tsx
 */

import {
	ChevronUpIcon,
	ComputerDesktopIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '../constants';
import { useDesktopWindowPortalStackBase } from '../context/DesktopWindowPortalStackContext';
import {
	getDesktopPortalShellProps,
	getFloatingMenuPosition,
} from '../utils/desktopUi';
import { DesktopAppMenuItem, DesktopAppMenuSurface } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import type { VirtualDesktopsProps } from './VirtualDesktops';

type CompactVdProps = Pick<
	VirtualDesktopsProps,
	| 'desktops'
	| 'activeDesktopId'
	| 'createDesktop'
	| 'deleteDesktop'
	| 'switchToDesktop'
	| 'updateDesktopName'
>;

export function VirtualDesktopsCompactMenu({
	desktops,
	activeDesktopId,
	createDesktop,
	deleteDesktop,
	switchToDesktop,
}: CompactVdProps): React.JSX.Element {
	const { t } = useTranslation('desktopUi');
	const portalStackBase = useDesktopWindowPortalStackBase();
	const [open, setOpen] = useState(false);
	const anchorRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const activeIndex = Math.max(
		0,
		desktops.findIndex((d) => d.id === activeDesktopId)
	);

	const close = useCallback(() => setOpen(false), []);

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: MouseEvent) => {
			const target = event.target as Node;
			if (menuRef.current?.contains(target)) return;
			if (anchorRef.current?.contains(target)) return;
			close();
		};
		const onEsc = (event: KeyboardEvent) => {
			if (event.key === 'Escape') close();
		};
		window.addEventListener('mousedown', onPointer);
		window.addEventListener('keydown', onEsc);
		return () => {
			window.removeEventListener('mousedown', onPointer);
			window.removeEventListener('keydown', onEsc);
		};
	}, [open, close]);

	const menuPos =
		open && anchorRef.current
			? getFloatingMenuPosition(anchorRef.current, 'top', 8)
			: null;

	return (
		<>
			<DesktopChromeTooltip
				content={t('virtualDesktops.compactMenuTooltip')}
				placement="top"
				offsetExtra={8}
			>
				<button
					ref={anchorRef}
					type="button"
					data-testid="virtual-desktops-compact-menu"
					aria-expanded={open}
					aria-haspopup="menu"
					onClick={() => setOpen((v) => !v)}
					className="relative inline-flex size-8 items-center justify-center rounded-lg text-(--desktop-text-primary) fine-hover:bg-(--desktop-surface-soft-hover)"
				>
					<ComputerDesktopIcon
						className="size-4"
						strokeWidth={DESKTOP_LUCIDE.stroke}
						aria-hidden
					/>
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.micro,
							'absolute -right-0.5 -top-0.5 rounded-full bg-[rgb(var(--desktop-accent-rgb))] px-1 text-white'
						)}
					>
						{activeIndex + 1}
					</span>
				</button>
			</DesktopChromeTooltip>
			{open && menuPos
				? createPortal(
						<DesktopAppMenuSurface
							ref={menuRef}
							role="menu"
							{...getDesktopPortalShellProps(portalStackBase)}
							className="min-w-48 py-1"
							style={{ position: 'fixed', ...menuPos }}
						>
							<div
								className={cn(
									DESKTOP_TYPOGRAPHY.caption,
									'px-3 py-2 font-semibold uppercase tracking-wider text-(--desktop-text-muted)'
								)}
							>
								{t('virtualDesktops.compactMenuTitle')}
							</div>
							{desktops.map((desktop, index) => (
								<DesktopAppMenuItem
									key={desktop.id}
									role="menuitem"
									aria-current={
										desktop.id === activeDesktopId ? 'true' : undefined
									}
									onClick={() => {
										switchToDesktop(desktop.id);
										close();
									}}
								>
									{t('virtualDesktops.desktopTitle', { index: index + 1 })}
									{desktop.name ? ` — ${desktop.name}` : ''}
								</DesktopAppMenuItem>
							))}
							<DesktopAppMenuItem
								role="menuitem"
								onClick={() => {
									createDesktop();
									close();
								}}
							>
								<ChevronUpIcon className="size-3.5 rotate-180" aria-hidden />
								{t('virtualDesktops.ctxNewDesktop')}
							</DesktopAppMenuItem>
							{desktops.length > 1 ? (
								<DesktopAppMenuItem
									role="menuitem"
									className="text-red-300"
									onClick={() => {
										const victim = desktops.find(
											(d) => d.id !== activeDesktopId
										);
										if (victim) deleteDesktop(victim.id);
										close();
									}}
								>
									{t('virtualDesktops.deleteTitle')}
								</DesktopAppMenuItem>
							) : null}
						</DesktopAppMenuSurface>,
						document.body
					)
				: null}
		</>
	);
}
