import type { EventFeedStrategy } from "../db/types";
import type { RelayUrl } from "../repository/nostr-repository";
import type { NostrTransportFilter } from "../transport/transport";

export type EventFeedDefinition = {
  id: string;
  filters: NostrTransportFilter | readonly NostrTransportFilter[];
  strategy: EventFeedStrategy;
  relays?: readonly RelayUrl[];
  limit?: number;
};

const isFilterArray = (
  filters: NostrTransportFilter | readonly NostrTransportFilter[],
): filters is readonly NostrTransportFilter[] => Array.isArray(filters);

const applyCursor = (
  filter: NostrTransportFilter,
  cursor: Partial<Pick<NostrTransportFilter, "limit" | "since" | "until">>,
): NostrTransportFilter => ({ ...filter, ...cursor });

export const withBackfillCursor = (
  filters: NostrTransportFilter | readonly NostrTransportFilter[],
  until?: number,
  limit?: number,
): NostrTransportFilter | readonly NostrTransportFilter[] => {
  const cursor = {
    ...(limit === undefined ? {} : { limit }),
    ...(until === undefined ? {} : { until }),
  };

  if (isFilterArray(filters)) {
    return filters.map((filter) => applyCursor(filter, cursor));
  }

  return applyCursor(filters, cursor);
};

export const withLiveCursor = (
  filters: NostrTransportFilter | readonly NostrTransportFilter[],
  since: number,
): NostrTransportFilter | readonly NostrTransportFilter[] => {
  const cursor = { since };

  if (isFilterArray(filters)) {
    return filters.map((filter) => applyCursor(filter, cursor));
  }

  return applyCursor(filters, cursor);
};
