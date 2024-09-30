import {
  type Filter,
  type NostrEvent,
  type SimplePool,
  matchFilter,
} from "nostr-tools";
import stringify from "safe-stable-stringify";
import { useRelays } from "../context/relays";
import { mergeSimilarAndRemoveEmptyFilters } from "./mergeFilters";

export type BatchExecutorConstructor<Req> = {
  executor: (reqs: Req[]) => void;
  interval: number;
  size: number;
  squash?: (reqs: Req[]) => Req[];
  onPush?: (req: Req) => void;
};

export class BatchExecutor<Req> {
  private executor: (reqs: Req[]) => void;
  private interval: number;
  private size: number;
  private queue: Req[] = [];
  private timer: number | null = null;
  private squash: ((reqs: Req[]) => Req[]) | undefined;
  private onPush: ((req: Req) => void) | undefined;

  constructor({
    executor,
    interval,
    size,
    squash,
    onPush,
  }: BatchExecutorConstructor<Req>) {
    this.executor = executor;
    this.interval = interval;
    this.size = size;
    this.squash = squash;
    this.onPush = onPush;
  }

  public push(req: Req) {
    this.onPush?.(req);

    if (this.squash) {
      this.queue = this.squash([...this.queue, req]);
    } else {
      this.queue.push(req);
    }

    if (this.queue.length >= this.size) {
      this.flush();
    } else if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.flush();
        this.stopTimer();
      }, this.interval);
    }
  }

  private stopTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public flush() {
    this.executor(this.queue);
    this.queue = [];
  }
}

type Req = ({
  relay?: string;
} & Filter)[];
export class BatchSubscriber {
  private batchExecutor: BatchExecutor<Req>;
  private eventsMap = new Map<string, unknown[]>();
  private parserMap = new Map<string, (e: NostrEvent) => unknown>();
  // biome-ignore lint/suspicious/noExplicitAny: can't infer type
  private resolversMap = new Map<string, ((events: any[]) => void)[]>();
  // biome-ignore lint/suspicious/noExplicitAny: can't infer type
  private onEventMap = new Map<string, ((event: any[]) => void) | undefined>();
  private closeOnEOSMap = new Map<string, boolean>();

  private originalReqMap = new Map<string, Req[]>();
  private originalReqs: Req[] = [];

  constructor(pool: SimplePool) {
    const [, { getReadRelays }] = useRelays();

    this.batchExecutor = new BatchExecutor({
      onPush: (req) => {
        this.originalReqs.push(req);
      },
      squash: (requests) => [
        mergeSimilarAndRemoveEmptyFilters(requests.flat()),
      ],
      executor: (requests) => {
        const mergedFilters = requests.flat();
        this.originalReqMap.set(stringify(mergedFilters), [
          ...this.originalReqs,
        ]);
        this.originalReqs = [];

        const relayFilterMap = mergedFilters.reduce<
          {
            relay?: string;
            /** merged filters */
            filters: Filter[];
          }[]
        >((acc, filter) => {
          const relay = filter.relay;
          const existing = acc.find((f) => f.relay === relay);
          if (existing) {
            existing.filters.push(filter);
          } else {
            acc.push({ relay, filters: [filter] });
          }
          return acc;
        }, []);

        for (const { relay, filters } of relayFilterMap) {
          const relays = relay ? [relay] : getReadRelays();

          const sub = pool.subscribeMany(relays, filters, {
            onevent: (event) => {
              const originalReqs = this.originalReqMap.get(
                stringify(mergedFilters),
              );
              if (!originalReqs) {
                console.error("originalReqs not found");
                sub.close();
                return;
              }
              for (const req of originalReqs) {
                if (req.some((f) => matchFilter(f, event))) {
                  const mapKey = stringify(req);
                  const parser = this.parserMap.get(mapKey);
                  const events = this.eventsMap.get(mapKey);
                  if (events) {
                    const parsed = parser ? parser(event) : event;
                    events.push(parsed);
                    this.onEventMap.get(mapKey)?.([...events]);
                  }
                }
              }
            },
            oneose: () => {
              const originalReqMapKey = stringify(mergedFilters);
              const originalReqs = this.originalReqMap.get(originalReqMapKey);
              if (!originalReqs) {
                console.error("originalReqs not found");
                sub.close();
                return;
              }

              let close = true;
              for (const req of originalReqs) {
                const mapKey = stringify(req);
                const resolvers = this.resolversMap.get(mapKey);
                const events = this.eventsMap.get(mapKey);
                const closeOnEOS = this.closeOnEOSMap.get(mapKey) ?? true;
                close = close && closeOnEOS;

                if (resolvers && events) {
                  for (const resolver of resolvers) {
                    resolver(events);
                  }
                  this.resolversMap.delete(mapKey);
                }
              }
              if (close) {
                sub.close();
                for (const req of originalReqs) {
                  const mapKey = stringify(req);
                  this.eventsMap.delete(mapKey);
                  this.parserMap.delete(mapKey);
                  this.onEventMap.delete(mapKey);
                  this.closeOnEOSMap.delete(mapKey);
                }
                this.originalReqMap.delete(originalReqMapKey);
              }
            },
          });
        }
      },
      interval: 2000,
      size: 10,
    });
  }

  public sub<T>({
    filters,
    relay,
    parser,
    onEvent,
    closeOnEOS = true,
    immediate = false,
  }: {
    /** original filter */
    filters: Filter[];
    relay?: string;
    parser: (e: NostrEvent) => T;
    onEvent?: (event: T[]) => void;
    closeOnEOS?: boolean;
    /** Immediately fetch the data */
    immediate?: boolean;
  }) {
    return new Promise<T[]>((resolve) => {
      const req: Req = filters.map((f) => ({ relay, ...f }));
      const mapKey = stringify(req);

      if (!this.resolversMap.has(mapKey)) {
        this.resolversMap.set(mapKey, []);
      }
      this.resolversMap.get(mapKey)?.push(resolve);

      if (!this.eventsMap.has(mapKey)) {
        // no cache
        this.eventsMap.set(mapKey, []);
        this.parserMap.set(mapKey, parser);
        this.onEventMap.set(mapKey, onEvent);
        this.closeOnEOSMap.set(mapKey, closeOnEOS);

        this.batchExecutor.push(req);

        if (immediate) {
          this.batchExecutor.flush();
        }
      } else {
        // cache hit
        const events = this.eventsMap.get(mapKey) as T[];
        if (events) {
          resolve(events);
        }
      }
    });
  }
}
