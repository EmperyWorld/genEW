import { useMemo, type Dispatch, type SetStateAction } from 'react';
import type { User } from '../../../services';
import type { AppSettings } from '../../../hooks/useAppState';
import type { DesktopAppPropsContextValue } from '../context/DesktopAppPropsContext';

export function useDesktopWorkspaceAppPropsValueBase(params: {
	authUser: User | null | undefined;
	appUser: User | null | undefined;
	settings: AppSettings;
	isAuthenticated: boolean;
	setWidgetAvatarUrl: Dispatch<SetStateAction<string | null>>;
}): Omit<DesktopAppPropsContextValue, 'theme' | 'onNavigate'> {
	const { authUser, appUser, settings, isAuthenticated, setWidgetAvatarUrl } =
		params;

	return useMemo(
		() => ({
			onUserUpdate: (
				u: { profile?: { avatar_url?: string | null } } | null
			) => {
				if (u?.profile && 'avatar_url' in u.profile)
					setWidgetAvatarUrl(u.profile.avatar_url ?? null);
			},
			user: authUser ?? appUser,
			settings,
			isAuthenticated,
		}),
		[authUser, appUser, settings, isAuthenticated, setWidgetAvatarUrl]
	);
}
