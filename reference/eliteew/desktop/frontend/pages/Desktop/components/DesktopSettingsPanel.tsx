/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop Settings Center shell: tab navigation, modal/embedded chrome, lazy tab panels.
 *
 * Invariants:
 * - Tab content unmounts when inactive; heavy tabs load via `React.lazy` in TabPanels.
 * - Inactive tab chunks prefetch on idle after open (`prefetchDesktopSettingsTabChunks`).
 * - Tablist supports roving tabindex and Arrow/Home/End keys (`desktopSettingsTablistKeyboard.ts`).
 * - Storage map fields navigate to tab surfaces / shell anchors.
 * - Pending prefetch aborts when panel closes (`cancelDesktopSettingsTabChunkPrefetch`).
 *
 * Related:
 * - `settings/DesktopSettingsPanelTabPanels.tsx`, `settings/desktopSettingsPanel.types.ts`
 * - `settings/*Tab.tsx`
 * - `documentation/product/desktop/DESKTOP-SETTINGS-CENTER-AND-EXPANSION-DESIGN.md`
 */

import { cn } from '@/utils/cn';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from './DesktopAppChrome';
import { isMobileDesktopSettingsEmbeddedRoute } from '@/utils/mobileEmbeddedSpaRoute';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import * as React from 'react';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ComponentType,
	type FC,
	type SVGProps,
} from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
	getDesktopShellCheckboxControlClassName,
	getDesktopShellNavRailClassName,
	getDesktopShellPanelClassName,
	getDesktopShellSettingsMainColumnClassName,
	getDesktopShellToolbarClusterClassName,
	getDesktopShellToolbarClusterInsetControlClassName,
} from '../utils/desktopVisualSystem';
import { isDesktopLowGpuModeEnabled } from '../runtime/desktopLowGpuMode';
import type {
	DesktopSettingsShellHelpers,
	DesktopSettingsTabMeta,
	SavedFilterContentShortcutDraftState,
	TabId,
} from './settings/desktopSettingsShared.types';
import {
	ADVANCED_TAB_IDS,
	DESKTOP_SETTINGS_TAB_ORDER,
	PRIMARY_TAB_ORDER,
} from './settings/desktopSettingsShared.types';
import {
	prefetchDesktopSettingsTabChunks,
	cancelDesktopSettingsTabChunkPrefetch,
} from './settings/prefetchDesktopSettingsTabChunks';
import { buildDesktopSettingsVisualLabels } from './settings/desktopSettingsVisualLabels';
import { DesktopSettingsPanelTabPanels } from './settings/DesktopSettingsPanelTabPanels';
import type { DesktopSettingsPanelProps } from './settings/desktopSettingsPanel.types';
import { guideTourLabelsFromI18n } from '@/components/guided-tour/guideTourLabelsFromI18n';
import { SpotlightGuideModal } from '@/components/guided-tour/SpotlightGuideModal';
import { useBuiltGuideSteps } from '@/components/guided-tour/useBuiltGuideSteps';
import { useDesktopGuideTourOpener } from '@/pages/Desktop/hooks/useDesktopGuideTourOpener';
import {
	DESKTOP_SHELL_SETTINGS_GUIDE_AUDIO_LS_KEY,
	DESKTOP_SHELL_SETTINGS_GUIDE_ROOT_ID,
	DESKTOP_SHELL_SETTINGS_GUIDE_STEP_DEFS,
	DESKTOP_SHELL_SETTINGS_GUIDE_TOUR_FOLDER,
} from './desktopShellSettingsGuideConstants';
import { DesktopSettingsAdvancedDisclosure } from './settings/DesktopSettingsAdvancedDisclosure';
import type { SettingsNavigateTarget } from '../utils/desktopSettingsStorageMapNavigation';
import { buildDesktopSettingsFieldElementId } from '../utils/desktopSettingsFieldElementIds';
import {
	isDesktopSettingsTextEntryTarget,
	resolveDesktopSettingsTabFromDigitKey,
	resolveDesktopSettingsTabFromKeyboard,
} from './settings/desktopSettingsTablistKeyboard';
import { DESKTOP_OVERLAY, DESKTOP_Z_INDEX } from '../constants';
import { accentColorLabel } from '../utils/accentColorLabel';
import {
	CpuChipIcon,
	ComputerDesktopIcon,
	RectangleStackIcon,
	Squares2X2Icon,
	SwatchIcon,
} from '@heroicons/react/24/outline';

export type { PerformanceSummary } from './settings/DesktopSettingsPerformanceTab';
export type {
	DesktopControlCenterTab,
	DesktopSettingsVisualLabels,
	IconSize,
	ThemeMode,
} from './settings/desktopSettingsShared.types';
export type { DesktopSettingsTabMeta } from './settings/desktopSettingsShared.types';
export type { DesktopSettingsPanelProps } from './settings/desktopSettingsPanel.types';

/** @deprecated Import `DESKTOP_SETTINGS_TAB_ORDER` from `desktopSettingsShared.types`. */
const SETTINGS_TAB_ORDER = DESKTOP_SETTINGS_TAB_ORDER;

/** Single tabpanel for settings main column (mobile + desktop tab strips use distinct trigger ids). */
export const DESKTOP_SETTINGS_MAIN_TABPANEL_ID =
	'desktop-settings-main-tabpanel' as const;

function desktopSettingsTabTriggerId(surface: 'm' | 'd', tabId: TabId): string {
	return `desktop-settings-tab-${surface}-${tabId}`;
}

const DESKTOP_SETTINGS_TAB_ICONS: Record<
	TabId,
	ComponentType<SVGProps<SVGSVGElement>>
> = {
	personalize: SwatchIcon,
	icons: Squares2X2Icon,
	chrome: ComputerDesktopIcon,
	shell: RectangleStackIcon,
	performance: CpuChipIcon,
};

function buildDesktopSettingsTabs(
	t: TFunction<'desktopUi'>
): DesktopSettingsTabMeta[] {
	return SETTINGS_TAB_ORDER.map((id) => ({
		id,
		label: t(`settingsPanel.tabs.${id}.label`),
		description: t(`settingsPanel.tabs.${id}.description`),
		Icon: DESKTOP_SETTINGS_TAB_ICONS[id],
	}));
}

const DesktopSettingsPanelInner: FC<DesktopSettingsPanelProps> = (props) => {
	const {
		isOpen,
		onClose,
		activeTab,
		onActiveTabChange,
		accent,
		desktopAccentFollowsWindowStyle,
		desktopWindowStyle,
		presentation = 'modal',
		embeddedMobile,
		pendingShellScrollElementId = null,
		onShellScrollHandled,
	} = props;
	const embeddedMobileLayout =
		embeddedMobile ?? isMobileDesktopSettingsEmbeddedRoute();
	const { t } = useTranslation('desktopUi');
	const dialogRef = useRef<HTMLDivElement | null>(null);
	const previouslyFocusedRef = useRef<HTMLElement | null>(null);
	const reduceMotion = useReducedMotion();
	const lowGpuMode = useMemo(() => isDesktopLowGpuModeEnabled(), []);
	const lightweightMotion = reduceMotion || lowGpuMode;
	const isMdUp = useMediaQuery('(min-width: 768px)');
	const settingsTabsDesktopLayout = isMdUp && !embeddedMobileLayout;
	const activeSettingsTabTriggerId = desktopSettingsTabTriggerId(
		settingsTabsDesktopLayout ? 'd' : 'm',
		activeTab
	);

	const [savedFilterShortcutDraft, setSavedFilterShortcutDraft] =
		useState<SavedFilterContentShortcutDraftState>({
			label: '',
			searchQuery: '',
			filterType: '',
			filterVisibility: '',
			filterCompanyId: '',
			filterProjectId: '',
			filterFolderId: '',
			filesBrowseMode: '' as '' | 'catalog' | 'explorer' | 'all_files',
			explorerFolderTarget: '',
		});
	const [internalScrollTargetId, setInternalScrollTargetId] = useState<
		string | null
	>(null);

	const visualLabels = useMemo(() => buildDesktopSettingsVisualLabels(t), [t]);
	const desktopSettingsTabs = useMemo(() => buildDesktopSettingsTabs(t), [t]);
	const primarySettingsTabs = useMemo(
		() =>
			desktopSettingsTabs.filter((tab) => PRIMARY_TAB_ORDER.includes(tab.id)),
		[desktopSettingsTabs]
	);
	const advancedSettingsTabs = useMemo(
		() =>
			desktopSettingsTabs.filter((tab) => ADVANCED_TAB_IDS.includes(tab.id)),
		[desktopSettingsTabs]
	);
	const [advancedDisclosureExpanded, setAdvancedDisclosureExpanded] = useState(
		() => ADVANCED_TAB_IDS.includes(activeTab)
	);
	const guideLabels = useMemo(
		() => guideTourLabelsFromI18n(t, 'settingsPanel.guide'),
		[t]
	);
	useEffect(() => {
		if (ADVANCED_TAB_IDS.includes(activeTab)) {
			setAdvancedDisclosureExpanded(true);
		}
	}, [activeTab]);
	const guideSteps = useBuiltGuideSteps(
		t,
		'settingsPanel.guide.steps',
		DESKTOP_SHELL_SETTINGS_GUIDE_STEP_DEFS
	);
	const [guideOpen, setGuideOpen] = useState(false);
	const openGuideTour = useCallback(() => setGuideOpen(true), []);
	useDesktopGuideTourOpener(openGuideTour, {
		enabled: isOpen && !embeddedMobileLayout,
	});
	const prepareGuideStep = useCallback(
		(stepId: string) => {
			const tabByStep: Partial<Record<string, TabId>> = {
				intro: 'personalize',
				personalize: 'personalize',
				icons: 'icons',
				chrome: 'chrome',
				shell: 'shell',
				performance: 'performance',
			};
			const tab = tabByStep[stepId];
			if (tab && tab !== activeTab) {
				onActiveTabChange(tab);
			}
		},
		[activeTab, onActiveTabChange]
	);

	const selectedAccentName = desktopAccentFollowsWindowStyle
		? t('settingsAccent.followsWindowStyle', {
				style: visualLabels.windowStyle[desktopWindowStyle],
			})
		: accent === 'custom'
			? t('settingsAccent.customColor')
			: accentColorLabel(accent, t);

	const shell: DesktopSettingsShellHelpers = useMemo(() => {
		const windowStyle = desktopWindowStyle;
		const segmentClusterClass = cn(
			getDesktopShellToolbarClusterClassName(windowStyle),
			'inline-flex flex-wrap gap-0.5 rounded-xl p-0.5'
		);
		const segmentTabClass = (active: boolean) =>
			cn(
				'px-3 py-1.5 text-xs rounded-lg transition-[color,background-color,box-shadow] outline-none',
				DESKTOP_CHROME_FOCUS_VISIBLE,
				active
					? 'bg-[rgb(var(--desktop-accent-rgb)/0.22)] text-(--desktop-text-primary) ring-1 ring-inset ring-[rgb(var(--desktop-accent-rgb)/0.45)] shadow-sm'
					: cn(
							getDesktopShellToolbarClusterInsetControlClassName(windowStyle),
							'text-(--desktop-text-secondary) hover:text-(--desktop-text-primary)'
						)
			);
		const checkboxClass = cn(
			getDesktopShellCheckboxControlClassName(windowStyle),
			'accent-[rgb(var(--desktop-accent-rgb))]',
			DESKTOP_CHROME_FOCUS_VISIBLE,
			'size-4 shrink-0'
		);
		const statTileClass = cn(
			getDesktopShellToolbarClusterInsetControlClassName(windowStyle),
			'rounded-xl px-3 py-3 space-y-1'
		);
		return {
			windowStyle,
			segmentClusterClass,
			segmentTabClass,
			checkboxClass,
			statTileClass,
		};
	}, [desktopWindowStyle]);

	const openShellMotionSettings = useCallback(() => {
		setInternalScrollTargetId(
			buildDesktopSettingsFieldElementId('profile_ui', 'desktop_shell_motion')
		);
		onActiveTabChange('personalize');
	}, [onActiveTabChange]);

	const scrollToSettingsElement = useCallback(
		(elementId: string, onDone?: () => void) => {
			let attempts = 0;
			const tryScroll = (): void => {
				const el = document.getElementById(elementId);
				if (el) {
					el.scrollIntoView({ behavior: 'smooth', block: 'start' });
					onDone?.();
					return;
				}
				if (attempts++ < 12) {
					requestAnimationFrame(tryScroll);
				} else {
					onDone?.();
				}
			};
			tryScroll();
		},
		[]
	);

	const handleStorageMapFieldNavigate = useCallback(
		(target: SettingsNavigateTarget) => {
			if (target.tab !== activeTab) {
				setInternalScrollTargetId(target.elementId);
				onActiveTabChange(target.tab);
				return;
			}
			scrollToSettingsElement(target.elementId);
		},
		[activeTab, onActiveTabChange, scrollToSettingsElement]
	);

	const navigateVisualStudioSettingsField = useCallback(
		(target: { tab: TabId; elementId: string }) => {
			handleStorageMapFieldNavigate(target);
		},
		[handleStorageMapFieldNavigate]
	);

	useLayoutEffect(() => {
		if (activeTab !== 'shell' || !pendingShellScrollElementId) return;
		const targetId = pendingShellScrollElementId;
		scrollToSettingsElement(targetId, () => onShellScrollHandled?.());
	}, [
		activeTab,
		onShellScrollHandled,
		pendingShellScrollElementId,
		scrollToSettingsElement,
	]);

	useLayoutEffect(() => {
		if (!internalScrollTargetId) return;
		const targetId = internalScrollTargetId;
		scrollToSettingsElement(targetId, () => setInternalScrollTargetId(null));
	}, [internalScrollTargetId, scrollToSettingsElement]);

	const handleClose = useCallback(() => {
		onClose();
		// Восстановить фокус в элемент, из которого открывали настройки
		setTimeout(() => {
			previouslyFocusedRef.current?.focus?.();
			previouslyFocusedRef.current = null;
		}, 0);
	}, [onClose]);

	useEffect(() => {
		if (!isOpen) return;

		previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				handleClose();
				return;
			}
			if (isDesktopSettingsTextEntryTarget(event.target)) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const digitTab = resolveDesktopSettingsTabFromDigitKey(
				event.key,
				advancedDisclosureExpanded
			);
			if (digitTab) {
				event.preventDefault();
				onActiveTabChange(digitTab);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [advancedDisclosureExpanded, isOpen, handleClose, onActiveTabChange]);

	useEffect(() => {
		if (!isOpen) {
			cancelDesktopSettingsTabChunkPrefetch();
			return;
		}
		prefetchDesktopSettingsTabChunks(activeTab);
	}, [isOpen, activeTab]);

	const focusSettingsTabTrigger = useCallback(
		(tabId: TabId) => {
			const surface = settingsTabsDesktopLayout ? 'd' : 'm';
			requestAnimationFrame(() => {
				document
					.getElementById(desktopSettingsTabTriggerId(surface, tabId))
					?.focus();
			});
		},
		[settingsTabsDesktopLayout]
	);

	const handleSettingsTablistKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			const target = event.target;
			if (
				!(target instanceof HTMLElement) ||
				target.getAttribute('role') !== 'tab'
			) {
				return;
			}
			const nextTab = resolveDesktopSettingsTabFromKeyboard(
				activeTab,
				event.key
			);
			if (!nextTab) return;
			event.preventDefault();
			onActiveTabChange(nextTab);
			focusSettingsTabTrigger(nextTab);
		},
		[activeTab, focusSettingsTabTrigger, onActiveTabChange]
	);

	const handleContainerKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.key !== 'Tab') return;
			const root = dialogRef.current;
			if (!root) return;

			const focusables = root.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			const list = Array.from(focusables);
			if (list.length === 0) return;

			const currentIndex = list.indexOf(document.activeElement as HTMLElement);
			if (currentIndex === -1) return;

			if (event.shiftKey) {
				if (currentIndex === 0) {
					event.preventDefault();
					list[list.length - 1].focus();
				}
			} else if (currentIndex === list.length - 1) {
				event.preventDefault();
				list[0].focus();
			}
		},
		[]
	);

	if (!isOpen) {
		return null;
	}

	const settingsPanelChrome = (
		<>
			{lowGpuMode ? (
				<style>
					{`
								.desktop-settings-low-gpu,
								.desktop-settings-low-gpu * {
									backdrop-filter: none !important;
									-webkit-backdrop-filter: none !important;
									filter: none !important;
								}
								/* Не задаём фон с !important: иначе гасится пресет рамки/градиента окна (paper, neon, …). */
								.desktop-settings-low-gpu [class*="shadow-"] {
									box-shadow: none !important;
								}
								.desktop-settings-low-gpu [class*="transition-"] {
									transition: none !important;
								}
							`}
				</style>
			) : null}
			<h1 className="sr-only">{t('settingsPanel.headerTitle')}</h1>

			<div
				className={cn(
					'flex min-h-0 flex-1 flex-col',
					settingsTabsDesktopLayout && 'md:flex-row'
				)}
			>
				{/* Mobile: horizontal tabs */}
				<div
					data-desktop-settings-guide="tabs-nav"
					className={cn(
						'flex shrink-0 gap-1 overflow-x-auto border-b border-(--desktop-border-subtle) px-2 py-2',
						settingsTabsDesktopLayout && 'md:hidden'
					)}
					aria-hidden={settingsTabsDesktopLayout}
				>
					<DesktopSettingsAdvancedDisclosure
						layout="mobile"
						activeTab={activeTab}
						advancedDisclosureLabel={t(
							'settingsPanel.advancedDisclosure.label'
						)}
						advancedExpanded={advancedDisclosureExpanded}
						advancedTablistLabel={t(
							'settingsPanel.advancedDisclosure.tabsAria'
						)}
						advancedTabs={advancedSettingsTabs}
						getTriggerId={(tabId) => desktopSettingsTabTriggerId('m', tabId)}
						onActiveTabChange={onActiveTabChange}
						onAdvancedExpandedChange={setAdvancedDisclosureExpanded}
						onAdvancedTablistKeyDown={handleSettingsTablistKeyDown}
						onPrimaryTablistKeyDown={handleSettingsTablistKeyDown}
						tabpanelId={DESKTOP_SETTINGS_MAIN_TABPANEL_ID}
						primaryTablistLabel={t('settingsPanel.primarySectionsNavAria')}
						primaryTabs={primarySettingsTabs}
					/>
				</div>
				{/* Desktop: sidebar tabs */}
				<div
					data-desktop-settings-guide="tabs-nav"
					className={cn(
						'hidden w-56 flex-col space-y-1 px-3 py-4',
						settingsTabsDesktopLayout && 'md:flex',
						getDesktopShellNavRailClassName(desktopWindowStyle)
					)}
					aria-hidden={!settingsTabsDesktopLayout}
				>
					<DesktopSettingsAdvancedDisclosure
						layout="desktop"
						activeTab={activeTab}
						advancedDisclosureLabel={t(
							'settingsPanel.advancedDisclosure.label'
						)}
						advancedExpanded={advancedDisclosureExpanded}
						advancedTablistLabel={t(
							'settingsPanel.advancedDisclosure.tabsAria'
						)}
						advancedTabs={advancedSettingsTabs}
						getTriggerId={(tabId) => desktopSettingsTabTriggerId('d', tabId)}
						onActiveTabChange={onActiveTabChange}
						onAdvancedExpandedChange={setAdvancedDisclosureExpanded}
						onAdvancedTablistKeyDown={handleSettingsTablistKeyDown}
						onPrimaryTablistKeyDown={handleSettingsTablistKeyDown}
						tabpanelId={DESKTOP_SETTINGS_MAIN_TABPANEL_ID}
						primaryTablistLabel={t('settingsPanel.primarySectionsNavAria')}
						primaryTabs={primarySettingsTabs}
					/>
				</div>

				{/* Content */}
				<div
					id={DESKTOP_SETTINGS_MAIN_TABPANEL_ID}
					role="tabpanel"
					aria-labelledby={activeSettingsTabTriggerId}
					key={activeTab}
					className={cn(
						'flex-1 min-h-0 flex flex-col p-5 overflow-y-auto space-y-5',
						getDesktopShellSettingsMainColumnClassName(desktopWindowStyle)
					)}
				>
					<DesktopSettingsPanelTabPanels
						{...props}
						selectedAccentName={selectedAccentName}
						shell={shell}
						visualLabels={visualLabels}
						savedFilterShortcutDraft={savedFilterShortcutDraft}
						setSavedFilterShortcutDraft={setSavedFilterShortcutDraft}
						onNavigateSettingsField={navigateVisualStudioSettingsField}
						onStorageMapFieldNavigate={handleStorageMapFieldNavigate}
						onOpenShellMotionSettings={openShellMotionSettings}
					/>
				</div>
			</div>
		</>
	);

	const guideModal = (
		<SpotlightGuideModal
			open={guideOpen}
			onClose={() => setGuideOpen(false)}
			rootId={DESKTOP_SHELL_SETTINGS_GUIDE_ROOT_ID}
			steps={guideSteps}
			audioLocalStorageKey={DESKTOP_SHELL_SETTINGS_GUIDE_AUDIO_LS_KEY}
			tourAudioFolder={DESKTOP_SHELL_SETTINGS_GUIDE_TOUR_FOLDER}
			labels={guideLabels}
			onPrepareStep={prepareGuideStep}
			spotlightLayoutKey={`${guideOpen}-${activeTab}-${isMdUp}`}
			dialogTitleId="desktop-shell-settings-guide-title"
		/>
	);

	if (presentation === 'embedded') {
		return (
			<>
				<section
					id={DESKTOP_SHELL_SETTINGS_GUIDE_ROOT_ID}
					ref={dialogRef}
					data-desktop-settings-root={embeddedMobileLayout ? '1' : undefined}
					data-embedded-mobile={embeddedMobileLayout ? '1' : undefined}
					className={cn(
						'flex h-full min-h-0 w-full flex-col overflow-hidden',
						getDesktopShellPanelClassName(desktopWindowStyle, 'strong'),
						lowGpuMode && 'desktop-settings-low-gpu'
					)}
					aria-label={t('modal.settingsShellAria')}
					onKeyDown={handleContainerKeyDown}
				>
					{settingsPanelChrome}
				</section>
				{!embeddedMobileLayout ? guideModal : null}
			</>
		);
	}

	return (
		<>
			<AnimatePresence>
				<m.div
					className={`fixed inset-0 ${DESKTOP_OVERLAY.backdrop}`}
					style={{ zIndex: DESKTOP_Z_INDEX.MODAL }}
					initial={lightweightMotion ? { opacity: 1 } : { opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={lightweightMotion ? { opacity: 1 } : { opacity: 0 }}
					onClick={handleClose}
				/>
				<m.div
					className="fixed inset-0 flex items-center justify-center px-4"
					style={{ zIndex: DESKTOP_Z_INDEX.MODAL_CONTENT }}
					initial={lightweightMotion ? { opacity: 1 } : { opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={lightweightMotion ? { opacity: 1 } : { opacity: 0 }}
				>
					<m.div
						id={DESKTOP_SHELL_SETTINGS_GUIDE_ROOT_ID}
						ref={dialogRef}
						role="dialog"
						aria-modal="true"
						aria-label={t('modal.settingsShellAria')}
						className={cn(
							'relative flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden',
							getDesktopShellPanelClassName(desktopWindowStyle, 'strong'),
							lowGpuMode && 'desktop-settings-low-gpu'
						)}
						initial={
							lightweightMotion
								? { opacity: 1, scale: 1, y: 0 }
								: { opacity: 0, scale: 0.96, y: 12 }
						}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={
							lightweightMotion
								? { opacity: 1, scale: 1, y: 0 }
								: { opacity: 0, scale: 0.96, y: 12 }
						}
						transition={
							lightweightMotion
								? { duration: 0.08, ease: 'linear' }
								: { type: 'spring', damping: 22, stiffness: 320 }
						}
						onClick={(event) => event.stopPropagation()}
						onKeyDown={handleContainerKeyDown}
					>
						{settingsPanelChrome}
					</m.div>
				</m.div>
			</AnimatePresence>
			{guideModal}
		</>
	);
};

export const DesktopSettingsPanel = React.memo(DesktopSettingsPanelInner);
DesktopSettingsPanel.displayName = 'DesktopSettingsPanel';
