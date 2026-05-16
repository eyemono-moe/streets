import {
  type ConnectionState,
  Nip11Registry,
  type RxNostr,
  type RxReqEmittable,
  batch,
  createRxBackwardReq,
  createRxNostr,
  filterByType,
  uniq,
} from "rx-nostr";
import { createVerificationServiceClient } from "rx-nostr-crypto";
import { bufferWhen, interval, pipe, share } from "rxjs";
import {
  type ParentComponent,
  createContext,
  createEffect,
  createMemo,
  lazy,
  onCleanup,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { isDev } from "solid-js/web";
import { projectRepositoryEvent } from "../core/db/projectors/project-event";
import { type NostrCore, createNostrCore } from "../core/solid/provider";
import type RxNostrDevtoolsComp from "../shared/components/devtools/RxNostrDevtools";
import { mergeSimilarAndRemoveEmptyFilters } from "../shared/libs/mergeFilters";
import workerUrl from "../shared/libs/verifierWorker?worker&url";
import { useRelays } from "./relays";

type Emitter = RxReqEmittable<{ relays: string[] }>["emit"];
type EmitParams = Parameters<Emitter>;

type CoreEvent = Parameters<NostrCore["repository"]["putEvent"]>[0]["event"];

export const ingestNostrCoreEvent = async (
  core: NostrCore,
  event: CoreEvent,
  relay: string,
  now = Date.now,
) => {
  await core.repository.putEvent({ event, relay });
  await projectRepositoryEvent(core.collections, event, {
    receivedAt: now(),
    seenRelays: await core.repository.getSeenRelays(event.id),
  });
};

const RxNostrContext = createContext<{
  rxNostr: RxNostr;
  core: ReturnType<typeof createNostrCore>;
  connectionState: {
    [from: string]: ConnectionState | undefined;
  };
  actions: {
    emit: Emitter;
    emitWithEOSE: (...props: EmitParams) => Promise<void>;
  };
}>();

export const RxNostrProvider: ParentComponent = (props) => {
  const client = createVerificationServiceClient({
    worker: new Worker(workerUrl, { type: "module" }),
  });
  client.start();

  onCleanup(() => {
    client.dispose();
  });

  Nip11Registry.setDefault({
    limitation: {
      max_subscriptions: 10,
    },
  });

  const rxNostr = createRxNostr({
    verifier: client.verifier,
    eoseTimeout: 10 * 1000, // 10 sec
    okTimeout: 10 * 1000,
    connectionStrategy: "lazy-keep",
    retry: { strategy: "immediately", maxCount: 1 },
    authenticator: "auto",
  });
  const core = createMemo(() => createNostrCore({ rxNostr }));

  onCleanup(() => {
    core().dispose();
  });

  const [relays] = useRelays();
  // 使用するリレーを設定
  rxNostr.setDefaultRelays(relays.defaultRelays);
  createEffect(() => {
    rxNostr.setDefaultRelays(relays.defaultRelays);
  });

  const allMessage$ = rxNostr.createAllMessageObservable().pipe(share());

  // NOTICEイベントを監視
  allMessage$.pipe(filterByType("NOTICE")).subscribe({
    next: (e) => {
      console.warn(`NOTICE from:${e.from}: ${e.notice}`);
    },
  });

  const rxBackwardReq = createRxBackwardReq();
  const emit = rxBackwardReq.emit;

  allMessage$.pipe(filterByType("EVENT"), uniq()).subscribe({
    next: (e) => {
      void ingestNostrCoreEvent(core(), e.event, e.from).catch(() => {
        // Keep the legacy rx-nostr stream alive even if v1 projection rejects.
      });
    },
  });

  const batchReq = pipe(
    bufferWhen(() => interval(1000)),
    batch((a, b) => mergeSimilarAndRemoveEmptyFilters([...a, ...b])),
    // TODO: max_filtersを尊重してchunkする
    // see: https://penpenpng.github.io/rx-nostr/ja/v3/req-packet-operators.html#chunk
  );

  // すべてのbackwardReq由来のイベント
  rxNostr.use(rxBackwardReq.pipe(batchReq)).subscribe();

  // EOSE時にresolveするemit
  const emitWithEOSE = (...props: Parameters<typeof emit>) => {
    return new Promise<void>((resolve) => {
      const backwardReq = createRxBackwardReq();
      rxNostr.use(backwardReq.pipe(batchReq)).subscribe({
        complete() {
          resolve();
        },
      });
      backwardReq.emit(...props);
      backwardReq.over();
    });
  };

  const [connectionState, setConnectionState] = createStore<{
    [from: string]: ConnectionState;
  }>(core().connectionState.getSnapshot() as Record<string, ConnectionState>);

  const connectionStateSubscription = core()
    .connectionState.observe()
    .subscribe({
      next(snapshot) {
        for (const [relay, state] of Object.entries(snapshot)) {
          if (state) {
            setConnectionState(relay, state);
          }
        }
      },
    });

  onCleanup(() => {
    connectionStateSubscription.unsubscribe();
  });

  return (
    <RxNostrContext.Provider
      value={{
        rxNostr,
        core: core(),
        connectionState,
        actions: {
          emit,
          emitWithEOSE,
        },
      }}
    >
      {props.children}
      <RxNostrDevtools core={core()} />
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

const RxNostrDevtools = isDev
  ? lazy(() => import("../shared/components/devtools/RxNostrDevtools"))
  : (_props: Parameters<typeof RxNostrDevtoolsComp>[0]) => null;
