import {
  type Filter,
  type NostrEvent,
  type SimplePool,
  matchFilter,
} from "nostr-tools";

export type BatchExecutorConstructor<Req> = {
  executor: (reqs: Req[]) => void;
  interval: number;
  size: number;
};

export class BatchExecutor<Req> {
  private executor: (reqs: Req[]) => void;
  private interval: number;
  private size: number;
  private queue: Req[] = [];
  private timer: number | null = null;

  constructor({ executor, interval, size }: BatchExecutorConstructor<Req>) {
    this.executor = executor;
    this.interval = interval;
    this.size = size;
  }

  public push(req: Req) {
    this.queue.push(req);

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

  private flush() {
    this.executor(this.queue);
    this.queue = [];
  }
}

export class BatchSubscriber {
  private batchExecutor: BatchExecutor<Filter>;
  private eventsMap = new Map<string, unknown[]>();
  private parserMap = new Map<string, (e: NostrEvent) => unknown>();
  // biome-ignore lint/suspicious/noExplicitAny: can't infer type
  private resolversMap = new Map<string, ((events: any[]) => void)[]>();
  // biome-ignore lint/suspicious/noExplicitAny: can't infer type
  private onEventMap = new Map<string, ((event: any[]) => void) | undefined>();
  private closeOnEOSMap = new Map<string, boolean>();

  constructor(pool: SimplePool, relays: string[]) {
    this.batchExecutor = new BatchExecutor({
      executor: (filters) => {
        // TODO: close

        if (filters.length === 0) {
          return;
        }
        const sub = pool.subscribeMany(relays, filters, {
          onevent: (event) => {
            for (const filter of filters) {
              if (matchFilter(filter, event)) {
                const parser = this.parserMap.get(serializeFilter(filter));
                const events = this.eventsMap.get(serializeFilter(filter));
                if (events) {
                  const parsed = parser ? parser(event) : event;
                  events.push(parsed);
                  this.onEventMap.get(serializeFilter(filter))?.([...events]);
                }
              }
            }
          },
          oneose: () => {
            for (const filter of filters) {
              const resolvers = this.resolversMap.get(serializeFilter(filter));
              const events = this.eventsMap.get(serializeFilter(filter));
              const closeOnEOS = this.closeOnEOSMap.get(
                serializeFilter(filter),
              );

              if (resolvers && events) {
                for (const resolver of resolvers) {
                  resolver(events);
                }
              }
              if (closeOnEOS) {
                sub.close();
              }
            }
          },
        });
      },
      interval: 2000,
      size: 10,
    });
  }

  public sub<T>({
    filter,
    parser,
    onEvent,
    closeOnEOS = true,
  }: {
    filter: Filter;
    parser: (e: NostrEvent) => T;
    onEvent?: (event: T[]) => void;
    closeOnEOS?: boolean;
  }) {
    return new Promise<T[]>((resolve) => {
      if (!this.resolversMap.has(serializeFilter(filter))) {
        this.resolversMap.set(serializeFilter(filter), []);
      }
      this.resolversMap.get(serializeFilter(filter))?.push(resolve);

      if (!this.eventsMap.has(serializeFilter(filter))) {
        this.eventsMap.set(serializeFilter(filter), []);
        this.parserMap.set(serializeFilter(filter), parser);
        this.onEventMap.set(serializeFilter(filter), onEvent);
        this.closeOnEOSMap.set(serializeFilter(filter), closeOnEOS);

        this.batchExecutor.push(filter);
      }
    });
  }
}

const serializeFilter = (filter: Filter) => {
  return JSON.stringify({
    ...filter,
    ids: filter.ids?.sort(),
    kinds: filter.kinds?.sort(),
    authors: filter.authors?.sort(),
  });
};
