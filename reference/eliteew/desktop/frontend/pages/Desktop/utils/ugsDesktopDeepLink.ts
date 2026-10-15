import {
	extractWorkflowBuilderId,
	isWorkflowBuilderTarget,
} from '../../../utils/workflowBuilderRoute';
import { emitUgsFrontendTelemetry } from '../../../services/api/ugs/telemetry';

export type UGSDesktopView =
	| 'hub'
	| 'dashboard'
	| 'analytics'
	| 'admin'
	| 'builder';

export interface UGSDesktopDeepLink {
	view: UGSDesktopView;
	workflowId?: string | null;
}

export const UGS_DESKTOP_DEEPLINK_STORAGE_KEY = 'eliteew.desktop.deepLink.ugs';
export const UGS_DESKTOP_DEEPLINK_EVENT = 'eliteew:desktop-ugs-deeplink';

export function resolveUgsDesktopDeepLink(
	target: string | null | undefined
): UGSDesktopDeepLink | null {
	if (!target) {
		return null;
	}

	const normalized = String(target).replace(/^#/, '').trim();
	if (!normalized) {
		return null;
	}

	if (isWorkflowBuilderTarget(normalized)) {
		return {
			view: 'builder',
			workflowId: extractWorkflowBuilderId(normalized),
		};
	}

	const page = normalized.split('?')[0]?.trim();
	switch (page) {
		case 'ugs-hub':
			return { view: 'hub' };
		case 'ugs':
			return { view: 'dashboard' };
		case 'ugs-analytics':
			return { view: 'analytics' };
		case 'ugs-admin':
			return { view: 'admin' };
		default:
			return null;
	}
}

export function storeUgsDesktopDeepLink(
	target: string | UGSDesktopDeepLink | null | undefined
): UGSDesktopDeepLink | null {
	if (typeof window === 'undefined') {
		return null;
	}

	const resolved =
		typeof target === 'string' || target == null
			? resolveUgsDesktopDeepLink(target)
			: target;

	if (!resolved) {
		return null;
	}

	try {
		sessionStorage.setItem(
			UGS_DESKTOP_DEEPLINK_STORAGE_KEY,
			JSON.stringify(resolved)
		);
		emitUgsFrontendTelemetry({
			event: 'deep_link_stored',
			view: resolved.view,
			workflowId: resolved.workflowId ?? null,
		});
		window.dispatchEvent(
			new CustomEvent<UGSDesktopDeepLink>(UGS_DESKTOP_DEEPLINK_EVENT, {
				detail: resolved,
			})
		);
	} catch {
		return null;
	}

	return resolved;
}

export function consumeUgsDesktopDeepLink(): UGSDesktopDeepLink | null {
	if (typeof window === 'undefined') {
		return null;
	}

	try {
		const raw = sessionStorage.getItem(UGS_DESKTOP_DEEPLINK_STORAGE_KEY);
		sessionStorage.removeItem(UGS_DESKTOP_DEEPLINK_STORAGE_KEY);
		if (!raw) {
			return null;
		}

		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return null;
		}

		const candidate = parsed as Record<string, unknown>;
		const view = candidate.view;
		if (
			view !== 'hub' &&
			view !== 'dashboard' &&
			view !== 'analytics' &&
			view !== 'admin' &&
			view !== 'builder'
		) {
			return null;
		}

		const resolved: UGSDesktopDeepLink = {
			view: view as UGSDesktopView,
			workflowId:
				typeof candidate.workflowId === 'string' ? candidate.workflowId : null,
		};
		emitUgsFrontendTelemetry({
			event: 'deep_link_consumed',
			view: resolved.view,
			workflowId: resolved.workflowId ?? null,
		});
		return resolved;
	} catch {
		return null;
	}
}
