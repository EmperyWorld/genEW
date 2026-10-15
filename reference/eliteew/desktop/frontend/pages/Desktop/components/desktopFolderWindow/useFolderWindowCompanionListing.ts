/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Debounced companion shell_context plaintext listing from folder window library + nested rows.
 *
 * Invariants:
 * - Payload capped at 3600 chars; optional when parent omits onUpdatePayload.
 *
 * Related:
 * - DesktopFolderWindow.tsx · WindowInitialPayload.companionListingPlain
 */

import { useEffect } from 'react';
import type { FolderFileItem } from '../../hooks/useFolderContents';
import type { DesktopItem } from '../../types/desktop.types';
import type { WindowInitialPayload } from '../../types/desktop.types';

export interface UseFolderWindowCompanionListingOptions {
	onUpdatePayload?: (
		payload: Pick<WindowInitialPayload, 'companionListingPlain'>
	) => void;
	folderId: string | undefined;
	path: string[] | undefined;
	title: string;
	folderFiles: FolderFileItem[] | undefined;
	folderTotal: number;
	folderFilesLoading: boolean;
	folderHasMore: boolean;
	nestedDesktopItems: DesktopItem[];
}

export function useFolderWindowCompanionListing({
	onUpdatePayload,
	folderId,
	path,
	title,
	folderFiles,
	folderTotal,
	folderFilesLoading,
	folderHasMore,
	nestedDesktopItems,
}: UseFolderWindowCompanionListingOptions) {
	useEffect(() => {
		if (!onUpdatePayload) return;
		const tid = window.setTimeout(() => {
			const folderLabel =
				path?.length && path.length > 0
					? path.join(' / ')
					: title.trim() || 'Folder';
			const lines: string[] = [`[Desktop folder] ${folderLabel}`];
			const fid = typeof folderId === 'string' ? folderId.trim() : '';
			if (fid) lines.push(`folder_item=${fid}`);
			if (folderFilesLoading) {
				lines.push('(loading)');
			} else {
				const list = folderFiles ?? [];
				lines.push(
					`Listed: ${list.length} of ${folderTotal} (search/sort/filter)`
				);
				const slice = list.slice(0, 55);
				for (const f of slice) {
					const nm = String(f.name || f.original_filename || f.id || '')
						.replace(/\s+/g, ' ')
						.trim()
						.slice(0, 200);
					if (!nm) continue;
					const ct = String(f.content_type ?? '')
						.trim()
						.slice(0, 40);
					const cid = typeof f.id === 'string' ? f.id.trim().slice(0, 128) : '';
					lines.push(
						`- ${nm}${ct ? ` [${ct}]` : ''}${cid ? ` uc=${cid}` : ''}`
					);
				}
				const nested = nestedDesktopItems.slice(0, 20);
				if (nested.length > 0) {
					lines.push(`Nested on desktop: ${nested.length}`);
					for (const n of nested) {
						const nm = String(n.name || n.id || '')
							.replace(/\s+/g, ' ')
							.trim()
							.slice(0, 120);
						if (!nm) continue;
						lines.push(`- [${n.type}] ${nm}`);
					}
				}
				if (folderHasMore || slice.length < folderTotal) {
					lines.push('… (truncated or more pages)');
				}
			}
			const text = lines.join('\n').slice(0, 3600);
			onUpdatePayload({ companionListingPlain: text });
		}, 900);
		return () => window.clearTimeout(tid);
	}, [
		onUpdatePayload,
		folderId,
		path,
		title,
		folderFiles,
		folderTotal,
		folderFilesLoading,
		folderHasMore,
		nestedDesktopItems,
	]);
}
