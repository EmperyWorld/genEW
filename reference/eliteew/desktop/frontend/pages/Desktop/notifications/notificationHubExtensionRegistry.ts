/**
 * Расширяемые слоты для UI центра уведомлений (`NotificationHubBody`).
 * Регистрируйте модули на старте приложения (side-effect import) или из фичи после загрузки.
 *
 * @example
 * ```ts
 * import { registerNotificationHubExtension } from '@/pages/Desktop/notifications';
 *
 * registerNotificationHubExtension({
 *   id: 'my-feature:hub-card',
 *   slot: 'hubSettingsAfter',
 *   order: 50,
 *   render: (ctx) => <MyCard density={ctx.density} />,
 * });
 * ```
 */

import type { ReactNode } from 'react';

import type { Notification } from '@/notifications';

export type NotificationHubDensity = 'panel' | 'window';

export type NotificationHubExtensionSlot =
	/** Окно: над блоком быстрых настроек (QuickSettings). */
	| 'hubSettingsBefore'
	/** Окно: сразу после QuickSettings и доменных секций (GAF/UGS). */
	| 'hubSettingsAfter'
	/** Компактная панель таскбара: под фильтрами, над списком. */
	| 'hubPanelFooter'
	/** Окно: над лентой уведомлений (внутри области прокрутки). */
	| 'hubFeedStart'
	/** Окно: под лентой, над нижней панелью «прочитать все / очистить». */
	| 'hubFeedEnd';

export interface NotificationHubExtensionContext {
	density: NotificationHubDensity;
	notifications: readonly Notification[];
	unreadCount: number;
	actions: {
		markAsRead: (id: string) => void;
		markAllAsRead: () => void;
		dismiss: (id: string) => void;
		clearAll: () => void;
	};
}

export interface NotificationHubExtension {
	/** Уникальный id (например `feature:widget-name`). */
	id: string;
	/** Меньше — раньше в списке слота. По умолчанию 100. */
	order?: number;
	slot: NotificationHubExtensionSlot;
	render: (ctx: NotificationHubExtensionContext) => ReactNode;
}

const byId = new Map<string, NotificationHubExtension>();

const listeners = new Set<() => void>();
let snapshotVersion = 0;

export function getNotificationHubExtensionsSnapshotVersion(): number {
	return snapshotVersion;
}

function bump(): void {
	snapshotVersion += 1;
	for (const l of listeners) {
		l();
	}
}

/** Подписка для `useSyncExternalStore` — UI обновится при регистрации/снятии расширения. */
export function subscribeNotificationHubExtensions(
	onStoreChange: () => void
): () => void {
	listeners.add(onStoreChange);
	return () => {
		listeners.delete(onStoreChange);
	};
}

export function getNotificationHubExtensionsForSlot(
	slot: NotificationHubExtensionSlot
): NotificationHubExtension[] {
	return [...byId.values()]
		.filter((e) => e.slot === slot)
		.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/**
 * Регистрирует блок UI в слоте. Возвращает функцию отмены.
 * Повторная регистрация с тем же `id` заменяет предыдущую.
 */
export function registerNotificationHubExtension(
	ext: NotificationHubExtension
): () => void {
	byId.set(ext.id, ext);
	bump();
	return () => {
		if (byId.get(ext.id) === ext) {
			byId.delete(ext.id);
			bump();
		}
	};
}

export function unregisterNotificationHubExtension(id: string): void {
	if (byId.delete(id)) {
		bump();
	}
}
