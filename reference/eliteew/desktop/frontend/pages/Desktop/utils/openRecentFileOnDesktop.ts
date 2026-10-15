import { parseProjectIdFromDesktopFolderItemId } from '@/pages/ContentManager/projectDesktopFolder';
import { DEFAULT_APPS } from '../constants';
import { isUnifiedContentAudioLike } from './desktopAudioContent';
import type { OpenWindowOptions } from '../hooks/useWindowManager';
import type { DesktopItem, RecentFile } from '../types/desktop.types';

/**
 * Ярлык `DesktopItem` типа `file` → классификация как у API недавних файлов.
 */
export function desktopFileItemToRecentLike(
	item: DesktopItem
): RecentFile | null {
	if (item.type !== 'file') return null;
	const id = item.id?.trim();
	if (!id) return null;

	let type: RecentFile['type'] = 'document';
	const ft = (item.fileType ?? '').toLowerCase();
	const name = item.name.toLowerCase();
	if (ft.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name)) {
		type = 'image';
	} else if (
		ft.startsWith('video/') ||
		/\.(mp4|webm|mov|mkv|avi)$/.test(name)
	) {
		type = 'video';
	} else if (
		isUnifiedContentAudioLike({
			fileType: item.fileType,
			name: item.name,
		})
	) {
		type = 'audio';
	}

	return {
		id,
		name: item.name,
		type,
		path: '',
		openedAt: new Date(),
	};
}

/**
 * Куда направить запуск из «Недавние файлы» (Quick Search / Пуск).
 * `RecentFile.id` — unified content `item_id` с API `/desktop/recent-files`.
 */
export function resolveRecentFileOpenAction(
	file: RecentFile,
	items: DesktopItem[]
): { item: DesktopItem; options?: OpenWindowOptions } | null {
	const id = file.id?.trim();
	if (!id) return null;

	const docItem =
		items.find((i) => i.appComponent === 'DocEditor') ??
		DEFAULT_APPS.find((a) => a.appComponent === 'DocEditor');
	const cmItem =
		items.find((i) => i.appComponent === 'ContentManagerPro') ??
		DEFAULT_APPS.find((a) => a.appComponent === 'ContentManagerPro');

	if (file.type === 'project' && cmItem) {
		return {
			item: cmItem,
			options: {
				initialPayload: {
					contentManagerProjectId: id,
					contentManagerProjectName: file.name?.trim() || undefined,
				},
			},
		};
	}

	if (file.type === 'document' && docItem) {
		return {
			item: docItem,
			options: { initialPayload: { unifiedContentId: id } },
		};
	}

	if (
		(file.type === 'image' ||
			file.type === 'video' ||
			file.type === 'audio' ||
			file.type === 'folder') &&
		cmItem
	) {
		if (file.type === 'folder') {
			const projectId = parseProjectIdFromDesktopFolderItemId(id);
			if (projectId) {
				return {
					item: cmItem,
					options: {
						initialPayload: {
							contentManagerProjectId: projectId,
							contentManagerProjectName: file.name?.trim() || undefined,
						},
					},
				};
			}
		}
		return {
			item: cmItem,
			options: { initialPayload: { contentManagerFolderItemId: id } },
		};
	}

	if (docItem) {
		return {
			item: docItem,
			options: { initialPayload: { unifiedContentId: id } },
		};
	}

	return cmItem
		? {
				item: cmItem,
				options: { initialPayload: { contentManagerFolderItemId: id } },
			}
		: null;
}
