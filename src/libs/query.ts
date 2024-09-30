import {
  type QueryKey,
  createInfiniteQuery,
  createQueries,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import type { Filter, NostrEvent } from "nostr-tools";
import { useSubscriber } from "../context/subscriber";
import {
  type ComparableEvent,
  pickLatestEvent,
  pickLatestEventByPubkey,
} from "./latestEvent";

export const createFilterQuery = <T>(
  props: () => {
    filters: Filter[];
    keys: QueryKey;
    parser: (e: NostrEvent) => T;
    enable?: boolean;
    closeOnEOS?: boolean;
  },
) => {
  const queryClient = useQueryClient();
  const subscriber = useSubscriber();
  if (!subscriber) {
    throw new Error("Subscriber not found");
  }
  return createQuery(() => ({
    queryKey: props().keys,
    queryFn: () =>
      subscriber.sub({
        filters: props().filters,
        parser: props().parser,
        onEvent: (events) => {
          queryClient.setQueryData(props().keys, events);
        },
        closeOnEOS: props().closeOnEOS,
      }),
    enabled: props().enable,
  }));
};

export const createLatestFilterQuery = <T extends ComparableEvent>(
  props: () => {
    filters: Filter[];
    keys: QueryKey;
    parser: (e: NostrEvent) => T;
    enable?: boolean;
    closeOnEOS?: boolean;
    immediate?: boolean;
  },
) => {
  const queryClient = useQueryClient();
  const subscriber = useSubscriber();
  if (!subscriber) {
    throw new Error("Subscriber not found");
  }
  return createQuery(() => ({
    queryKey: props().keys,
    queryFn: async () => {
      const events = await subscriber.sub({
        filters: props().filters,
        parser: props().parser,
        onEvent: (events) => {
          queryClient.setQueryData(props().keys, pickLatestEvent(events));
        },
        closeOnEOS: props().closeOnEOS,
        immediate: props().immediate,
      });
      return pickLatestEvent(events);
    },
    enabled: props().enable,
  }));
};

export const createLatestFilterQueries = <T extends ComparableEvent>(
  props: () => {
    filters: Filter[];
    keys: QueryKey;
    parser: (e: NostrEvent) => T;
    enable?: boolean;
    closeOnEOS?: boolean;
    immediate?: boolean;
  }[],
) => {
  const queryClient = useQueryClient();
  const subscriber = useSubscriber();
  if (!subscriber) {
    throw new Error("Subscriber not found");
  }
  return createQueries(() => ({
    queries: props().map((p) => ({
      queryKey: p.keys,
      queryFn: async () => {
        const events = await subscriber.sub({
          filters: p.filters,
          parser: p.parser,
          onEvent: (events) => {
            queryClient.setQueryData(p.keys, pickLatestEvent(events));
          },
          closeOnEOS: p.closeOnEOS,
          immediate: p.immediate,
        });
        return pickLatestEvent(events);
      },
      enabled: p.enable,
    })),
  }));
};

export const createLatestByPubkeyQuery = <
  T extends ComparableEvent & {
    pubkey: string;
  },
>(
  props: () => {
    filters: Filter[];
    keys: QueryKey;
    parser: (e: NostrEvent) => T;
    enable?: boolean;
    closeOnEOS?: boolean;
  },
) => {
  const subscriber = useSubscriber();
  if (!subscriber) {
    throw new Error("Subscriber not found");
  }
  return createQuery(() => ({
    queryKey: props().keys,
    queryFn: async () => {
      const events = await subscriber.sub({
        filters: props().filters,
        parser: props().parser,
        closeOnEOS: props().closeOnEOS,
      });
      return pickLatestEventByPubkey(events);
    },
    enabled: props().enable,
  }));
};

export const createInfiniteFilterQuery = <T extends ComparableEvent>(
  props: () => {
    filter: Filter;
    keys: QueryKey;
    parser: (e: NostrEvent) => T;
    enable?: boolean;
  },
) => {
  const subscriber = useSubscriber();
  if (!subscriber) {
    throw new Error("Subscriber not found");
  }

  return createInfiniteQuery(() => ({
    queryKey: props().keys,
    queryFn: async ({ pageParam }) => {
      const res = await subscriber.sub({
        filters: [
          {
            ...props().filter,
            until: pageParam.until,
            since: pageParam.since,
          },
        ],
        parser: props().parser,
      });
      return res;
    },
    // リレー毎に保存されているイベントが異なるので複数のリレーから limit で取ってくるとかなり古いイベントが含まれることがある
    // TODO: limitを使わずにsince/untilで取得するか、すべてのリレーのEOSEを待ってlimit件数を超えたものを削る必要がある
    // see: nostr:note1u0tjptue0p2dkd420dtgneg4z5yysaw0u0ht9a3tt9snzu8kdk7s2fs4uf
    initialPageParam: {
      until: Math.floor(new Date().getTime() / 1000),
      since: Math.floor(new Date().getTime() / 1000) - 60 * 60 * 1, // 1 hours
    },
    // @ts-ignore: TS6133
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      // 最後に使用したsinceから1時間前まで取得
      return {
        until: lastPageParam.since,
        since: lastPageParam.since - 60 * 60 * 1, // 1 hours
      };
    },
    enabled: props().enable,
  }));
};
