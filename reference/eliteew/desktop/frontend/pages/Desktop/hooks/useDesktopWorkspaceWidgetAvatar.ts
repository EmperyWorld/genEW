/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Loads the signed-in user's avatar URL for the floating desktop widget via the shared
 * React Query profile cache (same key as AuthContext), avoiding a second GET /profile/me.
 *
 * Invariants:
 * - Uses ``PROFILE_ME_QUERY_KEY`` + ``staleTime`` aligned with AuthContext.
 * - Local setter remains for optimistic avatar updates from desktop settings without a refetch.
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`, `profileService.getProfile`, `AuthContext`
 */

import { useQuery } from '@tanstack/react-query';
import { type Dispatch, type SetStateAction, useState } from 'react';
import profileService, {
	PROFILE_ME_QUERY_KEY,
} from '../../../services/profileService';

type OptimisticAvatar = {
	userId: string;
	url: string | null;
};

export function useDesktopWorkspaceWidgetAvatar(
	authUserId: string | undefined
) {
	const [optimistic, setOptimistic] = useState<OptimisticAvatar | null>(null);

	const { data: profile } = useQuery({
		queryKey: PROFILE_ME_QUERY_KEY,
		queryFn: () => profileService.getProfile(),
		enabled: Boolean(authUserId),
		staleTime: 30_000,
	});

	const fromCache = profile?.avatar_url ? profile.avatar_url : null;
	const optimisticForUser =
		authUserId && optimistic?.userId === authUserId ? optimistic.url : null;
	const hasOptimistic =
		Boolean(authUserId) && optimistic?.userId === authUserId;
	const widgetAvatarUrl = !authUserId
		? null
		: hasOptimistic
			? optimisticForUser
			: fromCache;

	const setWidgetAvatarUrl: Dispatch<SetStateAction<string | null>> = (
		value
	) => {
		if (!authUserId) {
			setOptimistic(null);
			return;
		}
		const current = hasOptimistic ? optimisticForUser : fromCache;
		const next = typeof value === 'function' ? value(current) : value;
		setOptimistic({ userId: authUserId, url: next });
	};

	return [widgetAvatarUrl, setWidgetAvatarUrl] as const;
}
