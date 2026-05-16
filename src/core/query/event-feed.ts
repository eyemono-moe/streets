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

export const withBackfillCursor = (
  filters: NostrTransportFilter | readonly NostrTransportFilter[],
  until?: number,
): NostrTransportFilter | readonly NostrTransportFilter[] => {
  if (until === undefined) {
    return filters;
  }

  if (Array.isArray(filters)) {
    return filters.map((filter) => ({ ...filter, until }));
  }

  return { ...filters, until };
};
