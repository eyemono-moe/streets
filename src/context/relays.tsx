import { type ParentComponent, createContext, useContext } from "solid-js";
import { reconcile } from "solid-js/store";
import * as v from "valibot";
import { createLocalStore } from "../shared/libs/createLocalStore";
import { useNIP07 } from "../shared/libs/useNIP07";

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
    "wss://relay.nostr.band": {
      read: true,
      write: true,
    },
    "wss://nos.lol": {
      read: true,
      write: true,
    },
    "wss://relay.damus.io": {
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
        syncWithNIP07: () => Promise<void>;
        updateRelay: (newRelays: RelaysState["defaultRelays"]) => void;
      },
    ]
  >();

export const RelaysProvider: ParentComponent = (props) => {
  // TODO: アプリ固有データとして保存する (https://github.com/nostr-protocol/nips/blob/master/78.md)
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

  // TODO: urlの正規化を行う

  const syncWithNIP07 = async () => {
    const nip07Relays = await useNIP07().getRelays();
    setState("defaultRelays", reconcile(nip07Relays));
  };

  const updateRelay = (newRelays: RelaysState["defaultRelays"]) => {
    setState("defaultRelays", reconcile(newRelays));
  };

  return (
    <RelaysContext.Provider
      value={[
        state,
        {
          syncWithNIP07,
          updateRelay,
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
    throw new Error("[context provider not found] RelaysProvider is not found");
  }
  return ctx;
};
