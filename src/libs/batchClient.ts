import {
  type Filter,
  type NostrEvent,
  type SimplePool,
  matchFilter,
} from "nostr-tools";

// TODO: 同じfilterを指定しても複数回subされてしまう

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
  private eventsMap = new Map<Filter, unknown[]>();
  private parserMap = new Map<Filter, (e: NostrEvent) => unknown>();
  // biome-ignore lint/suspicious/noExplicitAny: can't infer type
  private resolverMap = new Map<Filter, (events: any[]) => void>();
  // biome-ignore lint/suspicious/noExplicitAny: can't infer type
  private onEventMap = new Map<Filter, (event: any[]) => void>();

  constructor(pool: SimplePool, relays: string[]) {
    this.batchExecutor = new BatchExecutor({
      executor: (filters) => {
        // TODO: close
        pool.subscribeMany(relays, filters, {
          onevent: (event) => {
            for (const filter of filters) {
              if (matchFilter(filter, event)) {
                const parser = this.parserMap.get(filter);
                const events = this.eventsMap.get(filter);
                if (events) {
                  const parsed = parser ? parser(event) : event;
                  events.push(parsed);
                  this.onEventMap.get(filter)?.([...events]);
                }
              }
            }
          },
          oneose: () => {
            for (const filter of filters) {
              const resolve = this.resolverMap.get(filter);
              const events = this.eventsMap.get(filter);
              if (resolve && events) {
                resolve(events);
              }
            }
          },
        });
      },
      interval: 1000,
      size: 10,
    });
  }

  public sub<T>(
    filter: Filter,
    onEvent: (event: T[]) => void,
    parser: (e: NostrEvent) => T,
  ) {
    return new Promise<T[]>((resolve) => {
      this.eventsMap.set(filter, []);
      this.parserMap.set(filter, parser);
      this.resolverMap.set(filter, resolve);
      this.onEventMap.set(filter, onEvent);

      this.batchExecutor.push(filter);
    });
  }
}
