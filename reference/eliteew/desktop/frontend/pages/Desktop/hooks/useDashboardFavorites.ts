/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Load and mutate dashboard favorites for the widgets panel via Desktop API,
 * with localStorage fallback when the API is unavailable.
 *
 * Invariants:
 * - Fallback rows are marked local-only in UI (`isLocalOnly`).
 * - Online reorder persists via PATCH `/favorites/reorder`.
 *
 * Related:
 * - `pages/Desktop/components/DashboardFavoritesSlotBody.tsx`
 * - `pages/Desktop/components/DesktopDashboardFavoritesApp.tsx`
 */

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../contexts/AuthContext';
import { STORAGE_KEYS } from '../constants';
import {
	createDashboardFavorite,
	deleteDashboardFavorite,
	getDashboardFavorites,
	reorderDashboardFavorites,
	type DashboardFavoriteCreate,
	type DashboardFavoriteResponse,
} from '../services/desktopApi';
import { enqueueDesktopWidgetOutboxOp } from '../utils/desktopWidgetOutboxQueue';

const FAVORITES_QUERY_KEY = ['desktop', 'dashboard-favorites'] as const;

export interface DashboardFavoriteItem {
	id: string;
	title: string;
	url: string;
	icon: string;
	color: string;
	sortOrder: number;
	createdAt: Date;
}

function apiFavoriteToItem(
	row: DashboardFavoriteResponse
): DashboardFavoriteItem {
	return {
		id: row.id,
		title: row.title,
		url: row.url,
		icon: row.icon,
		color: row.color,
		sortOrder: row.sort_order,
		createdAt: new Date(row.created_at),
	};
}

function sortFavoritesByOrder(
	items: DashboardFavoriteItem[]
): DashboardFavoriteItem[] {
	return [...items].sort((a, b) => {
		if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
		return a.createdAt.getTime() - b.createdAt.getTime();
	});
}

function reorderFavoritesList(
	items: DashboardFavoriteItem[],
	fromIndex: number,
	toIndex: number
): DashboardFavoriteItem[] {
	if (
		fromIndex < 0 ||
		toIndex < 0 ||
		fromIndex >= items.length ||
		toIndex >= items.length ||
		fromIndex === toIndex
	) {
		return items;
	}
	const next = [...items];
	const [moved] = next.splice(fromIndex, 1);
	if (!moved) return items;
	next.splice(toIndex, 0, moved);
	return next.map((item, index) => ({ ...item, sortOrder: index }));
}

function loadFavoritesFromStorage(): DashboardFavoriteItem[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.WIDGET_FAVORITES);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as Array<{
			id: string;
			title: string;
			url?: string;
			icon?: string;
			color?: string;
			sortOrder?: number;
			createdAt: string;
		}>;
		return sortFavoritesByOrder(
			parsed.map((row) => ({
				id: row.id,
				title: row.title,
				url: row.url ?? '#',
				icon: row.icon ?? '⭐',
				color: row.color ?? 'from-pink-500/20 to-rose-500/20',
				sortOrder: row.sortOrder ?? 0,
				createdAt: new Date(row.createdAt),
			}))
		);
	} catch {
		return [];
	}
}

function saveFavoritesToStorage(items: DashboardFavoriteItem[]): boolean {
	try {
		localStorage.setItem(
			STORAGE_KEYS.WIDGET_FAVORITES,
			JSON.stringify(
				items.map((item) => ({
					id: item.id,
					title: item.title,
					url: item.url,
					icon: item.icon,
					color: item.color,
					sortOrder: item.sortOrder,
					createdAt: item.createdAt.toISOString(),
				}))
			)
		);
		return true;
	} catch {
		return false;
	}
}

export interface UseDashboardFavoritesReturn {
	favorites: DashboardFavoriteItem[];
	isLocalOnly: boolean;
	storageWriteFailed: boolean;
	isLoading: boolean;
	error: Error | null;
	addFavorite: (fields: DashboardFavoriteCreate) => void;
	removeFavorite: (id: string) => void;
	reorderFavorites: (fromIndex: number, toIndex: number) => void;
	isMutating: boolean;
}

export function useDashboardFavorites(): UseDashboardFavoritesReturn {
	const queryClient = useQueryClient();
	const { user: authUser } = useAuth();
	const outboxSubject = authUser?.id ?? null;
	const [isLocalOnly, setIsLocalOnly] = useState(false);
	const [storageWriteFailed, setStorageWriteFailed] = useState(false);
	const [localFavorites, setLocalFavorites] = useState<DashboardFavoriteItem[]>(
		[]
	);

	const favoritesQuery = useQuery({
		queryKey: FAVORITES_QUERY_KEY,
		queryFn: async () => {
			const data = await getDashboardFavorites();
			return sortFavoritesByOrder(data.map((row) => apiFavoriteToItem(row)));
		},
		retry: 1,
		refetchOnWindowFocus: false,
	});

	const createMut = useMutation({
		mutationFn: createDashboardFavorite,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY });
		},
	});

	const deleteMut = useMutation({
		mutationFn: deleteDashboardFavorite,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY });
		},
	});

	const reorderMut = useMutation({
		mutationFn: reorderDashboardFavorites,
	});

	useEffect(() => {
		if (favoritesQuery.isError) {
			setIsLocalOnly(true);
			setLocalFavorites(loadFavoritesFromStorage());
			console.warn(
				'[DashboardFavorites] API failed, using localStorage fallback',
				favoritesQuery.error
			);
			return;
		}
		setIsLocalOnly(false);
	}, [favoritesQuery.error, favoritesQuery.isError]);

	const addFavorite = useCallback(
		(fields: DashboardFavoriteCreate) => {
			const title = fields.title.trim();
			if (!title) return;
			if (isLocalOnly) {
				const next: DashboardFavoriteItem = {
					id: `fav-${Date.now()}`,
					title,
					url: fields.url?.trim() || '#',
					icon: fields.icon?.trim() || '⭐',
					color: fields.color?.trim() || 'from-pink-500/20 to-rose-500/20',
					sortOrder: localFavorites.length,
					createdAt: new Date(),
				};
				const merged = [...localFavorites, next];
				setLocalFavorites(merged);
				setStorageWriteFailed(!saveFavoritesToStorage(merged));
				if (outboxSubject) {
					enqueueDesktopWidgetOutboxOp(outboxSubject, {
						kind: 'favorite_create',
						client_id: next.id,
						payload: {
							title: next.title,
							url: next.url,
							icon: next.icon,
							color: next.color,
						},
					});
				}
				return;
			}
			createMut.mutate({
				title,
				url: fields.url?.trim() || '#',
				icon: fields.icon?.trim() || '⭐',
				color: fields.color?.trim() || 'from-pink-500/20 to-rose-500/20',
			});
		},
		[isLocalOnly, localFavorites, createMut, outboxSubject]
	);

	const removeFavorite = useCallback(
		(id: string) => {
			if (isLocalOnly) {
				const next = localFavorites.filter((row) => row.id !== id);
				setLocalFavorites(next);
				setStorageWriteFailed(!saveFavoritesToStorage(next));
				if (outboxSubject) {
					enqueueDesktopWidgetOutboxOp(outboxSubject, {
						kind: 'favorite_delete',
						server_id: id,
						payload: {},
					});
				}
				return;
			}
			deleteMut.mutate(id);
		},
		[isLocalOnly, localFavorites, deleteMut, outboxSubject]
	);

	const reorderFavorites = useCallback(
		(fromIndex: number, toIndex: number) => {
			if (isLocalOnly) {
				setLocalFavorites((prev) => {
					const reordered = reorderFavoritesList(prev, fromIndex, toIndex);
					if (reordered === prev) return prev;
					setStorageWriteFailed(!saveFavoritesToStorage(reordered));
					if (outboxSubject) {
						enqueueDesktopWidgetOutboxOp(outboxSubject, {
							kind: 'favorite_reorder',
							payload: {
								favorite_ids: reordered.map((item) => item.id),
							},
						});
					}
					return reordered;
				});
				return;
			}

			const current = sortFavoritesByOrder(
				queryClient.getQueryData<DashboardFavoriteItem[]>(
					FAVORITES_QUERY_KEY
				) ?? []
			);
			const reordered = reorderFavoritesList(current, fromIndex, toIndex);
			if (reordered === current) return;

			const previous = current;
			queryClient.setQueryData(FAVORITES_QUERY_KEY, reordered);
			reorderMut.mutate(
				reordered.map((item) => item.id),
				{
					onError: () => {
						queryClient.setQueryData(FAVORITES_QUERY_KEY, previous);
					},
				}
			);
		},
		[isLocalOnly, queryClient, reorderMut, outboxSubject]
	);

	const favorites = sortFavoritesByOrder(
		isLocalOnly ? localFavorites : (favoritesQuery.data ?? [])
	);

	return {
		favorites,
		isLocalOnly,
		storageWriteFailed,
		isLoading: favoritesQuery.isLoading && !isLocalOnly,
		error: favoritesQuery.error instanceof Error ? favoritesQuery.error : null,
		addFavorite,
		removeFavorite,
		reorderFavorites,
		isMutating:
			createMut.isPending || deleteMut.isPending || reorderMut.isPending,
	};
}

export function openDashboardFavoriteUrl(url: string): void {
	const trimmed = url.trim();
	if (!trimmed || trimmed === '#') return;
	if (/^(https?|mailto|tel):/i.test(trimmed)) {
		window.open(trimmed, '_blank', 'noopener,noreferrer');
		return;
	}
	if (trimmed.startsWith('/')) {
		window.open(trimmed, '_blank', 'noopener,noreferrer');
		return;
	}
	if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) {
		window.open(`https://${trimmed}`, '_blank', 'noopener,noreferrer');
	}
}
