import { EventClient } from "@tanstack/devtools-event-client";
import type { QueryRegistrySnapshot } from "../../../core/query/query-registry";
import type { NostrCoreConnectionStateMap } from "../../../core/solid/provider";
import type { EventStoreSnapshot } from "../../../core/store/event-store";
import type { FeedSnapshot } from "../../../core/store/feed-state-store";

export const NOSTR_CORE_DEVTOOLS_PLUGIN_ID = "streets-nostr-core";

export type NostrCoreDevtoolsSnapshot = {
  eventStore: EventStoreSnapshot;
  feeds: readonly FeedSnapshot[];
  queryRegistry: QueryRegistrySnapshot;
  connectionState: NostrCoreConnectionStateMap;
  updatedAt: number;
};

export type NostrCoreDevtoolsEvents = {
  "snapshot-changed": NostrCoreDevtoolsSnapshot;
  "request-snapshot": undefined;
};

class NostrCoreDevtoolsClient extends EventClient<NostrCoreDevtoolsEvents> {
  constructor() {
    super({ pluginId: NOSTR_CORE_DEVTOOLS_PLUGIN_ID });
  }
}

export const nostrCoreDevtoolsClient = new NostrCoreDevtoolsClient();
