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
  closeOnEOS: boolean;
} & Filter)[];
export class BatchSubscriber {
  private batchExecutor: BatchExecutor<Req>;
  public eventsMap = new Map<string, unknown[]>();
  private parserMap = new Map<string, (e: NostrEvent) => unknown>();
  // biome-ignore lint/suspicious/noExplicitAny: can't infer type
  private resolversMap = new Map<string, ((events: any[]) => void)[]>();
  // biome-ignore lint/suspicious/noExplicitAny: can't infer type
  private onEventMap = new Map<string, ((event: any[]) => void) | undefined>();

  public originalReqMap = new Map<string, Req[]>();
  public originalReqs: Req[] = [];

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
        const mergedRequests = requests.flat();
        this.originalReqMap.set(stringify(mergedRequests), [
          ...this.originalReqs,
        ]);
        this.originalReqs = [];

        const filtersMap = new Map<
          string,
          { filters: Filter[]; relay?: string; closeOnEOS: boolean }
        >();
        for (const request of mergedRequests) {
          const key = stringify([request.relay, request.closeOnEOS]);
          if (!filtersMap.has(key)) {
            filtersMap.set(key, {
              filters: [],
              relay: request.relay,
              closeOnEOS: request.closeOnEOS,
            });
          }
          const { relay, closeOnEOS, ...filter } = request;
          filtersMap.get(key)?.filters.push(filter);
        }

        for (const { relay, filters, closeOnEOS } of filtersMap.values()) {
          const relays = relay ? [relay] : getReadRelays();

          const sub = pool.subscribeMany(relays, filters, {
            onevent: (event) => {
              const originalReqs = this.originalReqMap.get(
                stringify(mergedRequests),
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
              const originalReqMapKey = stringify(mergedRequests);
              const originalReqs = this.originalReqMap.get(originalReqMapKey);
              if (!originalReqs) {
                console.error("originalReqs not found");
                sub.close();
                return;
              }

              for (const req of originalReqs) {
                const mapKey = stringify(req);
                const resolvers = this.resolversMap.get(mapKey);
                const events = this.eventsMap.get(mapKey);

                if (resolvers && events) {
                  for (const resolver of resolvers) {
                    resolver(events);
                  }
                  this.resolversMap.delete(mapKey);
                }
              }
              if (closeOnEOS) {
                sub.close();
                for (const req of originalReqs) {
                  const mapKey = stringify(req);
                  this.eventsMap.delete(mapKey);
                  this.parserMap.delete(mapKey);
                  this.onEventMap.delete(mapKey);
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
      const req: Req = filters.map((f) => ({ relay, closeOnEOS, ...f }));
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
