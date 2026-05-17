import { type NostrEvent, kinds } from "nostr-tools";
import type { EventStore, StoreUnsubscribe } from "../store/event-store";

export type ProfileView = {
  getProfile(pubkey: string): NostrEvent | undefined;
  listProfiles(): NostrEvent[];
  subscribe(listener: () => void): StoreUnsubscribe;
};

const compareNewestFirst = (left: NostrEvent, right: NostrEvent) =>
  right.created_at - left.created_at || right.id.localeCompare(left.id);

export class EventStoreProfileView implements ProfileView {
  constructor(readonly eventStore: EventStore) {}

  getProfile(pubkey: string): NostrEvent | undefined {
    return this.eventStore.getLatestReplaceable(kinds.Metadata, pubkey);
  }

  listProfiles(): NostrEvent[] {
    return this.eventStore
      .queryEvents({ kinds: [kinds.Metadata] })
      .sort(compareNewestFirst);
  }

  subscribe(listener: () => void): StoreUnsubscribe {
    return this.eventStore.subscribe(listener);
  }
}
