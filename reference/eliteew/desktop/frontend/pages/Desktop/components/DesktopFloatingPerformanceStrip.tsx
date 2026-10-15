/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Lightweight FPS/heap metrics strip for the floating desktop widget (no Framer Motion).
 *
 * Invariants:
 * - Read-only metrics display; optional background-unload toggle via callback only.
 *
 * Related:
 * - DesktopWorkspaceFloatingWidget.tsx, DesktopChromeTooltip.tsx
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
	DESKTOP_PERFORMANCE_TARGETS,
	DESKTOP_TYPOGRAPHY,
} from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';
import { virtualizationToggleButtonClasses } from '@/pages/Desktop/utils/performanceMonitorUi';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import {
	ArrowTrendingDownIcon,
	ArrowTrendingUpIcon,
	BoltIcon,
	ComputerDesktopIcon,
	CpuChipIcon,
	ExclamationTriangleIcon,
	SignalIcon,
} from '@heroicons/react/24/outline';

interface PerformanceData {
	fps: number;
	memoryUsage: number;
	windowCount: number;
	renderTime: number;
}

export interface DesktopFloatingPerformanceStripProps {
	data: PerformanceData;
	isHighPerformanceMode: boolean;
	preferAggressiveBackgroundSuspend: boolean;
	recommendations: string[];
	onToggleAggressiveBackground?: () => void;
	className?: string;
}

function formatHeapMb(mb: number, unit: string): string {
	if (!Number.isFinite(mb)) return '—';
	if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
	return `${Math.round(mb)} ${unit}`;
}

function fpsValueClass(fps: number): string {
	if (fps < DESKTOP_PERFORMANCE_TARGETS.FPS_CRITICAL) {
		return 'text-[color-mix(in_srgb,rgb(248_113_113)_82%,rgb(var(--desktop-fg-primary-rgb))_18%)]';
	}
	if (fps < DESKTOP_PERFORMANCE_TARGETS.FPS_WARN) {
		return 'text-[color-mix(in_srgb,rgb(250_204_21)_78%,rgb(var(--desktop-fg-primary-rgb))_22%)]';
	}
	return 'text-[color-mix(in_srgb,rgb(74_222_128)_75%,rgb(var(--desktop-fg-primary-rgb))_25%)]';
}

export function DesktopFloatingPerformanceStrip({
	data,
	isHighPerformanceMode,
	preferAggressiveBackgroundSuspend,
	recommendations,
	onToggleAggressiveBackground,
	className = '',
}: DesktopFloatingPerformanceStripProps) {
	const { t } = useTranslation('desktopUi');

	const performanceStatus = useMemo(() => {
		if (
			data.fps <= DESKTOP_PERFORMANCE_TARGETS.FPS_CRITICAL ||
			data.memoryUsage > DESKTOP_PERFORMANCE_TARGETS.MEMORY_WARN_MB
		) {
			return 'critical';
		}
		if (
			data.fps < DESKTOP_PERFORMANCE_TARGETS.FPS_WARN ||
			data.renderTime > DESKTOP_PERFORMANCE_TARGETS.RENDER_WARN_MS
		) {
			return 'warning';
		}
		return 'good';
	}, [data.fps, data.memoryUsage, data.renderTime]);

	const statusConfig = useMemo(() => {
		switch (performanceStatus) {
			case 'critical':
				return {
					icon: ExclamationTriangleIcon,
					borderColor:
						'border-[color-mix(in_srgb,rgb(248_113_113)_32%,var(--desktop-border-subtle))]',
					labelKey: 'performance.statusCritical' as const,
					iconClass:
						'text-[color-mix(in_srgb,rgb(248_113_113)_72%,rgb(var(--desktop-fg-secondary-rgb))_28%)]',
				};
			case 'warning':
				return {
					icon: ArrowTrendingDownIcon,
					borderColor:
						'border-[color-mix(in_srgb,rgb(250_204_21)_30%,var(--desktop-border-subtle))]',
					labelKey: 'performance.statusWarning' as const,
					iconClass:
						'text-[color-mix(in_srgb,rgb(250_204_21)_68%,rgb(var(--desktop-fg-secondary-rgb))_32%)]',
				};
			default:
				return {
					icon: ArrowTrendingUpIcon,
					borderColor:
						'border-[color-mix(in_srgb,rgb(74_222_128)_28%,var(--desktop-border-subtle))]',
					labelKey: 'performance.statusGood' as const,
					iconClass:
						'text-[color-mix(in_srgb,rgb(74_222_128)_65%,rgb(var(--desktop-fg-secondary-rgb))_35%)]',
				};
		}
	}, [performanceStatus]);

	const StatusIcon = statusConfig.icon;

	return (
		<div
			className={cn(
				'w-full rounded-lg border bg-(--desktop-surface-panel-strong) p-3 text-(--desktop-text-primary) shadow-lg',
				statusConfig.borderColor,
				className
			)}
		>
			<div className="mb-3 flex min-w-0 items-center gap-2">
				<SignalIcon className={`h-4 w-4 shrink-0 ${statusConfig.iconClass}`} />
				<DesktopChromeTooltip
					content={t('performance.title')}
					placement="top"
					offsetExtra={4}
				>
					<span className="truncate text-sm font-medium text-(--desktop-text-primary)">
						{t('performance.title')}
					</span>
				</DesktopChromeTooltip>
				<StatusIcon className={`h-3 w-3 shrink-0 ${statusConfig.iconClass}`} />
			</div>

			<div
				className={`mb-3 rounded border px-2 py-1.5 ${statusConfig.borderColor} bg-(--desktop-surface-soft)`}
			>
				<div className="flex items-center justify-between gap-2">
					<span className="text-xs font-medium text-(--desktop-text-primary)">
						{t(statusConfig.labelKey)} {t('performance.statusSuffix')}
					</span>
					{isHighPerformanceMode && (
						<div className="flex items-center gap-1 text-[color-mix(in_srgb,rgb(250_204_21)_72%,rgb(var(--desktop-fg-primary-rgb))_28%)]">
							<BoltIcon className="h-3 w-3" aria-hidden />
							<span className="text-xs font-medium">
								{t('performance.turbo')}
							</span>
						</div>
					)}
				</div>
			</div>

			<div className="mb-3 space-y-3">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<ComputerDesktopIcon className="h-3 w-3 text-(--desktop-text-muted)" />
						<span className="text-xs text-(--desktop-text-muted)">
							{t('performance.metricFps')}
						</span>
					</div>
					<span
						className={`text-xs font-mono tabular-nums ${fpsValueClass(data.fps)}`}
					>
						{data.fps}
					</span>
				</div>

				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<CpuChipIcon className="h-3 w-3 text-(--desktop-text-muted)" />
						<span className="text-xs text-(--desktop-text-muted)">
							{t('performance.metricMemory')}
						</span>
					</div>
					<span className="text-xs font-mono text-(--desktop-text-primary) tabular-nums">
						{formatHeapMb(data.memoryUsage, t('performance.metricMemoryUnit'))}
					</span>
				</div>

				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<ComputerDesktopIcon className="h-3 w-3 text-(--desktop-text-muted)" />
						<span className="text-xs text-(--desktop-text-muted)">
							{t('performance.metricWindows')}
						</span>
					</div>
					<span className="text-xs font-mono text-(--desktop-text-primary) tabular-nums">
						{data.windowCount}
					</span>
				</div>

				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<SignalIcon className="h-3 w-3 text-(--desktop-text-muted)" />
						<span className="text-xs text-(--desktop-text-muted)">
							{t('performance.metricRender')}
						</span>
					</div>
					<span className="text-xs font-mono text-(--desktop-text-primary) tabular-nums">
						{data.renderTime.toFixed(1)} ms
					</span>
				</div>
			</div>

			{onToggleAggressiveBackground && (
				<div className="mb-3 flex items-center justify-between gap-2 rounded border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-2">
					<span className="text-xs text-(--desktop-text-muted)">
						{t('performance.backgroundUnload')}
					</span>
					<DesktopChromeTooltip
						content={`${t('performance.backgroundUnload')}: ${
							preferAggressiveBackgroundSuspend
								? t('performance.on')
								: t('performance.off')
						}`}
						placement="top"
						offsetExtra={4}
					>
						<button
							type="button"
							onClick={onToggleAggressiveBackground}
							className={virtualizationToggleButtonClasses(
								preferAggressiveBackgroundSuspend
							)}
							aria-label={`${t('performance.backgroundUnload')}: ${
								preferAggressiveBackgroundSuspend
									? t('performance.on')
									: t('performance.off')
							}`}
						>
							{preferAggressiveBackgroundSuspend
								? t('performance.on')
								: t('performance.off')}
						</button>
					</DesktopChromeTooltip>
				</div>
			)}

			{recommendations.length > 0 && (
				<div className="space-y-1">
					<span className="text-xs text-(--desktop-text-muted)">
						{t('performance.recommendations')}
					</span>
					<ul className="list-none space-y-0.5 pl-0">
						{recommendations.map((rec) => (
							<li
								key={rec}
								className="pl-2 text-xs text-[color-mix(in_srgb,rgb(250_204_21)_62%,rgb(var(--desktop-fg-primary-rgb))_38%)]"
							>
								• {rec}
							</li>
						))}
					</ul>
				</div>
			)}

			<div
				className={cn(
					'mt-3 border-t border-(--desktop-border-subtle) pt-3 uppercase tracking-[0.12em]',
					DESKTOP_TYPOGRAPHY.shellMeta10
				)}
			>
				{t('performance.budget', {
					fps: DESKTOP_PERFORMANCE_TARGETS.TARGET_FPS,
					renderMs: DESKTOP_PERFORMANCE_TARGETS.RENDER_WARN_MS,
					memoryMb: DESKTOP_PERFORMANCE_TARGETS.MEMORY_WARN_MB,
				})}
			</div>
		</div>
	);
}
