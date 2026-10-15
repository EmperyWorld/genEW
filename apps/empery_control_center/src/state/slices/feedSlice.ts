import type { StateCreator } from "zustand";
import type { FeedItemDTO } from "@/api/types";
import type { EccStore } from "@/state/store";

const FEED_CAP = 500;

export interface FeedSlice {
  items: FeedItemDTO[];
  correlationId: string | null;
  appendFeedItem: (item: FeedItemDTO) => void;
  setFeedItems: (items: FeedItemDTO[]) => void;
  setCorrelationId: (id: string | null) => void;
}

export const createFeedSlice: StateCreator<EccStore, [], [], FeedSlice> = (
  set,
) => ({
  items: [],
  correlationId: null,
  appendFeedItem: (item) =>
    set((s) => {
      const next = [...s.items, item];
      if (next.length > FEED_CAP) {
        return { items: next.slice(next.length - FEED_CAP) };
      }
      return { items: next };
    }),
  setFeedItems: (items) => set({ items }),
  setCorrelationId: (id) => set({ correlationId: id }),
});
