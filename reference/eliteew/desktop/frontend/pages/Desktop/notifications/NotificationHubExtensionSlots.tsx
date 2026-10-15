/**
 * Рендер зарегистрированных расширений для одного слота центра уведомлений.
 */

import * as React from 'react';
import { Fragment, useMemo, useSyncExternalStore } from 'react';

import {
	getNotificationHubExtensionsForSlot,
	getNotificationHubExtensionsSnapshotVersion,
	subscribeNotificationHubExtensions,
	type NotificationHubExtensionContext,
	type NotificationHubExtensionSlot,
} from './notificationHubExtensionRegistry';

export interface NotificationHubExtensionSlotsProps {
	slot: NotificationHubExtensionSlot;
	context: NotificationHubExtensionContext;
	className?: string;
}

export const NotificationHubExtensionSlots: React.FC<
	NotificationHubExtensionSlotsProps
> = ({ slot, context, className }) => {
	const version = useSyncExternalStore(
		subscribeNotificationHubExtensions,
		getNotificationHubExtensionsSnapshotVersion,
		() => 0
	);

	const items = useMemo(() => {
		void version;
		return getNotificationHubExtensionsForSlot(slot);
	}, [slot, version]);

	if (items.length === 0) return null;

	const inner = (
		<>
			{items.map((ext) => (
				<Fragment key={ext.id}>{ext.render(context)}</Fragment>
			))}
		</>
	);

	if (className) {
		return <div className={className}>{inner}</div>;
	}

	return inner;
};

NotificationHubExtensionSlots.displayName = 'NotificationHubExtensionSlots';
