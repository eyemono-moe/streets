import { type ParentComponent, createContext, useContext } from "solid-js";
import { reconcile } from "solid-js/store";
import * as v from "valibot";
import { createLocalStore } from "../libs/createLocalStore";
import { useNIP07 } from "../libs/useNIP07";

const relaysState = v.object({
  version: v.literal("0.0"),
  defaultRelays: v.record(
    v.string(),
    v.object({
      read: v.boolean(),
      write: v.boolean(),
    }),
  ),
});

type RelaysState = v.InferOutput<typeof relaysState>;

const initialState: RelaysState = {
  version: "0.0",
  defaultRelays: {
    "wss://relay.nostr.band/": {
      read: true,
      write: true,
    },
    "wss://nos.lol/": {
      read: true,
      write: true,
    },
    "wss://relay.damus.io/": {
      read: true,
      write: true,
    },
  },
};

const RelaysContext =
  createContext<
    [
      state: RelaysState,
      actions: {
        getReadRelays: () => string[];
        syncWithNIP07: () => Promise<void>;
        // add
        // remove
      },
    ]
  >();

export const RelaysProvider: ParentComponent = (props) => {
  const [state, setState] = createLocalStore(
    "monostr.relays",
    initialState,
    (str) => {
      const res = v.safeParse(relaysState, JSON.parse(str));
      if (res.success) {
        return res.output;
      }
      console.error(res.issues);
      return initialState;
    },
  );

  const getReadRelays = () =>
    Object.entries(state.defaultRelays)
      .filter(([, { read }]) => read)
      .map(([relay]) => relay);

  const syncWithNIP07 = async () => {
    const nip07Relays = await useNIP07().getRelays();
    setState("defaultRelays", reconcile(nip07Relays));
  };

  // onMount(() => {
  //   syncWithNIP07();
  // });

  return (
    <RelaysContext.Provider
      value={[
        state,
        {
          getReadRelays,
          syncWithNIP07,
        },
      ]}
    >
      {props.children}
    </RelaysContext.Provider>
  );
};

export const useRelays = () => {
  const ctx = useContext(RelaysContext);
  if (!ctx) {
    throw new Error("RelaysProvider is not found");
  }
  return ctx;
};
