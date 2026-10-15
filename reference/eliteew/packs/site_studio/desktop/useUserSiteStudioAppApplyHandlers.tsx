import { lazy, useCallback } from 'react';
import {
	applySiteStudioContentDraft,
	applySiteStudioImageDraft,
	applySiteStudioSeoDraft,
	getSiteStudioDrafts,
	getSiteStudioInstance,
	provisionSiteStudioInstance,
	startSiteStudioInstance,
	type SiteStudioContentDraft,
	type SiteStudioImageDraft,
	type SiteStudioInstance,
	type SiteStudioSeoDraft,
} from './api';
import { getSiteStudioUserFacingMessage } from './siteStudioUserError';

const _ImperorGPanelLazy = lazy(() =>
	import('./components/ImperorG/ImperorGPanel').then((m) => ({
		default: m.ImperorGPanel,
	}))
);

import { deriveDraftStateFromInstance } from './userSiteStudioAppModel';

export type UserSiteStudioAppApplyDeps = Record<string, any>;

export function useUserSiteStudioAppApplyHandlers(
	deps: UserSiteStudioAppApplyDeps
) {
	const {
		t,
		safeDrafts,
		draftApplyReports,
		setDraftApplyReports,
		setNotice,
		runPanelTask,
		refreshWorkspace,
		handleRunAction,
	} = deps;

	const handleApplyContentDraft = useCallback(
		async (draft: SiteStudioContentDraft) => {
			await runPanelTask(
				'content',
				`apply-content:${draft.id}`,
				async () => {
					const report = await applySiteStudioContentDraft(draft);
					setDraftApplyReports((previous) => ({
						...previous,
						[draft.id]: report,
					}));
					setNotice({
						tone: 'success',
						message: t('app.contentDraftApplied', { title: draft.title }),
					});
					return true;
				},
				t('app.contentDraftApplyFailed')
			);
		},
		[runPanelTask, t, setDraftApplyReports, setNotice]
	);

	const handleApplySeoDraft = useCallback(
		async (draft: SiteStudioSeoDraft) => {
			await runPanelTask(
				'content',
				`apply-seo:${draft.id}`,
				async () => {
					const report = await applySiteStudioSeoDraft(draft);
					setDraftApplyReports((previous) => ({
						...previous,
						[draft.id]: report,
					}));
					setNotice({
						tone: 'success',
						message: t('app.seoDraftApplied', { title: draft.title }),
					});
					return true;
				},
				t('app.seoDraftApplyFailed')
			);
		},
		[runPanelTask, t, setDraftApplyReports, setNotice]
	);

	const handleApplyImageDraft = useCallback(
		async (draft: SiteStudioImageDraft) => {
			await runPanelTask(
				'media',
				`apply-image:${draft.id}`,
				async () => {
					const report = await applySiteStudioImageDraft(draft);
					setDraftApplyReports((previous) => ({
						...previous,
						[draft.id]: report,
					}));
					setNotice({
						tone: 'success',
						message: t('app.imageApplied', { title: draft.title }),
					});
					return true;
				},
				t('errors.applyImageFailed')
			);
		},
		[runPanelTask, t, setNotice, setDraftApplyReports]
	);

	const waitForSiteRunning = useCallback(
		async (maxWaitMs = 300_000): Promise<SiteStudioInstance> => {
			const deadline = Date.now() + maxWaitMs;
			while (Date.now() < deadline) {
				const inst = await getSiteStudioInstance();
				if (!inst) throw new Error(t('errors.waitInstanceNotFound'));
				if (inst.status === 'running') return inst;
				if (inst.last_error)
					throw new Error(
						t('errors.waitLaunchFailed', { message: inst.last_error })
					);
				await new Promise((r) => setTimeout(r, 4000));
			}
			throw new Error(t('errors.waitTimeout'));
		},
		[t]
	);

	const handleImperorGApplyAll = useCallback(async () => {
		let current = await getSiteStudioInstance();
		if (!current) throw new Error(t('errors.imperorLoadState'));

		if (current.status !== 'running') {
			const pending = ['provisioning', 'starting', 'redeploying'];
			if (!pending.includes(current.status)) {
				if (!current.compose_file_path) {
					await provisionSiteStudioInstance();
				} else {
					await startSiteStudioInstance();
				}
			}
			setNotice({ tone: 'success', message: t('app.noticeWaitingForRuntime') });
			current = await waitForSiteRunning();
		}

		await refreshWorkspace();
		const draftsPack = await getSiteStudioDrafts().catch(() =>
			deriveDraftStateFromInstance(current)
		);
		const errors: string[] = [];
		for (const d of draftsPack.contentDrafts) {
			try {
				const report = await applySiteStudioContentDraft(d);
				setDraftApplyReports((previous) => ({ ...previous, [d.id]: report }));
			} catch (e: unknown) {
				const mapped = getSiteStudioUserFacingMessage(e, t);
				errors.push(
					`content "${d.title}": ${mapped ?? (e instanceof Error ? e.message : String(e))}`
				);
			}
		}
		for (const d of draftsPack.seoDrafts) {
			try {
				const report = await applySiteStudioSeoDraft(d);
				setDraftApplyReports((previous) => ({ ...previous, [d.id]: report }));
			} catch (e: unknown) {
				const mapped = getSiteStudioUserFacingMessage(e, t);
				errors.push(
					`seo "${d.title}": ${mapped ?? (e instanceof Error ? e.message : String(e))}`
				);
			}
		}
		for (const d of draftsPack.imageDrafts) {
			try {
				const report = await applySiteStudioImageDraft(d);
				setDraftApplyReports((previous) => ({ ...previous, [d.id]: report }));
			} catch (e: unknown) {
				const mapped = getSiteStudioUserFacingMessage(e, t);
				errors.push(
					`image "${d.title}": ${mapped ?? (e instanceof Error ? e.message : String(e))}`
				);
			}
		}
		await refreshWorkspace();
		if (errors.length) {
			setNotice({
				tone: 'error',
				message: t('errors.applyDraftsPartial', {
					summary: errors.join('; ').slice(0, 300),
				}),
			});
			throw new Error(errors.join('; '));
		}
		setNotice({ tone: 'success', message: t('app.draftsApplyAllSuccess') });
	}, [
		refreshWorkspace,
		t,
		waitForSiteRunning,
		setNotice,
		setDraftApplyReports,
	]);

	const handleImperorGApplyAndLaunch = useCallback(async () => {
		await handleImperorGApplyAll();
		setNotice({
			tone: 'success',
			message: t('app.draftsApplyLaunchSuccess'),
		});
	}, [handleImperorGApplyAll, t, setNotice]);

	return {
		handleApplyContentDraft,
		handleApplySeoDraft,
		handleApplyImageDraft,
		waitForSiteRunning,
		handleImperorGApplyAll,
		handleImperorGApplyAndLaunch,
	};
}
