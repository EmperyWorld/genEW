/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared Quick Search launcher types for the chrome extract (plan 01 P2-1).
 *
 * Invariants:
 * - Row union order matches flat keyboard navigation index in `useQuickSearchNavigation`.
 *
 * Related:
 * - `../QuickSearch.tsx`, `useQuickSearchNavigation.ts`
 */

import type * as React from 'react';
import type { DesktopIconStyle, DesktopWindowStyle } from '@/types/profile';
import type { DesktopItem, RecentFile } from '../../types/desktop.types';

export interface QuickAction {
	id: string;
	label: string;
	description?: string;
	keywords?: string[];
	icon?: React.ReactNode;
}

export interface QuickSearchProps {
	isOpen: boolean;
	onClose: () => void;
	items: DesktopItem[];
	onOpenItem: (item: DesktopItem) => void;
	recentItems?: DesktopItem[];
	recentFiles?: RecentFile[];
	recentLibraryOpened?: RecentFile[];
	recentLibraryAdded?: RecentFile[];
	recentLibraryGenerated?: RecentFile[];
	recentLibraryUploaded?: RecentFile[];
	recentLibraryProjects?: RecentFile[];
	recentContentFeedLoading?: boolean;
	recentContentFeedError?: string | null;
	onRefetchRecentContentFeed?: () => void | Promise<void>;
	onOpenRecentFile?: (file: RecentFile) => void;
	removeRecentFile?: (fileId: string) => void;
	onPinAppToDesktop?: (app: DesktopItem) => void;
	quickActions?: QuickAction[];
	onQuickAction?: (actionId: string) => void;
	iconStyle?: DesktopIconStyle;
	shellWindowStyle?: DesktopWindowStyle;
}

export interface SearchResult {
	item: DesktopItem;
	score: number;
	matches: string[];
}

export type LauncherRow =
	| { type: 'app'; data: SearchResult | DesktopItem }
	| { type: 'file'; data: RecentFile }
	| { type: 'action'; data: QuickAction };

export type QuickSearchCtxMenu =
	| null
	| { kind: 'app'; item: DesktopItem; x: number; y: number }
	| { kind: 'file'; file: RecentFile; x: number; y: number }
	| { kind: 'action'; action: QuickAction; x: number; y: number };

export type BrowseSectionStarts = {
	recentAppsStart: number;
	unifiedDocsStart: number;
	projectsStart: number;
	libGenStart: number;
	libUpStart: number;
	libAddedStart: number;
	pinnedStart: number;
};
