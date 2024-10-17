import { normalizeURL } from "nostr-tools/utils";
import {
  type ConnectionState,
  Nip11Registry,
  type RxNostr,
  type RxReqEmittable,
  batch,
  createRxBackwardReq,
  createRxNostr,
  filterByType,
  latestEach,
} from "rx-nostr";
import { verifier } from "rx-nostr-crypto";
import { bufferWhen, interval } from "rxjs";
import {
  type ParentComponent,
  createContext,
  createEffect,
  lazy,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { isDev } from "solid-js/web";
import type RxNostrDevtoolsComp from "../shared/components/devtools/RxNostrDevtools";
import { mergeSimilarAndRemoveEmptyFilters } from "../shared/libs/mergeFilters";
import { cacheAndEmitRelatedEvent } from "../shared/libs/query";
import { eventCacheSetter } from "./eventCache";
import { useRelays } from "./relays";

const RxNostrContext = createContext<{
  rxNostr: RxNostr;
  rxBackwardReq: ReturnType<typeof createRxBackwardReq>;
  connectionState: {
    [from: string]: ConnectionState | undefined;
  };
  actions: {
    emit: RxReqEmittable<{ relays: string[] }>["emit"];
  };
}>();

export const RxNostrProvider: ParentComponent = (props) => {
  Nip11Registry.setDefault({
    limitation: {
      max_subscriptions: 10,
    },
  });

  const rxNostr = createRxNostr({
    verifier,
    eoseTimeout: 10 * 1000, // 10 sec
    okTimeout: 10 * 1000,
    connectionStrategy: "lazy-keep",
    retry: { strategy: "immediately", maxCount: 1 },
    authenticator: "auto",
  });

  const [relays] = useRelays();
  // 使用するリレーを設定
  rxNostr.setDefaultRelays(relays.defaultRelays);
  createEffect(() => {
    rxNostr.setDefaultRelays(relays.defaultRelays);
  });

  rxNostr
    .createAllMessageObservable()
    .pipe(filterByType("NOTICE"))
    .subscribe({
      next: (e) => {
        console.warn(`NOTICE from:${e.from}: ${e.notice}`);
      },
    });

  const rxBackwardReq = createRxBackwardReq();
  const emit = rxBackwardReq.emit;
  const setter = eventCacheSetter();

  // すべてのbackwardReq由来のイベント
  rxNostr
    .use(
      rxBackwardReq.pipe(
        bufferWhen(() => interval(1000)),
        batch((a, b) => mergeSimilarAndRemoveEmptyFilters([...a, ...b])),
      ),
    )
    .pipe(latestEach((e) => e.event.id))
    .subscribe({
      next: (e) => {
        cacheAndEmitRelatedEvent(e, emit, setter);
      },
    });

  const [connectionState, setConnectionState] = createStore<{
    [from: string]: ConnectionState;
  }>({});

  rxNostr.createConnectionStateObservable().subscribe({
    next(e) {
      setConnectionState(normalizeURL(e.from), e.state);
    },
  });

  return (
    <RxNostrContext.Provider
      value={{
        rxNostr,
        rxBackwardReq,
        connectionState,
        actions: {
          emit,
        },
      }}
    >
      {props.children}
      <RxNostrDevtools />
    </RxNostrContext.Provider>
  );
};

export const useRxNostr = () => {
  const ctx = useContext(RxNostrContext);
  if (!ctx) {
    throw new Error(
      "[context provider not found] RxNostrProvider is not found",
    );
  }
  return ctx;
};

const RxNostrDevtools: typeof RxNostrDevtoolsComp = isDev
  ? lazy(() => import("../shared/components/devtools/RxNostrDevtools"))
  : () => null;
