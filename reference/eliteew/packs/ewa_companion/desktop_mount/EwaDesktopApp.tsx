/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * **EWA** desktop window shell: one-time locked «friend» (`POST …/companion-profile/initialize`) and primary
 * companion chat with HTTP LLM filling the window canvas.
 *
 * Invariants:
 * - **`seed_persona_id`** is chosen only before profile exists; after **`GET …/companion-profile`** succeeds it is **read-only** in UI (server row immutable via initialize).
 * - Companion bootstrap errors from **`apiClient`** surface as **`APIError`** (not raw **`AxiosError`**): **404** → first-time pick flow; **503** → EWA pool offline.
 * - Persists **`ewaDesktopSessionId`** + **`ewaDesktopPersonaId`** from server profile when companion is ready (not client persona picker).
 * - **`reloadProfile`** uses **`getEwaCompanionProfile({ bypassHttpCache: true })`** so toggles and revision always match the server (avoids stale CDN/browser cache wiping UI state).
 * - Profile bootstrap uses **`withEwaCompanionLoadStall`** (12s, desktop-aligned) — hung fetch → **`load_timeout`** gate with retry, not infinite skeleton.
 * - User window has no operator/debug gear menu; user-facing controls live directly in the chat composer/surfaces.
 * - **Motion (2026-05):** the loading gate renders a **skeleton** with `motion-safe:animate-pulse` (disabled under
 *   `prefers-reduced-motion`).
 * - **Server-only mode (2026-05):** the previous СР/КЛ user-facing toggle has been removed — server-first is the only
 *   behaviour. The historical `ewa_companion_server_first_v2` learned-preference is kept in the API schema for
 *   backward compatibility but is **ignored** by routing. See ``documentation/platform/EWA-COMPANION-SERVER-ONLY-MIGRATION.md``.
 * - Companion chat receives **`refreshDesktopConfigFromServer`** from **`useDesktopAppProps`** so **`desktop_config_patch_applied`** updates desk theme/wallpaper without reload.
 * - Mounts **`EwaIconSprites`** once so companion strips can render EWASolution SVG symbols.
 * - **Opening preloader (2026-05):** lazy `EwaOpeningPreloader` on fresh window open only (`openedFromSessionRestore` skips it).
 *
 * Related:
 * - src/features/ewa/EwaCompanionChatPanel.tsx
 * - src/features/ewa/ewaIcons/EwaIconSprites.tsx
 * - src/pages/Desktop/context/DesktopAppPropsContext.tsx
 * - src/features/ewa/EwaCompanionFirstMeet.tsx
 * - EliteEW/api/ewa_platform/gateways/routers/companion_chat.py
 * - src/features/ewa/ewaCompanionLoadStall.ts
 * - src/services/ewa/ewaCompanionProfileApi.ts
 */
import { EwaCompanionChatPanel } from '@/features/ewa/EwaCompanionChatPanel';
import { EwaIconSprites } from '@/features/ewa/ewaIcons/EwaIconSprites';
import { EwaCompanionFirstMeet } from '@/features/ewa/EwaCompanionFirstMeet';
import {
	DEFAULT_EWA_PERSONA_ID,
	getEwaPersonaById,
	normalizeEwaPersonaId,
} from '@/features/ewa/ewaPersonaCatalog';
import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import {
	DesktopAppButton,
	DesktopProductStatePanel,
} from '@/pages/Desktop/components/DesktopAppChrome';
import { useDesktopAppProps } from '@/pages/Desktop/context/DesktopAppPropsContext';
import type { WindowInitialPayload } from '@/pages/Desktop/types/desktop.types';
import { useNotifications } from '@/notifications';
import {
	getEwaCompanionProfile,
	isCompanionProfileNotInitializedError,
	type EwaCompanionProfileOut,
} from '@/services/ewa/ewaCompanionProfileApi';
import {
	isEwaCompanionLoadTimeoutError,
	withEwaCompanionLoadStall,
} from '@/features/ewa/ewaCompanionLoadStall';
import { APIError } from '@/services/api/client';
import { cn } from '@/utils/cn';
import { isAxiosError } from 'axios';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useMobileEmbeddedHostViewport } from '@/hooks/useMobileEmbeddedHostViewport';

const EwaOpeningPreloaderLazy = lazy(() =>
	import('@/features/ewa/EwaOpeningPreloader').then((m) => ({
		default: m.EwaOpeningPreloader,
	}))
);
import { useTranslation } from 'react-i18next';

type CompanionGate =
	| 'loading'
	| 'no_db'
	| 'pick'
	| 'ready'
	| 'auth_error'
	| 'load_timeout';

function companionProfileGateFromFetchError(error: unknown): CompanionGate {
	if (error instanceof APIError) {
		const st = error.statusCode;
		if (st === 404) return 'pick';
		if (st === 503) return 'no_db';
		if (st === 401 || st === 403) return 'auth_error';
		return 'no_db';
	}
	if (isAxiosError(error)) {
		const st = error.response?.status;
		if (st === 404) return 'pick';
		if (st === 503) return 'no_db';
		if (st === 401 || st === 403) return 'auth_error';
		return 'no_db';
	}
	return 'no_db';
}

export function EwaDesktopApp({
	initialPayload,
	onWindowPayloadChange,
	openedFromSessionRestore = false,
	embeddedMobile = false,
}: {
	initialPayload?: WindowInitialPayload;
	onWindowPayloadChange?: (payload: WindowInitialPayload) => void;
	/** Skip opening persona preloader when window came from `windows_snapshot` restore. */
	openedFromSessionRestore?: boolean;
	/** MobileAndroid `#/mobile-ewa-companion` WebView — compact chat-only layout. */
	embeddedMobile?: boolean;
}) {
	const desktopAppProps = useDesktopAppProps();
	const { t, i18n } = useTranslation('marketing');
	const embeddedWidthTier = useMobileEmbeddedHostViewport(embeddedMobile);
	const { info } = useNotifications();

	const seedPlatformSession =
		typeof initialPayload?.ewaDesktopSessionId === 'string'
			? initialPayload.ewaDesktopSessionId.trim() || null
			: null;

	const [gate, setGate] = useState<CompanionGate>('loading');
	const [profile, setProfile] = useState<EwaCompanionProfileOut | null>(null);
	const skipOpeningPreloader = openedFromSessionRestore || embeddedMobile;
	const [openingPreloaderDismissed, setOpeningPreloaderDismissed] =
		useState(skipOpeningPreloader);
	const showOpeningPreloader =
		!skipOpeningPreloader && !openingPreloaderDismissed;
	const contentReady = gate !== 'loading';

	const [platformSessionId, setPlatformSessionId] = useState<string>(() => {
		if (seedPlatformSession) return seedPlatformSession;
		if (
			typeof crypto !== 'undefined' &&
			typeof crypto.randomUUID === 'function'
		) {
			return crypto.randomUUID();
		}
		return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	});

	const resetCompanionProfileGate = useCallback((): void => {
		setProfile(null);
		setGate('pick');
		info(t('ewaCompanion.profileResetToast'));
	}, [info, t]);

	const loadProfileFromServer = useCallback(
		async (isCancelled: () => boolean = () => false): Promise<void> => {
			setGate('loading');
			try {
				const p = await withEwaCompanionLoadStall(
					getEwaCompanionProfile({ bypassHttpCache: true })
				);
				if (isCancelled()) return;
				setProfile(p);
				setGate('ready');
			} catch (e: unknown) {
				if (isCancelled()) return;
				if (isEwaCompanionLoadTimeoutError(e)) {
					setGate('load_timeout');
					return;
				}
				const next = companionProfileGateFromFetchError(e);
				setGate(next);
				if (next === 'pick') {
					setProfile(null);
				}
			}
		},
		[]
	);

	const reloadProfile = useCallback(async (): Promise<void> => {
		try {
			const p = await withEwaCompanionLoadStall(
				getEwaCompanionProfile({ bypassHttpCache: true })
			);
			setProfile(p);
			setGate('ready');
		} catch (e: unknown) {
			if (isEwaCompanionLoadTimeoutError(e)) {
				setGate('load_timeout');
				return;
			}
			if (isCompanionProfileNotInitializedError(e)) {
				resetCompanionProfileGate();
				return;
			}
			throw e;
		}
	}, [resetCompanionProfileGate]);

	useEffect(() => {
		let cancelled = false;
		void loadProfileFromServer(() => cancelled);
		return () => {
			cancelled = true;
		};
	}, [loadProfileFromServer]);

	useEffect(() => {
		const sid =
			typeof initialPayload?.ewaDesktopSessionId === 'string'
				? initialPayload.ewaDesktopSessionId.trim() || null
				: null;
		if (sid) setPlatformSessionId(sid);
	}, [initialPayload?.ewaDesktopSessionId]);

	const seedPersonaKey =
		gate === 'ready' && profile ? profile.seed_persona_id : null;
	const companionDisplayName =
		gate === 'ready' && profile
			? (() => {
					const pid =
						normalizeEwaPersonaId(profile.seed_persona_id) ??
						DEFAULT_EWA_PERSONA_ID;
					const persona = getEwaPersonaById(pid);
					return i18n.language.startsWith('ru')
						? persona.displayNameRu
						: persona.displayNameEn;
				})()
			: null;

	useEffect(() => {
		if (gate !== 'ready' || seedPersonaKey == null) return;
		const pid = normalizeEwaPersonaId(seedPersonaKey);
		onWindowPayloadChange?.({
			ewaDesktopSessionId: platformSessionId.trim()
				? platformSessionId.trim()
				: undefined,
			ewaDesktopPersonaId: pid ?? undefined,
			ewaDesktopDisplayName: companionDisplayName ?? undefined,
		});
	}, [
		gate,
		seedPersonaKey,
		platformSessionId,
		companionDisplayName,
		onWindowPayloadChange,
	]);

	return (
		<div
			className={cn(
				'relative flex h-full min-h-0 flex-col',
				embeddedMobile && 'min-h-0'
			)}
			data-embedded-mobile={embeddedMobile ? '1' : undefined}
			data-me-width-tier={embeddedMobile ? embeddedWidthTier : undefined}
		>
			<EwaIconSprites />

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{showOpeningPreloader ? (
					<Suspense fallback={null}>
						<EwaOpeningPreloaderLazy
							contentReady={contentReady}
							onDismiss={() => setOpeningPreloaderDismissed(true)}
						/>
					</Suspense>
				) : null}
				{gate === 'loading' && !showOpeningPreloader ? (
					<div
						className={cn(
							'flex min-h-0 flex-1 flex-col gap-4 p-4',
							'motion-safe:animate-pulse motion-reduce:animate-none'
						)}
						role="status"
						aria-live="polite"
						aria-busy="true"
					>
						<span className="sr-only">{t('ewaCompanion.gateLoading')}</span>
						<div className="mx-auto h-32 w-32 shrink-0 rounded-full bg-(--desktop-surface-soft)" />
						<div className="mx-auto h-3 w-40 rounded bg-(--desktop-surface-soft)" />
						<div className="mx-auto h-3 w-56 rounded bg-(--desktop-surface-soft)/80" />
						<div className="grid min-h-0 shrink-0 grid-cols-2 gap-2">
							<div className="h-16 rounded-md bg-(--desktop-surface-soft)/90" />
							<div className="h-16 rounded-md bg-(--desktop-surface-soft)/90" />
						</div>
						<div className="min-h-48 flex-1 rounded-md border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/50" />
						<p
							className={cn(
								DESKTOP_TYPOGRAPHY.caption,
								'text-center text-(--desktop-text-secondary)'
							)}
						>
							{t('ewaCompanion.gateLoading')}
						</p>
					</div>
				) : null}
				{gate === 'load_timeout' ? (
					<DesktopProductStatePanel
						state="error"
						title={t('ewaCompanion.gateLoadTimeoutTitle')}
						description={t('ewaCompanion.gateLoadTimeout')}
						className="flex-1"
						actions={
							<DesktopAppButton
								type="button"
								variant="accent"
								onClick={() => void loadProfileFromServer()}
							>
								{t('ewaCompanion.gateRetry')}
							</DesktopAppButton>
						}
					/>
				) : null}
				{gate === 'no_db' ? (
					<DesktopProductStatePanel
						state="offline"
						title={t('ewaCompanion.gateNoDbTitle')}
						description={t('ewaCompanion.gateNoDb')}
						className="flex-1"
						actions={
							<DesktopAppButton
								type="button"
								variant="accent"
								onClick={() => void loadProfileFromServer()}
							>
								{t('ewaCompanion.gateRetry')}
							</DesktopAppButton>
						}
					/>
				) : null}
				{gate === 'auth_error' ? (
					<DesktopProductStatePanel
						state="permissionDenied"
						title={t('ewaCompanion.gateAuthErrorTitle')}
						description={t('ewaCompanion.gateAuthError')}
						className="flex-1"
						actions={
							<DesktopAppButton
								type="button"
								variant="accent"
								onClick={() => void loadProfileFromServer()}
							>
								{t('ewaCompanion.gateRetry')}
							</DesktopAppButton>
						}
					/>
				) : null}
				{gate === 'pick' ? (
					<div className="min-h-0 flex-1 overflow-auto p-3">
						<EwaCompanionFirstMeet
							embeddedMobile={embeddedMobile}
							onCommitted={async () => {
								await reloadProfile();
							}}
						/>
					</div>
				) : null}
				{gate === 'ready' && profile ? (
					<div className="flex min-h-0 flex-1 flex-col">
						<div className="flex min-h-0 flex-1 flex-col">
							<EwaCompanionChatPanel
								profile={profile}
								reloadProfile={reloadProfile}
								onProfileResetRequired={resetCompanionProfileGate}
								refreshDesktopConfigFromServer={
									desktopAppProps?.refreshDesktopConfigFromServer
								}
								embeddedMobile={embeddedMobile}
							/>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
