import type { NostrEvent } from "nostr-tools";
import type { RelayUrl, StoreUnsubscribe } from "./event-store";

export type FeedStatus = "idle" | "loading" | "live" | "complete" | "error";

export type FeedItem = {
  eventId: string;
  createdAt: number;
};

export type FeedSnapshot = {
  feedId: string;
  items: readonly FeedItem[];
  eventIds: readonly string[];
  status: FeedStatus;
  error?: string;
  oldestCreatedAt?: number;
  newestCreatedAt?: number;
  hasMoreBackfill: boolean;
  eoseRelays: readonly RelayUrl[];
  activeRelays: readonly RelayUrl[];
};

export type FeedStatusOptions = {
  error?: string;
  hasMoreBackfill?: boolean;
  eoseRelays?: readonly RelayUrl[];
  activeRelays?: readonly RelayUrl[];
};

export interface FeedStateStore {
  getSnapshot(feedId: string): FeedSnapshot;
  listSnapshots(): readonly FeedSnapshot[];
  subscribe(feedId: string, listener: () => void): StoreUnsubscribe;
  subscribeAll(listener: () => void): StoreUnsubscribe;
  addItem(feedId: string, event: NostrEvent): void;
  setStatus(
    feedId: string,
    status: FeedStatus,
    options?: FeedStatusOptions,
  ): void;
  removeFeed(feedId: string): void;
}
