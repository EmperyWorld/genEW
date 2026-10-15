import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ugsTypesCreativeStudioQueryOptions } from '@/services/api/ugsQueryOptions';

/**
 * UGS generation_types cost_credits for creative studio buttons (Image / Video / Music).
 */
export function useCreativeStudioUgsCosts() {
	const q = useQuery(ugsTypesCreativeStudioQueryOptions());

	const costByTypeKey = useMemo(() => {
		const m = new Map<string, number>();
		for (const t of q.data ?? []) {
			if (t.type_key != null && t.cost_credits != null) {
				const n = Number(t.cost_credits);
				if (!Number.isNaN(n)) m.set(t.type_key, n);
			}
		}
		return m;
	}, [q.data]);

	const energyLine = (typeKey: string) => {
		const c = costByTypeKey.get(typeKey);
		if (c == null) return null;
		return `${c} ⚡ энергии`;
	};

	return {
		costByTypeKey,
		energyLine,
		isLoading: q.isLoading,
	};
}
