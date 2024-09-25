import {
  type ParentComponent,
  Show,
  createContext,
  createResource,
  useContext,
} from "solid-js";
import { BatchSubscriber } from "../libs/batchClient";
import { useNIP07 } from "../libs/useNIP07";
import { usePool } from "../libs/usePool";

const SubscriberContext = createContext<BatchSubscriber>();

export const SubscriberProvider: ParentComponent = (props) => {
  const pool = () => usePool();
  const [subscriber] = createResource(async () => {
    const relays = await useNIP07().getRelays();
    return new BatchSubscriber(
      pool(),
      Object.entries(relays)
        .filter(([, { read }]) => read)
        .map(([relay]) => relay),
    );
  });

  return (
    <Show when={subscriber.state === "ready"}>
      <SubscriberContext.Provider value={subscriber()}>
        {props.children}
      </SubscriberContext.Provider>
    </Show>
  );
};

export const useSubscriber = () => useContext(SubscriberContext);
