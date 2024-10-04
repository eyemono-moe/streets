import { createDraggable } from "@neodrag/solid";
import {
  type ConnectionState,
  Nip11Registry,
  type RxNostr,
  createRxNostr,
  filterByType,
} from "rx-nostr";
import { verifier } from "rx-nostr-crypto";
import { scan } from "rxjs";
import {
  For,
  type ParentComponent,
  createContext,
  createEffect,
  from,
  useContext,
} from "solid-js";
import { useRelays } from "./relays";

const RxNostrContext = createContext<RxNostr>();

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

  return (
    <RxNostrContext.Provider value={rxNostr}>
      {props.children}
    </RxNostrContext.Provider>
  );
};

export const useRxNostr = () => {
  const ctx = useContext(RxNostrContext);
  if (!ctx) {
    throw new Error("RxNostrProvider is not found");
  }
  return ctx;
};

export const RxNostrDevtools = () => {
  const rxNostr = useRxNostr();

  const connectionState = from(
    rxNostr.createConnectionStateObservable().pipe(
      scan(
        (acc, v) => {
          acc[v.from] = v.state;
          return acc;
        },
        {} as {
          [from: string]: ConnectionState;
        },
      ),
    ),
  );

  // @ts-ignore: TS6133 typescript can't detect use: directive
  const { draggable } = createDraggable();

  return (
    <div class="pointer-events-none fixed right-0 bottom-0 w-fit p-10">
      <div
        use:draggable={{
          bounds: "body",
        }}
        class="pointer-events-auto w-fit rounded bg-white/75 p-2 shadow backdrop-blur"
      >
        rxNostr ConnectionState
        <div class="b-1 grid divide-y">
          <div class="grid-col-span-2 grid grid-cols-subgrid divide-x">
            <div class="p-1">relay</div>
            <div class="p-1">state</div>
          </div>
          <For each={Object.entries(connectionState() ?? {})}>
            {([relay, state]) => (
              <div class="grid-col-span-2 grid grid-cols-subgrid divide-x">
                <div class="p-1">{relay}</div>
                <div class="p-1">{state}</div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};
