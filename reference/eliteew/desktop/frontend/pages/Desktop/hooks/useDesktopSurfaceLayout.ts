import { useEffect, useMemo, useRef, useState } from 'react';

type DesktopSurfaceLayoutOptions = {
	compactWidth?: number;
	compactHeight?: number;
	denseWidth?: number;
	denseHeight?: number;
};

type DesktopSurfaceLayoutState = {
	width: number;
	height: number;
	isCompact: boolean;
	isDense: boolean;
};

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

export function useDesktopSurfaceLayout<T extends HTMLElement = HTMLDivElement>(
	options: DesktopSurfaceLayoutOptions = {}
): {
	surfaceRef: { current: T | null };
	width: number;
	height: number;
	isCompact: boolean;
	isDense: boolean;
} {
	const {
		compactWidth = 920,
		compactHeight = 680,
		denseWidth = 1120,
		denseHeight = 760,
	} = options;
	const surfaceRef = useRef<T | null>(null);
	const [layout, setLayout] = useState<DesktopSurfaceLayoutState>({
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
		isCompact: false,
		isDense: false,
	});

	useEffect(() => {
		const element = surfaceRef.current;
		if (!element || typeof ResizeObserver === 'undefined') {
			return;
		}

		const updateLayout = (width: number, height: number) => {
			setLayout({
				width,
				height,
				isCompact: width < compactWidth || height < compactHeight,
				isDense: width < denseWidth || height < denseHeight,
			});
		};

		updateLayout(
			element.clientWidth || DEFAULT_WIDTH,
			element.clientHeight || DEFAULT_HEIGHT
		);

		const observer = new ResizeObserver((entries) => {
			const next = entries[0];
			if (!next) {
				return;
			}
			updateLayout(next.contentRect.width, next.contentRect.height);
		});

		observer.observe(element);
		return () => observer.disconnect();
	}, [compactHeight, compactWidth, denseHeight, denseWidth]);

	return useMemo(
		() => ({
			surfaceRef,
			width: layout.width,
			height: layout.height,
			isCompact: layout.isCompact,
			isDense: layout.isDense,
		}),
		[layout.height, layout.isCompact, layout.isDense, layout.width]
	);
}
