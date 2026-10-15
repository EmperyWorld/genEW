/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Snap zone preview overlay during window drag — halves / thirds / quarters over the work area.
 *
 * Invariants:
 * - Plain mount (no Framer); opaque fills only (no backdrop-blur) for RDP-safe paint.
 * - Geometry from {@link readDesktopWorkArea} / {@link SnapZone}.
 *
 * Related:
 * - utils/desktopSnapGeometry.ts, DesktopSnapTeachOverlay.tsx
 */

import * as React from 'react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_SURFACE, DESKTOP_Z_INDEX } from '../constants';
import type { SnapZone } from '../types/desktop.types';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';

/** i18n keys under `desktopUi` matching {@link SnapZone} (excluding null). */
export const SNAP_PREVIEW_ZONE_KEYS: Record<string, string> = {
	left: 'snapPreview.zones.left',
	right: 'snapPreview.zones.right',
	top: 'snapPreview.zones.top',
	bottom: 'snapPreview.zones.bottom',
	'left-third': 'snapPreview.zones.leftThird',
	'center-third': 'snapPreview.zones.centerThird',
	'right-third': 'snapPreview.zones.rightThird',
	'top-left': 'snapPreview.zones.topLeft',
	'top-right': 'snapPreview.zones.topRight',
	'bottom-left': 'snapPreview.zones.bottomLeft',
	'bottom-right': 'snapPreview.zones.bottomRight',
};

interface SnapPreviewProps {
	zone: SnapZone;
	/** Подсветка выбранной зоны (когда курсор у края). */
	show: boolean;
	/**
	 * Показать полную сетку и лёгкий dim на рабочей области во время перетаскивания окна
	 * (видны половины / трети / четверти до прилипания к зоне).
	 */
	pickerOpen?: boolean;
	/** Kept for API compat; blur is never applied (always opaque). */
	lowGpu?: boolean;
}

/** Зоны в долях рабочей области, абсолютно внутри контейнера превью. */
function snapPreviewZoneStyle(zone: SnapZone): React.CSSProperties {
	const base: React.CSSProperties = {
		position: 'absolute',
		pointerEvents: 'none',
		padding: 4,
		boxSizing: 'border-box',
		zIndex: 2,
	};
	switch (zone) {
		case 'left':
			return { ...base, left: 0, top: 0, width: '50%', height: '100%' };
		case 'right':
			return { ...base, right: 0, top: 0, width: '50%', height: '100%' };
		case 'top':
			return { ...base, left: 0, top: 0, width: '100%', height: '100%' };
		case 'bottom':
			return { ...base, left: 0, top: '50%', width: '100%', height: '50%' };
		case 'left-third':
			return { ...base, left: 0, top: 0, width: '33.333%', height: '100%' };
		case 'center-third':
			return {
				...base,
				left: '33.333%',
				top: 0,
				width: '33.333%',
				height: '100%',
			};
		case 'right-third':
			return { ...base, right: 0, top: 0, width: '33.333%', height: '100%' };
		case 'top-left':
			return { ...base, left: 0, top: 0, width: '50%', height: '50%' };
		case 'top-right':
			return { ...base, right: 0, top: 0, width: '50%', height: '50%' };
		case 'bottom-left':
			return { ...base, left: 0, bottom: 0, width: '50%', height: '50%' };
		case 'bottom-right':
			return { ...base, right: 0, bottom: 0, width: '50%', height: '50%' };
		default:
			return base;
	}
}

/** Линии ⅓ · ½ · ⅔ и горизонталь ½ — совпадают с разметкой зон snap. */
function SnapLayoutGridLines({
	lowGpu,
}: {
	lowGpu: boolean;
}): React.JSX.Element {
	const { t } = useTranslation('desktopUi');
	const stroke = 'rgb(var(--desktop-accent-rgb))';
	return (
		<svg
			className="pointer-events-none absolute inset-0 size-full"
			viewBox="0 0 100 100"
			preserveAspectRatio="none"
			aria-hidden
		>
			<title>{t('snapPreview.gridSvgTitle')}</title>
			<g
				opacity={lowGpu ? 0.14 : 0.2}
				fill="none"
				stroke={stroke}
				strokeWidth={0.35}
				vectorEffect="non-scaling-stroke"
			>
				<line x1="33.333" y1="0" x2="33.333" y2="100" />
				<line x1="50" y1="0" x2="50" y2="100" />
				<line x1="66.667" y1="0" x2="66.667" y2="100" />
				<line x1="0" y1="50" x2="100" y2="50" />
			</g>
		</svg>
	);
}

/** Debounce перед объявлением зоны скринридеру при дрожании курсора между границами snap. */
const SNAP_ANNOUNCE_DEBOUNCE_MS = 180;

export const SnapPreview: React.FC<SnapPreviewProps> = memo(
	({ zone, show, pickerOpen = false, lowGpu = false }) => {
		const { t } = useTranslation('desktopUi');
		const overlayVisible = pickerOpen || (show && Boolean(zone));
		const [announceText, setAnnounceText] = useState<string | null>(null);

		useEffect(() => {
			if (!show || !zone) {
				setAnnounceText(null);
				return;
			}
			const lk = SNAP_PREVIEW_ZONE_KEYS[zone];
			const text = lk ? t(lk) : String(zone ?? '');
			const tid = window.setTimeout(() => {
				setAnnounceText(text);
			}, SNAP_ANNOUNCE_DEBOUNCE_MS);
			return () => window.clearTimeout(tid);
		}, [zone, show, t]);

		if (!overlayVisible) return null;

		const wa = readDesktopWorkArea();

		const s = wa.layoutScale > 0 ? wa.layoutScale : 1;
		const overlayW = wa.width * s;
		const overlayH = wa.height * s;

		const zoneLayout = zone && show ? snapPreviewZoneStyle(zone) : null;
		const labelKey = zone ? SNAP_PREVIEW_ZONE_KEYS[zone] : null;
		const labelText =
			labelKey && zone && show ? t(labelKey) : String(zone ?? '');

		return (
			<>
				<div
					className="pointer-events-none fixed"
					aria-hidden="true"
					style={{
						left: wa.offsetLeft,
						top: wa.offsetTop,
						width: overlayW,
						height: overlayH,
						zIndex: DESKTOP_Z_INDEX.SNAP_PREVIEW,
					}}
				>
					<div className="relative size-full overflow-hidden rounded-[inherit]">
						{pickerOpen ? (
							<>
								<div
									className="absolute inset-0 z-0 bg-[rgb(var(--desktop-bg-primary-rgb))/0.22]"
									aria-hidden
								/>
								<div className="absolute inset-0 z-[1]">
									<SnapLayoutGridLines lowGpu={lowGpu} />
								</div>
								{!show || !zone ? (
									<div className="absolute bottom-3 left-0 right-0 z-[3] flex justify-center px-3">
										<span className="max-w-[min(92%,420px)] rounded-lg border border-[rgb(var(--desktop-accent-rgb))/0.35] bg-[rgb(var(--desktop-bg-primary-rgb))/0.92] px-3 py-1.5 text-center text-xs font-medium text-(--desktop-text-primary) shadow-sm">
											{t('snapPreview.dragHint')}
										</span>
									</div>
								) : null}
							</>
						) : null}

						{show && zone && zoneLayout ? (
							<div style={zoneLayout}>
								<div
									className={cn(
										`h-full w-full bg-[rgb(var(--desktop-accent-rgb))/0.22] border-2 border-[rgb(var(--desktop-accent-rgb))/0.6] ${DESKTOP_SURFACE.radius}`
									)}
									style={{ minHeight: 0 }}
								>
									<div className="absolute inset-0 flex items-center justify-center">
										<div
											className={cn(
												`px-4 py-2 bg-[rgb(var(--desktop-accent-rgb))/0.42] ${DESKTOP_SURFACE.radius}`,
												'shadow-sm'
											)}
										>
											<span className="text-sm font-semibold text-white">
												{labelText}
											</span>
										</div>
									</div>
								</div>
							</div>
						) : null}
					</div>
				</div>
				{show && zone && announceText ? (
					<span
						className="sr-only"
						role="status"
						aria-live="polite"
						aria-atomic="true"
					>
						{t('snapPreview.activeZoneAnnouncement', {
							zone: announceText,
						})}
					</span>
				) : null}
			</>
		);
	}
);

SnapPreview.displayName = 'SnapPreview';

export default SnapPreview;
