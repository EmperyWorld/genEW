import { useResponsive } from '../../../hooks/useResponsive';
import { useDesktopRecentContentFeed } from './useDesktopRecentContentFeed';
import { useRecentFiles } from './useRecentFiles';

/**
 * T13 (Wave 16): bundles recent-files listener + viewport breakpoint used by shell layout.
 */
export function useDesktopWorkspaceRecentFilesAndViewport(): {
	recentFiles: ReturnType<typeof useRecentFiles>['recentFiles'];
	addRecentFile: ReturnType<typeof useRecentFiles>['addRecentFile'];
	removeRecentFile: ReturnType<typeof useRecentFiles>['removeRecentFile'];
	recentLibraryOpened: ReturnType<
		typeof useDesktopRecentContentFeed
	>['recentLibraryOpened'];
	recentLibraryAdded: ReturnType<
		typeof useDesktopRecentContentFeed
	>['recentLibraryAdded'];
	recentLibraryGenerated: ReturnType<
		typeof useDesktopRecentContentFeed
	>['recentLibraryGenerated'];
	recentLibraryUploaded: ReturnType<
		typeof useDesktopRecentContentFeed
	>['recentLibraryUploaded'];
	recentLibraryProjects: ReturnType<
		typeof useDesktopRecentContentFeed
	>['recentLibraryProjects'];
	refetchRecentContentFeed: ReturnType<
		typeof useDesktopRecentContentFeed
	>['refetch'];
	recentContentFeedLoading: boolean;
	recentContentFeedError: string | null;
	recentContentFeedLoadedAt: number | null;
	hasRecentContentFeedItems: boolean;
	isMobile: boolean;
} {
	const { recentFiles, addRecentFile, removeRecentFile } = useRecentFiles({
		listenToExternalEvents: true,
	});
	const {
		recentLibraryOpened,
		recentLibraryAdded,
		recentLibraryGenerated,
		recentLibraryUploaded,
		recentLibraryProjects,
		refetch,
		isLoading: recentContentFeedLoading,
		error: recentContentFeedError,
		lastLoadedAt: recentContentFeedLoadedAt,
		hasRecentContentFeedItems,
	} = useDesktopRecentContentFeed({ limit: 6 });
	const { isMobile } = useResponsive();
	return {
		recentFiles,
		addRecentFile,
		removeRecentFile,
		recentLibraryOpened,
		recentLibraryAdded,
		recentLibraryGenerated,
		recentLibraryUploaded,
		recentLibraryProjects,
		refetchRecentContentFeed: refetch,
		recentContentFeedLoading,
		recentContentFeedError,
		recentContentFeedLoadedAt,
		hasRecentContentFeedItems,
		isMobile,
	};
}
