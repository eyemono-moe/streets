import {
  type QueryKey,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import type { Filter, NostrEvent } from "nostr-tools";
import { useSubscriber } from "../context/subscriber";

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
// TODO: createInfiniteFilterQuery
