import {
  type QueryKey,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import type { Filter, NostrEvent } from "nostr-tools";
import { useSubscriber } from "../context/subscriber";
import { type ComparableEvent, pickLatestEvent } from "./latestEvent";

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
      subscriber.sub(
        filter(),
        (events) => {
          queryClient.setQueryData(keys(), events);
        },
        parser,
      ),
    enabled: enable(),
  }));
};

// TODO: createLatestFilterQuery

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
      const events = await subscriber.sub(
        filter(),
        (events) => {
          queryClient.setQueryData(keys(), pickLatestEvent(events));
        },
        parser,
      );
      return pickLatestEvent(events);
    },
    enabled: enable(),
  }));
};

// TODO: createInfiniteFilterQuery
