/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Modal grid for choosing desktop wallpaper (built-in WebP + user uploads) with virtualized rows.
 *
 * Invariants:
 * - Grid cells use DesktopChromeTooltip with fullWidth so TooltipV2 does not collapse grid tracks.
 * - Desktop shell modals use ModalAdvanced capture Escape + keyboard surface by default.
 *
 * Related:
 * - `constants/wallpapers.ts`, `ModalAdvanced.tsx`
 */

import * as React from 'react';
import {
	memo,
	useRef,
	useCallback,
	useMemo,
	useState,
	useEffect,
	useLayoutEffect,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { ModalAdvanced } from '@/components/ui/ModalAdvanced';
import type { DesktopWindowStyle } from '@/types/profile';
import { cn } from '@/utils/cn';
import {
	DEFAULT_DESKTOP_WALLPAPER_STYLE,
	DESKTOP_TYPOGRAPHY,
	WALLPAPERS,
} from '../constants';
import {
	isDesktopWallpaperImageRef,
	isUserUploadedWallpaperStyle,
} from '../utils/desktopWallpaper';
import { getDesktopShellPanelClassName } from '../utils/desktopVisualSystem';
import {
	ArrowUpTrayIcon,
	CheckIcon,
	TrashIcon,
} from '@heroicons/react/24/outline';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

const WEBP_QUALITY = 0.88;
const GRID_COLS = 4;
/** Tailwind `gap-3` — держим в синхроне с классом `gap-3` у сетки */
const GRID_GAP_PX = 12;

/** Convert image data URL to WebP data URL. Falls back to original if conversion fails. */
function imageDataUrlToWebP(
	dataUrl: string,
	quality: number = WEBP_QUALITY
): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas');
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					resolve(dataUrl);
					return;
				}
				ctx.drawImage(img, 0, 0);
				const webp = canvas.toDataURL('image/webp', quality);
				resolve(webp || dataUrl);
			} catch {
				resolve(dataUrl);
			}
		};
		img.onerror = () => reject(new Error('Image load failed'));
		img.src = dataUrl;
	});
}

function moveGridIndex(index: number, key: string, total: number): number {
	switch (key) {
		case 'ArrowRight':
			return Math.min(total - 1, index + 1);
		case 'ArrowLeft':
			return Math.max(0, index - 1);
		case 'ArrowDown':
			return Math.min(total - 1, index + GRID_COLS);
		case 'ArrowUp':
			return Math.max(0, index - GRID_COLS);
		case 'Home':
			return 0;
		case 'End':
			return total - 1;
		default:
			return index;
	}
}

function computeRowHeightPx(innerWidth: number): number {
	const w = innerWidth > 0 ? innerWidth : 640;
	const cellW = (w - (GRID_COLS - 1) * GRID_GAP_PX) / GRID_COLS;
	const cellH = cellW * (9 / 16);
	return cellH + GRID_GAP_PX;
}

const WallpaperPreviewFill = memo(function WallpaperPreviewFill({
	fillStyle,
}: {
	fillStyle: string;
}) {
	const { t } = useTranslation('desktopUi');
	const isRasterUrl = isDesktopWallpaperImageRef(fillStyle);
	const [failed, setFailed] = useState(false);

	if (isRasterUrl && !failed) {
		return (
			<img
				src={fillStyle}
				alt=""
				loading="lazy"
				decoding="async"
				onError={() => setFailed(true)}
				className="pointer-events-none absolute inset-0 h-full w-full object-cover"
			/>
		);
	}
	if (isRasterUrl && failed) {
		return (
			<div
				className={cn(
					'absolute inset-0 flex items-center justify-center bg-(--desktop-surface-soft) px-1.5 text-center leading-tight',
					DESKTOP_TYPOGRAPHY.shellMeta10
				)}
				role="img"
				aria-label={t('wallpaper.previewLoadError')}
			>
				{t('wallpaper.previewLoadError')}
			</div>
		);
	}
	return (
		<div
			className="absolute inset-0"
			style={{
				background: fillStyle,
				backgroundSize: 'cover',
				backgroundPosition: 'center center',
				backgroundRepeat: 'no-repeat',
			}}
		/>
	);
});
WallpaperPreviewFill.displayName = 'WallpaperPreviewFill';

interface PickerWallpaper {
	id: string;
	name: string;
	style: string;
}

interface WallpaperPickerProps {
	isOpen: boolean;
	onClose: () => void;
	/** Current wallpaper value from config. */
	current: string;
	/** History of wallpapers from DB (most recent first). */
	history?: string[];
	onSelect: (wallpaper: string) => void;
	/** Удалить загруженный пользователем фон из истории (и сбросить текущий на дефолт при совпадении). */
	onRemoveUserWallpaper?: (wallpaperStyle: string) => void;
	shellWindowStyle?: DesktopWindowStyle;
}

function labelForWallpaper(
	w: PickerWallpaper,
	t: (k: string) => string
): string {
	if (w.id === 'current') return t('wallpaper.currentWallpaper');
	if (w.id.startsWith('user-')) return t('wallpaper.myWallpapers');
	return w.name;
}

export const WallpaperPicker: React.FC<WallpaperPickerProps> = memo(
	({
		isOpen,
		onClose,
		current,
		history,
		onSelect,
		onRemoveUserWallpaper,
		shellWindowStyle = 'glass',
	}) => {
		const { t } = useTranslation('desktopUi');
		const fileInputRef = useRef<HTMLInputElement>(null);
		const itemRefs = useRef<Array<HTMLElement | null>>([]);
		const scrollRef = useRef<HTMLDivElement>(null);
		const [scrollInnerWidth, setScrollInnerWidth] = useState(640);
		const [pending, setPending] = useState(current);
		const [focusedIndex, setFocusedIndex] = useState(0);

		const wallpapersToShow = useMemo(() => {
			const builtIn = [...WALLPAPERS];
			const userWallpapers = new Map<string, PickerWallpaper>();

			const allFromHistory = Array.isArray(history) ? history : [];
			for (let index = 0; index < allFromHistory.length; index += 1) {
				const value = allFromHistory[index];
				if (typeof value !== 'string') continue;
				if (!isDesktopWallpaperImageRef(value)) continue;
				if (builtIn.some((w) => w.style === value)) continue;
				if (!userWallpapers.has(value)) {
					userWallpapers.set(value, {
						id: `user-${index}`,
						name: '',
						style: value,
					});
				}
			}

			if (
				current &&
				isDesktopWallpaperImageRef(current) &&
				!builtIn.some((w) => w.style === current) &&
				!userWallpapers.has(current)
			) {
				userWallpapers.set(current, {
					id: 'current',
					name: '',
					style: current,
				});
			}

			return [...userWallpapers.values(), ...builtIn];
		}, [current, history]);

		const totalTiles = wallpapersToShow.length + 1;
		const rowCount = Math.ceil(totalTiles / GRID_COLS);

		const rowHeightPx = useMemo(
			() => computeRowHeightPx(scrollInnerWidth),
			[scrollInnerWidth]
		);

		const virtualizer = useVirtualizer({
			count: rowCount,
			getScrollElement: () => scrollRef.current,
			estimateSize: () => rowHeightPx,
			overscan: 2,
			getItemKey: (index) => `wallpaper-grid-row-${index}`,
		});

		useLayoutEffect(() => {
			if (!isOpen) return;
			const el = scrollRef.current;
			if (!el) return;
			const measure = () => setScrollInnerWidth(el.clientWidth);
			measure();
			if (typeof ResizeObserver === 'undefined') {
				return;
			}
			const ro = new ResizeObserver(measure);
			ro.observe(el);
			return () => ro.disconnect();
		}, [isOpen]);

		useEffect(() => {
			if (!isOpen) return;
			setPending(current);
			setFocusedIndex(0);
		}, [isOpen, current]);

		useLayoutEffect(() => {
			if (!isOpen) return;
			const row = Math.floor(focusedIndex / GRID_COLS);
			virtualizer.scrollToIndex(row, { align: 'auto' });
		}, [focusedIndex, isOpen, virtualizer]);

		useEffect(() => {
			if (!isOpen) return;
			const id = window.requestAnimationFrame(() => {
				itemRefs.current[focusedIndex]?.focus();
			});
			return () => window.cancelAnimationFrame(id);
		}, [isOpen, focusedIndex]);

		const handleCustomUpload = useCallback(() => {
			fileInputRef.current?.click();
		}, []);

		const onFileChange = useCallback(
			(e: React.ChangeEvent<HTMLInputElement>) => {
				const file = e.target.files?.[0];
				if (!file?.type.startsWith('image/')) return;
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = reader.result as string;
					if (!dataUrl) return;
					imageDataUrlToWebP(dataUrl)
						.then((webpUrl) => {
							setPending(webpUrl);
						})
						.catch(() => {
							setPending(dataUrl);
						});
				};
				reader.readAsDataURL(file);
				e.target.value = '';
			},
			[]
		);

		const handleApply = useCallback(() => {
			onSelect(pending);
			onClose();
		}, [onSelect, onClose, pending]);

		const handleRemoveUserWallpaper = useCallback(
			(style: string, e: React.MouseEvent) => {
				e.stopPropagation();
				e.preventDefault();
				if (!onRemoveUserWallpaper) return;
				onRemoveUserWallpaper(style);
				if (pending === style) {
					setPending(DEFAULT_DESKTOP_WALLPAPER_STYLE);
				}
			},
			[onRemoveUserWallpaper, pending]
		);

		const handleCellKeyDown = useCallback(
			(e: React.KeyboardEvent, index: number) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					if (index === wallpapersToShow.length) {
						handleCustomUpload();
					} else {
						setPending(wallpapersToShow[index].style);
					}
					return;
				}
				if (
					e.key === 'ArrowRight' ||
					e.key === 'ArrowLeft' ||
					e.key === 'ArrowDown' ||
					e.key === 'ArrowUp' ||
					e.key === 'Home' ||
					e.key === 'End'
				) {
					const next = moveGridIndex(index, e.key, totalTiles);
					if (next !== index) {
						e.preventDefault();
						setFocusedIndex(next);
					}
				}
			},
			[handleCustomUpload, totalTiles, wallpapersToShow]
		);

		const setItemRef = useCallback((el: HTMLElement | null, i: number) => {
			itemRefs.current[i] = el;
		}, []);

		if (!isOpen) return null;

		const footer = (
			<div className="flex w-full flex-wrap items-center justify-end gap-2">
				<DesktopChromeTooltip
					content={t('wallpaper.cancel')}
					placement="top"
					offsetExtra={4}
				>
					<button
						type="button"
						className="min-h-11 min-w-18 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-4 py-2 text-sm font-medium text-(--desktop-text-primary) transition-colors hover:bg-(--desktop-surface-soft-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]"
						onClick={onClose}
					>
						{t('wallpaper.cancel')}
					</button>
				</DesktopChromeTooltip>
				<DesktopChromeTooltip
					content={t('wallpaper.apply')}
					placement="top"
					offsetExtra={4}
				>
					<button
						type="button"
						className="min-h-11 min-w-18 rounded-lg border border-[rgb(var(--desktop-accent-rgb)/0.35)] bg-[rgb(var(--desktop-accent-rgb)/0.15)] px-4 py-2 text-sm font-medium text-(--desktop-text-primary) transition-colors hover:bg-[rgb(var(--desktop-accent-rgb)/0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]"
						onClick={handleApply}
					>
						{t('wallpaper.apply')}
					</button>
				</DesktopChromeTooltip>
			</div>
		);

		const renderCell = (globalIndex: number) => {
			if (globalIndex >= totalTiles) {
				return (
					<div
						key={`empty-${globalIndex}`}
						className="pointer-events-none min-w-0"
						aria-hidden
					/>
				);
			}
			if (globalIndex === wallpapersToShow.length) {
				return (
					<DesktopChromeTooltip
						key="upload"
						content={t('wallpaper.upload')}
						placement="top"
						offsetExtra={4}
						fullWidth
					>
						<button
							ref={(el) => setItemRef(el, globalIndex)}
							type="button"
							role="gridcell"
							tabIndex={focusedIndex === globalIndex ? 0 : -1}
							onKeyDown={(e) => handleCellKeyDown(e, globalIndex)}
							onFocus={() => setFocusedIndex(globalIndex)}
							onClick={handleCustomUpload}
							className="relative flex aspect-video min-w-0 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-(--desktop-radius-frame) border-2 border-dashed border-(--desktop-border-strong) bg-(--desktop-surface-soft) transition-[border-color,transform] outline-none hover:border-[rgb(var(--desktop-accent-rgb)/0.45)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]"
							aria-label={t('wallpaper.upload')}
						>
							<ArrowUpTrayIcon className="h-8 w-8 text-(--desktop-text-muted)" />
							<span className={cn(DESKTOP_TYPOGRAPHY.meta)}>
								{t('wallpaper.upload')}
							</span>
						</button>
					</DesktopChromeTooltip>
				);
			}

			const wallpaper = wallpapersToShow[globalIndex];
			const name = labelForWallpaper(wallpaper, t);
			const isPendingSel = pending === wallpaper.style;
			const isOnDesktop = current === wallpaper.style;
			const showRemove =
				Boolean(onRemoveUserWallpaper) &&
				isUserUploadedWallpaperStyle(wallpaper.style);

			return (
				<DesktopChromeTooltip
					key={wallpaper.id}
					content={name}
					placement="top"
					offsetExtra={4}
					fullWidth
				>
					<div
						ref={(el) => setItemRef(el, globalIndex)}
						role="gridcell"
						aria-selected={isPendingSel}
						tabIndex={focusedIndex === globalIndex ? 0 : -1}
						onKeyDown={(e) => handleCellKeyDown(e, globalIndex)}
						onFocus={() => setFocusedIndex(globalIndex)}
						onClick={() => setPending(wallpaper.style)}
						aria-label={`${name}`}
						className={cn(
							'relative aspect-video min-w-0 cursor-pointer overflow-hidden rounded-(--desktop-radius-frame) border-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]',
							'hover:border-(--desktop-border-strong)',
							isPendingSel
								? 'border-[rgb(var(--desktop-accent-rgb))] ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.5)]'
								: 'border-(--desktop-border-subtle)',
							isOnDesktop &&
								!isPendingSel &&
								'ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.35)]'
						)}
					>
						<WallpaperPreviewFill fillStyle={wallpaper.style} />
						{showRemove ? (
							<DesktopChromeTooltip
								content={t('wallpaper.removeUserTitle')}
								placement="top"
								offsetExtra={6}
							>
								<button
									type="button"
									className="absolute left-2 top-2 z-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/65 text-white shadow-md transition hover:bg-red-600/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
									aria-label={t('wallpaper.removeUserAria')}
									onClick={(e) => handleRemoveUserWallpaper(wallpaper.style, e)}
								>
									<TrashIcon className="h-4 w-4" aria-hidden />
								</button>
							</DesktopChromeTooltip>
						) : null}
						<span className="pointer-events-none absolute bottom-2 left-2 z-1 text-xs font-medium text-white [text-shadow:0_1px_3px_rgb(var(--desktop-bg-primary-rgb)/0.9),0_0_12px_rgb(var(--desktop-bg-primary-rgb)/0.55)]">
							{name}
						</span>
						{isPendingSel ? (
							<div className="absolute top-2 right-2 z-2 flex h-6 w-6 items-center justify-center rounded-full bg-[rgb(var(--desktop-accent-rgb))] shadow-(--desktop-shadow-soft)">
								<CheckIcon className="h-4 w-4 text-white" />
							</div>
						) : null}
					</div>
				</DesktopChromeTooltip>
			);
		};

		return (
			<ModalAdvanced
				isOpen={true}
				onClose={onClose}
				title={t('wallpaper.pickerTitle')}
				size="xl"
				className={cn(
					'w-full max-w-[min(100vw-2rem,56rem)]',
					getDesktopShellPanelClassName(shellWindowStyle, 'standard')
				)}
				variant="desktop"
				showCloseButton
				footer={footer}
				ariaDescribedBy="wallpaper-picker-hint"
				contentClassName="flex min-h-0 flex-col overflow-hidden"
			>
				<p
					id="wallpaper-picker-hint"
					className={cn(
						'mb-3 shrink-0 text-sm text-(--desktop-text-muted)',
						'-mt-1'
					)}
				>
					{t('wallpaper.pickerHint')}
				</p>
				<div
					ref={scrollRef}
					className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain pr-0.5 -mr-0.5"
				>
					<div
						role="grid"
						aria-label={t('wallpaper.gridLabel')}
						aria-rowcount={rowCount}
						aria-colcount={GRID_COLS}
						className="relative w-full min-h-0"
						style={{ height: `${virtualizer.getTotalSize()}px` }}
					>
						{virtualizer.getVirtualItems().map((vi) => (
							<div
								key={vi.key}
								role="row"
								data-index={vi.index}
								ref={virtualizer.measureElement}
								className="absolute left-0 top-0 w-full"
								style={{
									transform: `translateY(${vi.start}px)`,
								}}
							>
								<div className="grid grid-cols-4 gap-3">
									{Array.from({ length: GRID_COLS }, (_, col) =>
										renderCell(vi.index * GRID_COLS + col)
									)}
								</div>
							</div>
						))}
					</div>
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={onFileChange}
					aria-label={t('wallpaper.uploadAria')}
				/>
			</ModalAdvanced>
		);
	}
);

WallpaperPicker.displayName = 'WallpaperPicker';

export default WallpaperPicker;
