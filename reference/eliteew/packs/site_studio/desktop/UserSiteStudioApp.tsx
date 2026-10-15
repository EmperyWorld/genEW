/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop Site Studio workspace for creating and operating user sites, including user-friendly setup, draft review,
 * launch controls, tab-level scrolling, and Professional Worlds draft handoff hydration.
 *
 * Invariants:
 * - Site runtime mutations stay behind explicit operator actions; handoff drafts only prefill forms/messages.
 * - Embedded admin opens only when runtime guardrails report a ready site API.
 * - User tabs own their scroll area so route guidance scrolls with the active section content.
 *
 * Related:
 * - pages/Desktop/components/desktopWindowAppContent.tsx
 * - features/professional-worlds/desktop/professionalWorldsCrossAppDraft.ts
 */

import * as React from 'react';
import type { UserSiteStudioAppProps } from './userSiteStudioAppModel';
import { useUserSiteStudioAppController } from './useUserSiteStudioAppController';
import { UserSiteStudioAppView } from './UserSiteStudioAppView';

/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Thin Desktop Site Studio orchestrator — controller + view.
 *
 * Related:
 * - features/site-studio/desktop/useUserSiteStudioAppController.tsx
 * - features/site-studio/desktop/UserSiteStudioAppView.tsx
 */
export const UserSiteStudioApp: React.FC<UserSiteStudioAppProps> = (props) => {
	const vm = useUserSiteStudioAppController(props);
	return <UserSiteStudioAppView vm={vm} />;
};

export default UserSiteStudioApp;
