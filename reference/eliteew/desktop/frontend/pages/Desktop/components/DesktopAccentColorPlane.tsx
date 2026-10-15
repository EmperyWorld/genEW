import { cn } from '@/utils/cn';
import { useCallback, useMemo, useRef } from 'react';
import {
	hexToRgbSpaceString,
	hsvToHex,
	normalizeHex6,
	rgbToHsv,
} from '../utils/desktopAccentColor';
import { DESKTOP_TYPOGRAPHY } from '../constants';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from './DesktopAppChrome';

export interface DesktopAccentColorPlaneProps {
	valueHex: string;
	onChange: (hex: string) => void;
	className?: string;
}

/**
 * Выбор акцентного цвета: поле насыщенность/яркость + полоска оттенка (HSV).
 */
export function DesktopAccentColorPlane({
	valueHex,
	onChange,
	className,
}: DesktopAccentColorPlaneProps) {
	const hex = normalizeHex6(valueHex);
	const { h, s, v } = useMemo(() => {
		const rgb = hexToRgbSpaceString(hex)
			.split(/\s+/)
			.map((x) => Number.parseInt(x, 10));
		return rgbToHsv(rgb[0], rgb[1], rgb[2]);
	}, [hex]);

	const planeRef = useRef<HTMLDivElement>(null);
	const hueRef = useRef<HTMLDivElement>(null);

	const applySv = useCallback(
		(clientX: number, clientY: number) => {
			const el = planeRef.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();
			const sat = Math.max(
				0,
				Math.min(1, (clientX - rect.left) / Math.max(1, rect.width))
			);
			const val = Math.max(
				0,
				Math.min(1, 1 - (clientY - rect.top) / Math.max(1, rect.height))
			);
			onChange(hsvToHex(h, sat, val));
		},
		[h, onChange]
	);

	const applyHue = useCallback(
		(clientX: number) => {
			const el = hueRef.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();
			const t = Math.max(
				0,
				Math.min(1, (clientX - rect.left) / Math.max(1, rect.width))
			);
			const nh = t * 360;
			onChange(hsvToHex(nh, s, v));
		},
		[onChange, s, v]
	);

	const onPlanePointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.currentTarget.setPointerCapture(e.pointerId);
			applySv(e.clientX, e.clientY);
		},
		[applySv]
	);

	const onPlanePointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
			applySv(e.clientX, e.clientY);
		},
		[applySv]
	);

	const onHuePointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.currentTarget.setPointerCapture(e.pointerId);
			applyHue(e.clientX);
		},
		[applyHue]
	);

	const onHuePointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
			applyHue(e.clientX);
		},
		[applyHue]
	);

	const huePure = useMemo(() => hsvToHex(h, 1, 1), [h]);

	return (
		<div className={cn('space-y-2', className)}>
			<div
				ref={planeRef}
				role="presentation"
				className={cn(
					'relative h-36 w-full min-h-36 cursor-crosshair touch-none rounded-lg border border-(--desktop-border-subtle) shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] select-none',
					DESKTOP_CHROME_FOCUS_VISIBLE
				)}
				style={{
					backgroundColor: huePure,
				}}
				onPointerDown={onPlanePointerDown}
				onPointerMove={onPlanePointerMove}
			>
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background: 'linear-gradient(to right, #fff, rgba(255,255,255,0))',
					}}
				/>
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background: 'linear-gradient(to bottom, transparent, #000)',
					}}
				/>
				<div
					className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)]"
					style={{
						left: `${s * 100}%`,
						top: `${(1 - v) * 100}%`,
					}}
				/>
			</div>

			<div className="space-y-1">
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.captionInherit,
						'font-medium text-(--desktop-text-dim)'
					)}
				>
					Оттенок
				</p>
				<div
					ref={hueRef}
					className={cn(
						'relative h-3 w-full cursor-pointer touch-none rounded-full border border-(--desktop-border-subtle) select-none',
						'bg-[linear-gradient(90deg,#f00_0%,#ff0_17%,#0f0_33%,#0ff_50%,#00f_67%,#f0f_83%,#f00_100%)]',
						DESKTOP_CHROME_FOCUS_VISIBLE
					)}
					onPointerDown={onHuePointerDown}
					onPointerMove={onHuePointerMove}
				>
					<div
						className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
						style={{
							left: `${(h / 360) * 100}%`,
							backgroundColor: huePure,
						}}
					/>
				</div>
			</div>
		</div>
	);
}
