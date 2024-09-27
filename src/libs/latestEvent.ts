export interface ComparableEvent {
  created_at: number;
  id: string;
}

export const compareEvents = <
  T extends ComparableEvent,
  U extends ComparableEvent,
>(
  a: T,
  b: U,
): number => {
  const diff = a.created_at - b.created_at;
  if (diff !== 0) return diff;
  return -a.id.localeCompare(b.id);
};

export const pickLatestEvent = <T extends ComparableEvent>(
  events: T[],
): T | undefined => {
  if (events.length === 0) return undefined;
  if (events.length === 1) return events[0];
  return events.reduce((a, b) => (compareEvents(a, b) > 0 ? a : b));
};

export const pickLatestEventByPubkey = <
  T extends ComparableEvent & {
    pubkey: string;
  },
>(
  events: T[],
): Map<string, T> | undefined => {
  const a = events.reduce<Map<string, T>>((map, event) => {
    const current = map.get(event.pubkey);
    if (!current) {
      map.set(event.pubkey, event);
      return map;
    }

    if (compareEvents(event, current) > 0) {
      map.set(event.pubkey, event);
    }
    return map;
  }, new Map());
  return a;
};

export const sortEvents = <T extends ComparableEvent>(events: T[]) =>
  Array.from(events).sort((a, b) => -compareEvents(a, b));
