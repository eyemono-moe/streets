import type { NostrEvent } from "nostr-tools";
import type { StoreUnsubscribe } from "./event-store";
import type {
  FeedItem,
  FeedSnapshot,
  FeedStateStore,
  FeedStatus,
  FeedStatusOptions,
} from "./feed-state-store";

type MutableFeedSnapshot = {
  feedId: string;
  items: FeedItem[];
  eventIds: string[];
  status: FeedStatus;
  error?: string;
  oldestCreatedAt?: number;
  newestCreatedAt?: number;
  hasMoreBackfill: boolean;
  eoseRelays: string[];
  activeRelays: string[];
};

const createSnapshot = (feedId: string): MutableFeedSnapshot => ({
  feedId,
  items: [],
  eventIds: [],
  status: "idle",
  hasMoreBackfill: true,
  eoseRelays: [],
  activeRelays: [],
});

const cloneSnapshot = (snapshot: MutableFeedSnapshot): FeedSnapshot => ({
  ...snapshot,
  items: snapshot.items.map((item) => ({ ...item })),
  eventIds: snapshot.items.map((item) => item.eventId),
  eoseRelays: [...snapshot.eoseRelays],
  activeRelays: [...snapshot.activeRelays],
});

export class MemoryFeedStateStore implements FeedStateStore {
  readonly #feeds = new Map<string, MutableFeedSnapshot>();
  readonly #listeners = new Map<string, Set<() => void>>();

  getSnapshot(feedId: string): FeedSnapshot {
    return cloneSnapshot(this.#getOrCreate(feedId));
  }

  subscribe(feedId: string, listener: () => void): StoreUnsubscribe {
    const listeners = this.#listeners.get(feedId) ?? new Set<() => void>();
    listeners.add(listener);
    this.#listeners.set(feedId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.#listeners.delete(feedId);
      }
    };
  }

  addItem(feedId: string, event: NostrEvent): void {
    const snapshot = this.#getOrCreate(feedId);
    if (snapshot.items.some((item) => item.eventId === event.id)) {
      return;
    }

    snapshot.items.push({ eventId: event.id, createdAt: event.created_at });
    snapshot.items.sort(
      (left, right) =>
        right.createdAt - left.createdAt ||
        right.eventId.localeCompare(left.eventId),
    );
    snapshot.eventIds = snapshot.items.map((item) => item.eventId);

    snapshot.oldestCreatedAt =
      snapshot.oldestCreatedAt === undefined
        ? event.created_at
        : Math.min(snapshot.oldestCreatedAt, event.created_at);
    snapshot.newestCreatedAt =
      snapshot.newestCreatedAt === undefined
        ? event.created_at
        : Math.max(snapshot.newestCreatedAt, event.created_at);

    this.#notify(feedId);
  }

  setStatus(
    feedId: string,
    status: FeedStatus,
    options: FeedStatusOptions = {},
  ): void {
    const snapshot = this.#getOrCreate(feedId);
    snapshot.status = status;
    snapshot.error = options.error;
    if (options.hasMoreBackfill !== undefined) {
      snapshot.hasMoreBackfill = options.hasMoreBackfill;
    }
    if (options.eoseRelays) {
      snapshot.eoseRelays = [...options.eoseRelays];
    }
    if (options.activeRelays) {
      snapshot.activeRelays = [...options.activeRelays];
    }
    this.#notify(feedId);
  }

  removeFeed(feedId: string): void {
    this.#feeds.delete(feedId);
    this.#notify(feedId);
  }

  #getOrCreate(feedId: string) {
    const current = this.#feeds.get(feedId);
    if (current) {
      return current;
    }
    const created = createSnapshot(feedId);
    this.#feeds.set(feedId, created);
    return created;
  }

  #notify(feedId: string) {
    const listeners = this.#listeners.get(feedId);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener();
    }
  }
}
