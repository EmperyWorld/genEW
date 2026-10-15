/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * EW Family status banner row: info trigger, store balance hint, and portal popover copy.
 *
 * Invariants:
 * - Popover renders in document.body so it stays above desktop windows.
 * - Copy comes from `desktopUi.ewFamily`.
 *
 * Related:
 * - Desktop profile / Family status surfaces
 */

import { cn } from '@/utils/cn';
import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_TYPOGRAPHY,
	DESKTOP_Z_INDEX,
} from '../constants';
import { useSyncDesktopThemeFromMain } from '../hooks/useSyncDesktopThemeFromMain';

export function EwFamilyBannerMessage(): ReactElement {
	const { t } = useTranslation('desktopUi', { keyPrefix: 'ewFamily' });
	const [open, setOpen] = useState(false);
	const [popoverPos, setPopoverPos] = useState<{
		top: number;
		left: number;
	} | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const triggerId = useId();
	const popoverId = `${triggerId}-ew-family-popover`;

	useSyncDesktopThemeFromMain(Boolean(open && popoverPos), popoverRef);

	const updatePosition = useCallback(() => {
		const el = triggerRef.current;
		if (!el || !open) return;
		const r = el.getBoundingClientRect();
		const vw = window.innerWidth;
		const margin = 16;
		const panelW = Math.min(22 * 16, vw - margin * 2);
		let left = r.left;
		if (left + panelW > vw - margin) {
			left = Math.max(margin, vw - panelW - margin);
		}
		setPopoverPos({ top: r.bottom + 8, left });
	}, [open]);

	useLayoutEffect(() => {
		if (!open) {
			setPopoverPos(null);
			return;
		}
		updatePosition();
		window.addEventListener('scroll', updatePosition, true);
		window.addEventListener('resize', updatePosition);
		return () => {
			window.removeEventListener('scroll', updatePosition, true);
			window.removeEventListener('resize', updatePosition);
		};
	}, [open, updatePosition]);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			const t = e.target as Node;
			if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) {
				return;
			}
			setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open]);

	const popover =
		open && popoverPos
			? createPortal(
					<section
						ref={popoverRef}
						id={popoverId}
						aria-labelledby={triggerId}
						style={{
							position: 'fixed',
							top: popoverPos.top,
							left: popoverPos.left,
							width: 'min(22rem, calc(100vw - 2rem))',
							zIndex: DESKTOP_Z_INDEX.DESKTOP_SHELL,
						}}
						className={cn(
							'rounded-xl border border-(--desktop-border-strong) bg-[color-mix(in_srgb,var(--glass-bg-strong)_94%,var(--desktop-surface-soft)_6%)] p-4 text-left leading-relaxed text-(--desktop-text-secondary) shadow-(--desktop-shadow-panel) ring-1 ring-[color-mix(in_srgb,var(--desktop-border-strong)_55%,transparent)] backdrop-blur-xl',
							DESKTOP_TYPOGRAPHY.shellCopy13
						)}
					>
						<p className="mb-3 text-(--desktop-text-primary)">{t('infoP1')}</p>
						<p className="mb-3">
							<Trans
								i18nKey="ewFamily.infoP2"
								ns="desktopUi"
								components={{
									strong: <strong className="text-(--desktop-text-primary)" />,
								}}
							/>
						</p>
					</section>,
					document.body
				)
			: null;

	return (
		<div className="min-w-0 flex flex-col gap-0.5">
			<div className="flex flex-wrap items-start gap-x-1.5 gap-y-0">
				<span className="ew-family-shimmer-text ew-family-display-title">
					Family
				</span>
				<button
					ref={triggerRef}
					type="button"
					id={triggerId}
					aria-expanded={open}
					aria-controls={popoverId}
					onClick={() => setOpen((v) => !v)}
					className={cn(
						'-mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-full border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--glass-bg-strong)_42%,var(--desktop-surface-soft)_58%)] font-semibold italic leading-none text-(--desktop-text-primary) shadow-sm ring-1 ring-[color-mix(in_srgb,var(--desktop-border-subtle)_70%,transparent)] transition-colors hover:border-[rgb(var(--desktop-accent-rgb))]/35 hover:bg-(--desktop-surface-soft)/90',
						DESKTOP_TYPOGRAPHY.captionInherit,
						DESKTOP_INTERACTIVE.focusRing
					)}
					aria-label={t('infoAria')}
				>
					i
				</button>
			</div>
			<p
				className={cn(
					'min-w-0 leading-snug text-(--desktop-text-secondary)',
					DESKTOP_TYPOGRAPHY.captionInherit
				)}
			>
				{t('storeBalanceHint')}
			</p>
			{popover}
		</div>
	);
}
