import { formatEventAddress } from "@streets/core/nostr/address";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { AddressRequests } from "@streets/core/read/address-requests";
import type { EngagementRequests } from "@streets/core/read/engagement-requests";
import type { EventRequests } from "@streets/core/read/event-requests";
import { EventStore } from "@streets/core/read/event-store";
import { createReadLookups } from "@streets/core/read/lookups";
import type { PollRequests } from "@streets/core/read/poll-requests";
import type { ProfileRequests } from "@streets/core/read/profile-requests";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { ReadAccess } from "../../read-layer";

const SAMPLE_RELAY = "wss://sample.invalid/" as RelayUrl;

/** 取りにいかない要求器。手元に無いものは、届かないまま待つ。 */
export const inertRequests = (): ProfileRequests & EngagementRequests => ({
  request() {},
  forget() {},
  subscribe: () => () => {},
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

/** 手元に無いものは、要求の後で見つからなかったことにする。読み込み中のまま残さない。 */
const missingRequests = <K>(): {
  request: (key: K) => void;
  isUnresolved: (key: K) => boolean;
  subscribe: (listener: () => void) => () => void;
} => {
  const listeners = new Set<() => void>();
  const requested = new Set<K>();
  return {
    request(key) {
      requested.add(key);
      queueMicrotask(() => {
        for (const listener of listeners) listener();
      });
    },
    isUnresolved: (key) => requested.has(key),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

/**
 * 見本のイベントだけを持つ読み取り層。リレーには繋がず、アプリの store とも分ける ——
 * 見本が本物の投稿や通知に混ざらないように。
 */
export const createSampleReadAccess = (
  events: readonly NostrEvent[],
): ReadAccess => {
  const store = new EventStore();
  for (const event of events) store.put(event, SAMPLE_RELAY);
  const eventIds = missingRequests<string>();
  const addresses = missingRequests<string>();
  const polls = new Set<string>();
  const eventRequests: EventRequests = {
    request: (id) => eventIds.request(id),
    isUnresolved: (id) => !store.get(id) && eventIds.isUnresolved(id),
    forget() {},
    subscribe: eventIds.subscribe,
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {},
  };
  const addressRequests: AddressRequests = {
    request: (address) => addresses.request(formatEventAddress(address)),
    isUnresolved: (address) =>
      !store.latestReplaceable(
        address.kind,
        address.pubkey,
        address.identifier,
      ) && addresses.isUnresolved(formatEventAddress(address)),
    subscribe: addresses.subscribe,
    dispose() {},
  };
  const pollRequests: PollRequests = {
    request: (id) => polls.add(id),
    isSettled: (id) => polls.has(id),
    forget() {},
    subscribe: () => () => {},
    dispose() {},
  };
  return {
    store,
    lookups: createReadLookups({
      store,
      events: eventRequests,
      addresses: addressRequests,
      profiles: inertRequests(),
      engagements: inertRequests(),
      polls: pollRequests,
      followLists: { request() {}, dispose() {} },
    }),
  };
};
