/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Single-brain fuzzy ranking for desktop launchers (Quick Search + Start Menu
 * Command Console). Exact / prefix / contains / description / subsequence scoring.
 *
 * Invariants:
 * - Ranking rules must stay identical across consumers (no per-surface forks).
 * - Empty query returns [].
 *
 * Related:
 * - `components/QuickSearch.tsx`, `components/startMenu/StartMenuCommandConsole.tsx`
 */

import type { DesktopItem } from '../types/desktop.types';

export type DesktopLauncherAppHit = {
	item: DesktopItem;
	score: number;
	matches: string[];
};

export type RankDesktopAppsForQueryOptions = {
	/** Max hits after sort (default 10, matching Quick Search). */
	limit?: number;
};

/**
 * Rank desktop items for a free-text query. Shared by Quick Search and Command Console.
 */
export function rankDesktopAppsForQuery(
	searchQuery: string,
	searchItems: DesktopItem[],
	recent: DesktopItem[],
	options?: RankDesktopAppsForQueryOptions
): DesktopLauncherAppHit[] {
	if (!searchQuery) return [];

	const limit = options?.limit ?? 10;
	const q = searchQuery.toLowerCase();
	const recentIndex = new Map(
		recent.map((r, i) => [r.id, recent.length - i] as const)
	);
	const scored: DesktopLauncherAppHit[] = [];

	for (const item of searchItems) {
		const name = item.name.toLowerCase();
		const desc = (item.description || '').toLowerCase();

		let score = 0;
		const matches: string[] = [];

		if (name === q) {
			score = 1000;
			matches.push('exact');
		} else if (name.startsWith(q)) {
			score = 800;
			matches.push('prefix');
		} else if (name.includes(q)) {
			score = 600;
			matches.push('contains');
		} else if (desc.includes(q)) {
			score = 400;
			matches.push('description');
		} else {
			let lastIndex = -1;
			let consecutive = 0;
			let matched = true;

			for (const char of q) {
				const index = name.indexOf(char, lastIndex + 1);
				if (index === -1) {
					matched = false;
					break;
				}
				if (index === lastIndex + 1) consecutive++;
				lastIndex = index;
			}

			if (matched) {
				score = 200 + consecutive * 50;
				matches.push('fuzzy');
			}
		}

		if (score > 0) {
			if (item.type === 'app') score += 100;
			if (item.isPinned) score += 50;
			const recentBoost = recentIndex.get(item.id);
			if (recentBoost != null) score += Math.min(50, recentBoost * 5);

			scored.push({ item, score, matches });
		}
	}

	return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
