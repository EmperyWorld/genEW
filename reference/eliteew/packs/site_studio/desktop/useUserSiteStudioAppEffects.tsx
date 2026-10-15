/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Site Studio boot/hydration/deploy side-effects for the desktop workspace controller.
 *
 * Related:
 * - features/site-studio/desktop/useUserSiteStudioAppController.tsx
 */

import { useEffect } from 'react';
import { isSiteStudioPendingStatus } from './components/siteStudioRuntimeGuards';
import { reportProfessionalCrossAppDraftLifecycle } from '@/features/professional-worlds/desktop/reportProfessionalCrossAppDraftLifecycle';
import { getUnknownErrorMessage } from './userSiteStudioAppModel';

export type UserSiteStudioAppEffectsDeps = Record<string, any>;

export function useUserSiteStudioAppEffects(
	deps: UserSiteStudioAppEffectsDeps
): void {
	const {
		t,
		loading,
		instance,
		health,
		catalog,
		form,
		setForm,
		setInstance,
		setHealth,
		setCatalog,
		setDrafts,
		setLoading,
		setNotice,
		setPanelError,
		setDeployLiveText,
		setAssistantInput,
		setActiveTab,
		setImagePrompts,
		deploySigRef,
		appliedProfessionalWorldsDraftRef,
		pwPublishedReportSigRef,
		initialProfessionalWorldsDraft,
		refreshWorkspace,
		syncFormFromInstance,
		syncDraftsIntoState,
		cleanupVoiceResources,
		safeDrafts,
		windowSurface,
		activeTab,
	} = deps;

	useEffect(() => {
		(async () => {
			try {
				await refreshWorkspace();
			} catch (error: unknown) {
				const message = getUnknownErrorMessage(error, t('errors.loadFailed'));
				setPanelError('setup', message);
				setNotice({ tone: 'error', message });
			} finally {
				setLoading(false);
			}
		})();
	}, [refreshWorkspace, setPanelError, t, setNotice, setLoading]);

	useEffect(() => {
		if (
			loading ||
			!initialProfessionalWorldsDraft ||
			appliedProfessionalWorldsDraftRef.current
		) {
			return;
		}
		appliedProfessionalWorldsDraftRef.current = true;
		setForm((previous) => ({
			site_title: previous.site_title.trim()
				? previous.site_title
				: initialProfessionalWorldsDraft.siteTitle,
			site_topic: previous.site_topic.trim()
				? previous.site_topic
				: initialProfessionalWorldsDraft.siteTopic,
			brief: previous.brief.trim()
				? `${previous.brief.trim()}\n\n${initialProfessionalWorldsDraft.brief}`
				: initialProfessionalWorldsDraft.brief,
		}));
		if (instance) {
			setAssistantInput((previous) =>
				previous.trim()
					? previous
					: t('app.professionalWorldsDraftPrompt', {
							brief: initialProfessionalWorldsDraft.brief,
						})
			);
			setActiveTab('ai');
		} else {
			setActiveTab('setup');
		}
		setNotice({
			tone: 'success',
			message: t('app.professionalWorldsDraftAdded'),
		});
		if (initialProfessionalWorldsDraft.crossAppLinkId && instance?.id) {
			reportProfessionalCrossAppDraftLifecycle(
				initialProfessionalWorldsDraft.crossAppLinkId,
				'updated',
				{ site_instance_id: instance.id }
			);
		}
	}, [
		initialProfessionalWorldsDraft,
		instance,
		loading,
		t,
		setActiveTab,
		appliedProfessionalWorldsDraftRef.current,
		setForm,
		setNotice,
		setAssistantInput,
		appliedProfessionalWorldsDraftRef,
	]);

	useEffect(() => {
		const linkId = initialProfessionalWorldsDraft?.crossAppLinkId;
		if (!linkId || !instance || instance.publication_state !== 'open') {
			return;
		}
		const sig = `${linkId}:${instance.id}:published`;
		if (pwPublishedReportSigRef.current === sig) return;
		pwPublishedReportSigRef.current = sig;
		reportProfessionalCrossAppDraftLifecycle(linkId, 'published', {
			site_instance_id: instance.id,
		});
	}, [
		initialProfessionalWorldsDraft?.crossAppLinkId,
		instance,
		pwPublishedReportSigRef,
	]);

	useEffect(() => {
		if (!instance) return;
		const isForeground = windowSurface.backgroundLevel === 'foreground';
		const baseInterval = isSiteStudioPendingStatus(instance.status)
			? 5000
			: 15000;
		const intervalMs = isForeground ? baseInterval : 60_000;
		const interval = window.setInterval(() => {
			refreshWorkspace().catch(() => undefined);
		}, intervalMs);
		return () => window.clearInterval(interval);
	}, [instance, refreshWorkspace]);

	useEffect(() => {
		if (!catalog) return;
		setImagePrompts((previous) => {
			const next = { ...previous };
			let changed = false;
			for (const slot of catalog.imageSlots) {
				if (!next[slot.slotId]) {
					const existingDraft = safeDrafts.imageDrafts.find(
						(draft) => draft.slotId === slot.slotId
					);
					next[slot.slotId] = existingDraft?.prompt ?? '';
					changed = true;
				}
			}
			return changed ? next : previous;
		});
	}, [catalog, safeDrafts.imageDrafts, setImagePrompts]);

	useEffect(() => {
		return () => {
			cleanupVoiceResources();
		};
	}, [cleanupVoiceResources]);

	useEffect(() => {
		if (!instance) {
			deploySigRef.current = '';
			setDeployLiveText('');
			return;
		}
		const runtime = health?.status === 'running' ? 'running' : instance.status;
		const publication =
			instance.publication_state === 'open'
				? t('header.siteOpen')
				: t('header.siteClosed');
		const publicOk = health?.public_ok
			? t('header.stateOk')
			: t('header.stateOffline');
		const msg = t('aria.statusDeploy', { runtime, publication, publicOk });
		const sig = `${runtime}|${instance.publication_state}|${Boolean(health?.public_ok)}|${Boolean(health?.api_ok)}|${instance.status}`;
		if (sig !== deploySigRef.current) {
			deploySigRef.current = sig;
			setDeployLiveText(msg);
		}
	}, [instance, health, t, deploySigRef, setDeployLiveText]);

	useEffect(() => {
		if (loading || !instance) {
			return;
		}
		const id = `site-studio-panel-${activeTab}`;
		requestAnimationFrame(() => {
			document.getElementById(id)?.focus({ preventScroll: true });
		});
	}, [activeTab, instance, loading]);
}
