import {
  type QueryKey,
  createInfiniteQuery,
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
  filter: () => Filter,
  keys: () => QueryKey,
  parser: (e: NostrEvent) => T,
  enable: () => boolean = () => true,
) => {
  const queryClient = useQueryClient();
  const subscriber = useSubscriber();
  if (!subscriber) {
    throw new Error("Subscriber not found");
  }
  return createQuery(() => ({
    queryKey: keys(),
    queryFn: () =>
      subscriber.sub({
        filter: filter(),
        parser,
        onEvent: (events) => {
          queryClient.setQueryData(keys(), events);
        },
      }),
    enabled: enable(),
  }));
};

export const createLatestFilterQuery = <T extends ComparableEvent>(
  filter: () => Filter,
  keys: () => QueryKey,
  parser: (e: NostrEvent) => T,
  enable: () => boolean = () => true,
) => {
  const queryClient = useQueryClient();
  const subscriber = useSubscriber();
  if (!subscriber) {
    throw new Error("Subscriber not found");
  }
  return createQuery(() => ({
    queryKey: keys(),
    queryFn: async () => {
      const events = await subscriber.sub({
        filter: filter(),
        parser,
        onEvent: (events) => {
          queryClient.setQueryData(keys(), pickLatestEvent(events));
        },
      });
      return pickLatestEvent(events);
    },
    enabled: enable(),
  }));
};

export const createLatestByPubkeyQuery = <
  T extends ComparableEvent & {
    pubkey: string;
  },
>(
  filter: () => Filter,
  keys: () => QueryKey,
  parser: (e: NostrEvent) => T,
  enable: () => boolean = () => true,
) => {
  const subscriber = useSubscriber();
  if (!subscriber) {
    throw new Error("Subscriber not found");
  }
  return createQuery(() => ({
    queryKey: keys(),
    queryFn: async () => {
      const events = await subscriber.sub({
        filter: filter(),
        parser,
      });
      return pickLatestEventByPubkey(Array.from(events.values()));
    },
    enabled: enable(),
  }));
};

export const createInfiniteFilterQuery = <T extends ComparableEvent>(
  filter: () => Filter,
  keys: () => QueryKey,
  parser: (e: NostrEvent) => T,
  enable: () => boolean = () => true,
  limit = 50,
) => {
  const subscriber = useSubscriber();
  if (!subscriber) {
    throw new Error("Subscriber not found");
  }

  return createInfiniteQuery(() => ({
    queryKey: keys(),
    queryFn: async ({ pageParam: until }) => {
      const res = await subscriber.sub({
        filter: {
          ...filter(),
          limit,
          until,
        },
        parser,
      });
      return res;
    },
    initialPageParam: Math.floor(new Date().getTime() / 1000),
    getNextPageParam: (lastPage) => {
      const minCreatedAt = Math.min(...lastPage.map((e) => e.created_at)) - 1;
      return minCreatedAt;
    },
    enabled: enable(),
  }));
};
