import type { EventParameters } from "nostr-typedef";
import {
  type LazyFilter,
  type RxNostr,
  type RxNostrOnParams,
  createRxBackwardReq,
  createRxForwardReq,
} from "rx-nostr";
import { Observable, Subscription } from "rxjs";
import type {
  NostrSubscription,
  NostrTransport,
  NostrTransportConnectionStatePacket,
  NostrTransportEventPacket,
  NostrTransportFilter,
  NostrTransportMessagePacket,
  NostrTransportPublishOptions,
  NostrTransportPublishPacket,
  NostrTransportRelayOptions,
  NostrTransportSubscribeOptions,
  RelayUrl,
} from "./transport";

export class RxNostrTransport implements NostrTransport {
  constructor(private readonly rxNostr: RxNostr) {}

  setDefaultRelays(relays: readonly RelayUrl[]): void {
    this.rxNostr.setDefaultRelays([...relays]);
  }

  subscribe(options: NostrTransportSubscribeOptions): NostrSubscription {
    const rxReq =
      options.mode === "forward" ? createRxForwardReq() : createRxBackwardReq();
    const source$ = this.rxNostr.use(rxReq, {
      on: toRxNostrOnParams(options, "read"),
    }) as Observable<NostrTransportEventPacket>;
    const subscriptions = new Subscription();
    const events$ = new Observable<NostrTransportEventPacket>((subscriber) => {
      const subscription = source$.subscribe(subscriber);
      subscriptions.add(subscription);
      return () => {
        subscription.unsubscribe();
        subscriptions.remove(subscription);
      };
    });

    return {
      events$,
      emit(filters) {
        rxReq.emit(toLazyFilters(filters));
      },
      complete() {
        if ("over" in rxReq) {
          rxReq.over();
        }
      },
      close() {
        subscriptions.unsubscribe();
        if ("over" in rxReq) {
          rxReq.over();
        }
      },
    };
  }

  publish(
    event: EventParameters,
    options?: NostrTransportPublishOptions,
  ): Observable<NostrTransportPublishPacket> {
    return this.rxNostr.send(event, {
      on: toRxNostrOnParams(options, "write"),
    }) as Observable<NostrTransportPublishPacket>;
  }

  observeMessages(): Observable<NostrTransportMessagePacket> {
    return this.rxNostr.createAllMessageObservable() as Observable<NostrTransportMessagePacket>;
  }

  observeConnectionState(): Observable<NostrTransportConnectionStatePacket> {
    return this.rxNostr.createConnectionStateObservable() as Observable<NostrTransportConnectionStatePacket>;
  }

  dispose(): void {
    this.rxNostr.dispose();
  }
}

export const subscribeToTransport = (
  transport: NostrTransport,
  options: NostrTransportSubscribeOptions,
): NostrSubscription => {
  const subscription = transport.subscribe(options);
  subscription.emit(options.filters);
  return subscription;
};

export const subscribeToTransportEvents = (
  transport: NostrTransport,
  options: NostrTransportSubscribeOptions,
  onEvent: (packet: NostrTransportEventPacket) => void,
): NostrSubscription => {
  const subscription = transport.subscribe(options);
  const observableSubscription = subscription.events$.subscribe(onEvent);
  const originalClose = subscription.close;

  return {
    events$: subscription.events$,
    emit: subscription.emit,
    complete: subscription.complete,
    close() {
      observableSubscription.unsubscribe();
      originalClose();
    },
  };
};

export const createTransportDisposer = (
  ...subscriptions: NostrSubscription[]
) => {
  const disposables = new Subscription();
  for (const subscription of subscriptions) {
    disposables.add(() => subscription.close());
  }
  return () => disposables.unsubscribe();
};

const toRxNostrOnParams = (
  options: NostrTransportRelayOptions | undefined,
  direction: "read" | "write",
): RxNostrOnParams | undefined => {
  if (!options) {
    return undefined;
  }

  const relays = options.relays ? [...options.relays] : undefined;

  return {
    relays,
    defaultReadRelays:
      direction === "read" ? (options.defaultReadRelays ?? !relays) : undefined,
    defaultWriteRelays:
      direction === "write"
        ? (options.defaultWriteRelays ?? !relays)
        : undefined,
  };
};

const toLazyFilters = (
  filters: NostrTransportFilter | readonly NostrTransportFilter[],
): LazyFilter | LazyFilter[] => {
  if (Array.isArray(filters)) {
    return filters.map((filter) => ({ ...filter }));
  }
  return { ...filters };
};
