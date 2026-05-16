import type { RxNostr } from "rx-nostr";
import {
  type ParentComponent,
  createContext,
  createMemo,
  onCleanup,
  useContext,
} from "solid-js";
import {
  type NostrCoreQueryClient,
  createNostrCoreQueryClient,
} from "../query/query-client";
import { createQueryRegistry } from "../query/query-registry";
import type { QueryRegistry } from "../query/query-registry";
import { MemoryNostrRepository } from "../repository/memory-repository";
import type { NostrRepository } from "../repository/nostr-repository";
import type { EventStore } from "../store/event-store";
import type { FeedStateStore } from "../store/feed-state-store";
import { MemoryFeedStateStore } from "../store/memory-feed-state-store";
import { RxNostrTransport } from "../transport/rx-nostr-transport";
import type { NostrTransport } from "../transport/transport";
import { EventStoreProfileView, type ProfileView } from "../view/profile-view";

export type NostrCore = {
  transport: NostrTransport;
  repository: NostrRepository;
  eventStore: EventStore;
  feedStateStore: FeedStateStore;
  profileView: ProfileView;
  queryRegistry: QueryRegistry;
  queryClient: NostrCoreQueryClient;
  dispose(): void;
};

export type CreateNostrCoreOptions = {
  rxNostr: RxNostr;
  repository?: NostrRepository;
  eventStore?: EventStore;
  feedStateStore?: FeedStateStore;
  profileView?: ProfileView;
  queryRegistry?: QueryRegistry;
  queryClient?: NostrCoreQueryClient;
};

export const createNostrCore = ({
  rxNostr,
  repository,
  eventStore,
  feedStateStore,
  profileView,
  queryRegistry,
  queryClient,
}: CreateNostrCoreOptions): NostrCore => {
  const resolvedRepository =
    repository ?? new MemoryNostrRepository(eventStore);
  const resolvedEventStore =
    eventStore ??
    (resolvedRepository instanceof MemoryNostrRepository
      ? resolvedRepository.eventStore
      : undefined);
  if (!resolvedEventStore) {
    throw new Error(
      "createNostrCore requires eventStore when repository does not expose one",
    );
  }

  const transport = new RxNostrTransport(rxNostr);
  const resolvedFeedStateStore = feedStateStore ?? new MemoryFeedStateStore();
  const resolvedProfileView =
    profileView ?? new EventStoreProfileView(resolvedEventStore);
  const resolvedQueryRegistry =
    queryRegistry ?? createQueryRegistry({ transport });
  const coreQueryClient =
    queryClient ??
    createNostrCoreQueryClient({
      transport,
      repository: resolvedRepository,
      feedStateStore: resolvedFeedStateStore,
      queryRegistry: resolvedQueryRegistry,
    });

  return {
    transport,
    repository: resolvedRepository,
    eventStore: resolvedEventStore,
    feedStateStore: resolvedFeedStateStore,
    profileView: resolvedProfileView,
    queryRegistry: resolvedQueryRegistry,
    queryClient: coreQueryClient,
    dispose() {
      coreQueryClient.dispose();
      resolvedQueryRegistry.dispose();
      transport.dispose();
    },
  };
};

const NostrCoreContext = createContext<NostrCore>();

export type NostrCoreProviderProps = {
  core?: NostrCore;
  rxNostr?: RxNostr;
};

export const NostrCoreProvider: ParentComponent<NostrCoreProviderProps> = (
  props,
) => {
  const core = createMemo(() => {
    if (props.core) {
      return props.core;
    }
    if (!props.rxNostr) {
      throw new Error("NostrCoreProvider requires either core or rxNostr");
    }
    return createNostrCore({ rxNostr: props.rxNostr });
  });

  onCleanup(() => {
    if (!props.core) {
      core().dispose();
    }
  });

  return (
    <NostrCoreContext.Provider value={core()}>
      {props.children}
    </NostrCoreContext.Provider>
  );
};

export const useNostrCore = () => {
  const ctx = useContext(NostrCoreContext);
  if (!ctx) {
    throw new Error(
      "[context provider not found] NostrCoreProvider is not found",
    );
  }
  return ctx;
};
